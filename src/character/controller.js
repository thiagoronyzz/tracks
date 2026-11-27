// Controlador cinemático do personagem sobre Rapier (KinematicCharacterController).
// Toda a locomoção passa por passos fixos para o comportamento ser idêntico
// em qualquer framerate.

import * as THREE from 'three';
import { clamp, damp, dampAngle, smoothstep } from '../core/math.js';

export const PHYS_DT = 1 / 120;

const STAND = { radius: 0.3, halfHeight: 0.6 };   // altura total 1.80
const CROUCH = { radius: 0.3, halfHeight: 0.395 }; // altura total 1.39

export const TUNING = {
  walkSpeed: 1.78,
  runSpeed: 3.95,
  crouchSpeed: 0.95,
  groundAccel: 22,
  groundDecel: 26,
  airAccel: 7,
  gravity: 12.8,
  jumpSpeed: 4.45,
  jumpCutFactor: 0.55,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  turnRate: 11,
  turnRateAir: 4.5,
  staminaDrain: 0.135,
  staminaRegen: 0.22,
  standHeight: STAND.halfHeight * 2 + STAND.radius * 2,
  crouchHeight: CROUCH.halfHeight * 2 + CROUCH.radius * 2,
};

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _rayDir = new THREE.Vector3(0, -1, 0);
const _rayUp = new THREE.Vector3(0, 1, 0);

export class PlayerController {
  constructor({ RAPIER, world, terrain, spawn = { x: 0, z: 0 } }) {
    this.RAPIER = RAPIER;
    this.world = world;
    this.terrain = terrain;
    this.radius = STAND.radius;
    this.halfHeight = STAND.halfHeight;
    this.crouching = false;
    this.crouchAmount = 0;
    this.velocity = new THREE.Vector3();
    this.grounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.yaw = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.airTime = 0;
    this.coyote = 0;
    this.jumpBufferTimer = 0;
    this.jumpHeldLast = false;
    this.landingImpact = 0;
    this.landingTimer = 0;
    this.stepped = false;
    this.slopeAngle = 0;
    this.distance = 0;
    this.lastGroundY = 0;
    this.justLanded = null;
    this.justJumped = false;
    this.justStepped = false;

    const groundY = terrain.heightAt(spawn.x, spawn.z);
    const feetY = groundY + 0.02;
    this.position = new THREE.Vector3(
      spawn.x,
      feetY + this.halfHeight + this.radius,
      spawn.z
    );
    this.feetY = feetY;

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(this.position.x, this.position.y, this.position.z)
    );
    this._createCollider();

    this.controller = world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(0.42, 0.16, true);
    this.controller.enableSnapToGround(0.4);
    this.controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((38 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(80);
    this.controller.setSlideEnabled(true);

    this._filterGroups = undefined;
    this._queryFilter = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
  }

  _createCollider() {
    const desc = this.RAPIER.ColliderDesc.capsule(this.halfHeight, this.radius)
      .setFriction(0.4)
      .setRestitution(0);
    if (this.collider) {
      this.world.removeCollider(this.collider, false);
    }
    this.collider = this.world.createCollider(desc, this.body);
  }

  get feet() {
    return new THREE.Vector3(
      this.position.x,
      this.position.y - this.halfHeight - this.radius,
      this.position.z
    );
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get height() {
    return this.halfHeight * 2 + this.radius * 2;
  }

  /**
   * @param {number} dt passo fixo
   * @param {object} input { moveX, moveZ, jumpPressed, jumpHeld, crouch, run, cameraYaw }
   */
  step(dt, input) {
    const T = TUNING;

    // --- estado de agachado -------------------------------------------------
    const wantCrouch = !!input.crouch;
    // a cápsula de colisão é mantida (agachar é visual + velocidade): trocar o
    // formato em tempo real descasa o colisor do controlador cinemático.
    this.crouching = wantCrouch;
    this.crouchAmount = damp(this.crouchAmount, this.crouching ? 1 : 0, 14, dt);

    // --- entrada -> direção no mundo ---------------------------------------
    let ix = input.moveX || 0;
    let iz = input.moveZ || 0;
    const inLen = Math.hypot(ix, iz);
    if (inLen > 1) {
      ix /= inLen;
      iz /= inLen;
    }
    const camYaw = input.cameraYaw || 0;
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    // frente da câmera = (sin, cos) no plano XZ
    const wx = ix * cos + iz * sin;
    const wz = -ix * sin + iz * cos;
    const wishLen = Math.min(1, Math.hypot(wx, wz));

    const wantRun = !!input.run && !this.crouching && this.stamina > 0.02;
    let targetSpeed = this.crouching ? T.crouchSpeed : wantRun ? T.runSpeed : T.walkSpeed;
    targetSpeed *= wishLen;

    const targetVX = wishLen > 1e-4 ? (wx / Math.max(1e-5, Math.hypot(wx, wz))) * targetSpeed : 0;
    const targetVZ = wishLen > 1e-4 ? (wz / Math.max(1e-5, Math.hypot(wx, wz))) * targetSpeed : 0;

    // --- aceleração ---------------------------------------------------------
    const accel = this.grounded
      ? (wishLen > 1e-4 ? T.groundAccel : T.groundDecel)
      : T.airAccel;
    const dx = targetVX - this.velocity.x;
    const dz = targetVZ - this.velocity.z;
    const dist = Math.hypot(dx, dz);
    const maxStep = accel * dt;
    if (dist > 1e-6) {
      if (dist <= maxStep) {
        this.velocity.x = targetVX;
        this.velocity.z = targetVZ;
      } else {
        this.velocity.x += (dx / dist) * maxStep;
        this.velocity.z += (dz / dist) * maxStep;
      }
    }

    // --- rotação do personagem ---------------------------------------------
    if (wishLen > 0.08) {
      const desiredYaw = Math.atan2(wx, wz);
      const rate = this.grounded ? T.turnRate : T.turnRateAir;
      this.yaw = dampAngle(this.yaw, desiredYaw, rate, dt);
    }

    // --- pulo ---------------------------------------------------------------
    if (input.jumpPressed) this.jumpBufferTimer = T.jumpBuffer;
    else this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

    this.coyote = this.grounded ? T.coyoteTime : Math.max(0, this.coyote - dt);

    if (this.jumpBufferTimer > 0 && this.coyote > 0) {
      this.crouching = false;
      this.velocity.y = T.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBufferTimer = 0;
      this.jumpHeldLast = true;
      this.jumping = true;
      this.justJumped = true;
    }
    // altura variável do pulo (soltar o botão corta o impulso)
    if (this.jumping && !input.jumpHeld && this.velocity.y > 0.4) {
      this.velocity.y *= T.jumpCutFactor;
      this.jumping = false;
    }
    if (this.velocity.y <= 0) this.jumping = false;

    // --- gravidade ----------------------------------------------------------
    this.velocity.y -= T.gravity * dt;
    if (this.velocity.y < -32) this.velocity.y = -32;

    if (this.grounded && this.velocity.y <= 0) {
      // mantém contato com o solo para o snap funcionar
      this.velocity.y = -1.2;
    }

    // --- movimento pelo controlador ----------------------------------------
    const desired = {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    };
    if (this.velocity.y > 0) this.controller.disableSnapToGround();
    else this.controller.enableSnapToGround(0.4);

    this.controller.computeColliderMovement(
      this.collider,
      desired,
      this._queryFilter,
      this._filterGroups
    );
    const mv = this.controller.computedMovement();
    const wasGrounded = this.grounded;

    this.position.x += mv.x;
    this.position.y += mv.y;
    this.position.z += mv.z;
    this.body.setNextKinematicTranslation({
      x: this.position.x, y: this.position.y, z: this.position.z,
    });

    this.grounded = this.controller.computedGrounded();

    // Se o movimento foi bloqueado, mata a velocidade naquela direção (evita
    // "tremer" empurrando a parede e acumular velocidade).
    const wantH = Math.hypot(desired.x, desired.z);
    const gotH = Math.hypot(mv.x, mv.z);
    if (wantH > 1e-5 && gotH < wantH * 0.6) {
      const ratio = clamp(gotH / wantH, 0, 1);
      this.velocity.x *= ratio;
      this.velocity.z *= ratio;
    }

    // fallback de chão (só age a menos de 4 cm: nunca "gruda" no ar)
    if (!this.grounded && this.velocity.y <= 0.02) {
      const origin = { x: this.position.x, y: this.position.y - this.halfHeight, z: this.position.z };
      const ray = new this.RAPIER.Ray(origin, _rayDir);
      const hit = this.world.castRay(
        ray, this.radius + 0.045, true, this._queryFilter, undefined, this.collider
      );
      if (hit) {
        this.grounded = true;
        const correction = Math.min(0.045, Math.max(0, hit.timeOfImpact - this.radius));
        this.position.y -= correction;
        this.body.setNextKinematicTranslation({
          x: this.position.x, y: this.position.y, z: this.position.z,
        });
      }
    }

    // impacto de pouso
    if (!wasGrounded && this.grounded) {
      const impact = clamp(-this.velocity.y / 8, 0, 1);
      this.landingImpact = Math.max(this.landingImpact, impact);
      this.landingTimer = 0;
      this.velocity.y = -1.2;
      this.justLanded = { impact };
    }
    this.landingImpact = damp(this.landingImpact, 0, 5.5, dt);
    if (!this.grounded) this.airTime += dt;
    else this.airTime = 0;

    // normal do chão (para inclinar o personagem)
    const n = this.terrain.normalAt(this.position.x, this.position.z, this.groundNormal);
    this.slopeAngle = Math.acos(clamp(n.y, -1, 1)) * (180 / Math.PI);

    // --- stamina ------------------------------------------------------------
    const runningNow = wantRun && this.speed > T.walkSpeed * 1.15 && wishLen > 0.2;
    if (runningNow) {
      this.stamina = clamp(this.stamina - T.staminaDrain * dt, 0, 1);
      if (this.stamina <= 0.001) this.exhausted = true;
    } else {
      this.stamina = clamp(this.stamina + T.staminaRegen * dt, 0, 1);
      if (this.stamina > 0.28) this.exhausted = false;
    }

    this.distance += Math.hypot(mv.x, mv.z);
    this.feetY = this.position.y - this.halfHeight - this.radius;
  }

  respawn(x, z) {
    const y = this.terrain.heightAt(x, z) + 0.05;
    this.position.set(x, y + this.halfHeight + this.radius, z);
    this.velocity.set(0, 0, 0);
    this.body.setTranslation({ x: this.position.x, y: this.position.y, z: this.position.z }, true);
  }
}

export { STAND, CROUCH };
