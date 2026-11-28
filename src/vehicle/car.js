// Carro dirigível: chassi dinâmico no Rapier com controlador de veículo por
// raios (suspensão, motor, freio, direção), portas animadas, amassados por
// impacto, fumaça e fogo quando o motor funde.

import * as THREE from 'three';
import { clamp } from '../core/math.js';
import { buildCarModel, CAR_DIMS } from './carModel.js';
import { ParticleCloud } from './particles.js';

const UP = new THREE.Vector3(0, 1, 0);

export const CAR_TUNING = {
  mass: 1180,
  maxSteer: 0.52,
  steerSpeedFalloff: 0.028,
  engineForce: 2600,      // por roda motriz (traseiras)
  brakeForce: 2600,
  handbrakeForce: 5200,
  reverseFactor: 0.55,
  maxSpeed: 36,           // m/s (~130 km/h)
  drag: 1.1,
  downforce: 1.25,
  suspension: {
    restLength: 0.26,
    stiffness: 32,
    compression: 2.4,
    relaxation: 2.8,
    maxTravel: 0.30,
    maxForce: 26000,
    frictionSlip: 2.1,
    sideFriction: 1.25,
  },
};

const DAMAGE_KEY = 130000;      // força que equivale a um amassado médio
const DEATH_HEALTH = 0.06;

export class Car {
  constructor({
    scene, world, RAPIER, terrain, eventQueue = null,
    position = { x: 0, y: 0, z: 0 }, yaw = 0, color = '#b6412f', name = 'carro',
  }) {
    this.scene = scene;
    this.world = world;
    this.RAPIER = RAPIER;
    this.terrain = terrain;
    this.eventQueue = eventQueue;
    this.name = name;

    this.model = buildCarModel({ color });
    this.group = this.model.group;
    this.group.position.set(position.x, position.y, position.z);
    this.group.rotation.y = yaw;
    scene.add(this.group);

    // ---- corpo rígido -----------------------------------------------------
    const groundY = position.y || terrain.heightAt(position.x, position.z);
    this.spawn = { x: position.x, y: groundY + 0.62, z: position.z, yaw };
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this.spawn.x, this.spawn.y, this.spawn.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.05)
      .setAngularDamping(0.45)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(bodyDesc);

    const halfW = CAR_DIMS.width / 2 - 0.02;
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfW, 0.30, CAR_DIMS.length / 2 - 0.05)
      .setTranslation(0, 0.66, 0)
      .setDensity(45)
      .setFriction(0.55)
      .setRestitution(0.06)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(9000);
    this.collider = world.createCollider(colliderDesc, this.body);

    // lastro baixo: centro de massa realista (evita capotar fácil)
    const ballast = RAPIER.ColliderDesc.cuboid(halfW - 0.12, 0.07, CAR_DIMS.length / 2 - 0.55)
      .setTranslation(0, 0.32, 0)
      .setDensity(1750)
      .setFriction(0.4)
      .setRestitution(0.02);
    this.ballast = world.createCollider(ballast, this.body);

    // ---- controlador de veículo ------------------------------------------
    this.vehicle = world.createVehicleController(this.body);
    // eixos do chassi: Y para cima (padrão) e +Z como frente. A força do motor
    // é aplicada na direção dianteira da roda (axle × direção), então basta
    // escolher o sinal do eixo (axle) e a força resultante aponta para +Z.
    const S = CAR_TUNING.suspension;
    this.wheels = [];
    const hb = CAR_DIMS.wheelBase / 2;
    const tr = CAR_DIMS.track / 2;
    const layout = [
      { x: tr, z: hb, front: true },
      { x: -tr, z: hb, front: true },
      { x: tr, z: -hb, front: false },
      { x: -tr, z: -hb, front: false },
    ];
    layout.forEach((w, i) => {
      this.vehicle.addWheel(
        { x: w.x, y: 0.52, z: w.z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        S.restLength,
        CAR_DIMS.wheelRadius
      );
      this.vehicle.setWheelSuspensionStiffness(i, S.stiffness);
      this.vehicle.setWheelSuspensionCompression(i, S.compression);
      this.vehicle.setWheelSuspensionRelaxation(i, S.relaxation);
      this.vehicle.setWheelMaxSuspensionTravel(i, S.maxTravel);
      this.vehicle.setWheelMaxSuspensionForce(i, S.maxForce);
      this.vehicle.setWheelFrictionSlip(i, S.frictionSlip);
      this.vehicle.setWheelSideFrictionStiffness(i, S.sideFriction);
      this.vehicle.setWheelSteering(i, 0);
      this.vehicle.setWheelEngineForce(i, 0);
      this.vehicle.setWheelBrake(i, 0);
      this.wheels.push({ ...w, index: i, visual: this.model.wheels[i] });
    });

    // ---- estado -----------------------------------------------------------
    this.speed = 0;
    this.forwardSpeed = 0;
    this.steerAngle = 0;
    this.damage = 0;
    this.dead = false;
    this.fireTime = 0;
    this._fireAcc = 0;
    this._smokeAcc = 0;
    this.doorAngle = { left: 0, right: 0 };
    this.doorTarget = { left: 0, right: 0 };

    this.fire = new ParticleCloud(scene, { max: 110, blending: THREE.AdditiveBlending, opacity: 0.95 });
    this.smoke = new ParticleCloud(scene, { max: 90, blending: THREE.NormalBlending, opacity: 0.5 });

    this.fireLight = new THREE.PointLight(0xff7a2a, 0, 14, 2);
    this.fireLight.visible = false;
    scene.add(this.fireLight);

    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this.onImpact = null;      // (força) => void
    this.onDeath = null;
    this.lastImpact = 0;
  }

  get health() { return clamp(1 - this.damage, 0, 1); }
  get speedKmh() { return Math.abs(this.forwardSpeed) * 3.6; }

  /** Posição do assento do motorista em espaço de mundo. */
  seatPosition(out = new THREE.Vector3()) {
    this.group.updateMatrixWorld();
    return out.set(0.34, 0.62, 0.02).applyMatrix4(this.group.matrixWorld);
  }

  /** Ponto ao lado da porta do motorista (onde o personagem desce). */
  exitPosition(out = new THREE.Vector3()) {
    this.group.updateMatrixWorld();
    out.set(1.35, 0.12, 0.1).applyMatrix4(this.group.matrixWorld);
    out.y = this.terrain.heightAt(out.x, out.z) + 0.05;
    return out;
  }

  openDoor(key, open = true) {
    this.doorTarget[key] = open ? 1 : 0;
  }

  setDoors(open) {
    this.doorTarget.left = open ? 1 : 0;
    this.doorTarget.right = open ? 1 : 0;
  }

  /** Entrada do jogador (chamado pelo laço principal a cada passo fixo). */
  update(dt, input = {}) {
    const throttle = clamp(input.throttle || 0, -1, 1);
    const steer = clamp(input.steer || 0, -1, 1);
    const brake = clamp(input.brake || 0, 0, 1);
    const handbrake = !!input.handbrake;

    // velocidade ao longo do eixo "frente" do carro
    const lin = this.body.linvel();
    this._q.copy(this.body.rotation());
    this._v1.set(0, 0, 1).applyQuaternion(this._q);
    this.forwardSpeed = lin.x * this._v1.x + lin.y * this._v1.y + lin.z * this._v1.z;
    this.speed = Math.hypot(lin.x, lin.y, lin.z);

    // ---- direção ---------------------------------------------------------
    const speedAbs = Math.abs(this.forwardSpeed);
    const maxSteer = CAR_TUNING.maxSteer / (1 + speedAbs * CAR_TUNING.steerSpeedFalloff);
    this.steerAngle = steer * maxSteer;
    for (const w of this.wheels) {
      if (w.front) this.vehicle.setWheelSteering(w.index, this.steerAngle);
    }

    // ---- motor / freio ---------------------------------------------------
    const powerFactor = this.dead ? 0 : this.health > 0.45 ? 1 : 0.55 + (this.health - 0.06) * 0.8;
    let engine = 0;
    if (!this.dead && Math.abs(throttle) > 0.02) {
      const sameWay = Math.sign(throttle) === Math.sign(this.forwardSpeed || throttle);
      const overspeed = Math.abs(this.forwardSpeed) > CAR_TUNING.maxSpeed;
      if (throttle > 0) {
        engine = overspeed ? 0 : throttle * CAR_TUNING.engineForce * powerFactor;
      } else if (this.forwardSpeed > 0.6) {
        engine = 0; // freio motor primeiro
      } else if (!overspeed || sameWay) {
        engine = throttle * CAR_TUNING.engineForce * CAR_TUNING.reverseFactor * powerFactor;
      }
    }

    const brakeForce = brake * CAR_TUNING.brakeForce
      + (this.dead ? 900 : 0)
      + (!throttle ? Math.min(320, speedAbs * 26) : 0);

    for (const w of this.wheels) {
      const driven = !w.front;
      this.vehicle.setWheelEngineForce(w.index, driven ? engine : 0);
      let b = brakeForce;
      if (handbrake && !w.front) b = CAR_TUNING.handbrakeForce;
      this.vehicle.setWheelBrake(w.index, b);
      if (handbrake) {
        this.vehicle.setWheelFrictionSlip(w.index, w.front ? 1.5 : 0.55);
        this.vehicle.setWheelSideFrictionStiffness(w.index, w.front ? 1.0 : 0.35);
      } else {
        this.vehicle.setWheelFrictionSlip(w.index, CAR_TUNING.suspension.frictionSlip);
        this.vehicle.setWheelSideFrictionStiffness(w.index, CAR_TUNING.suspension.sideFriction);
      }
    }

    // arrasto e downforce (aplicados antes do passo do mundo)
    const v2 = this.speed * this.speed;
    if (v2 > 1) {
      const d = CAR_TUNING.drag * v2;
      const dir = this._v2.set(lin.x, 0, lin.z);
      if (dir.lengthSq() > 1e-4) dir.normalize().multiplyScalar(-d * dt);
      this.body.applyImpulse({ x: dir.x, y: 0, z: dir.z }, true);
      const df = CAR_TUNING.downforce * v2 * dt;
      this.body.applyImpulse({ x: 0, y: -Math.min(df, 5000), z: 0 }, true);
    }

    this.vehicle.updateVehicle(dt);

    // ---- portas / partículas / luzes ------------------------------------
    this._updateDoors(dt);
    this._updateEffects(dt);
  }

  _updateDoors(dt) {
    for (const key of ['left', 'right']) {
      const target = this.doorTarget[key];
      const cur = this.doorAngle[key];
      const next = cur + (target - cur) * (1 - Math.exp(-11 * dt));
      this.doorAngle[key] = Math.abs(target - next) < 0.002 ? target : next;
      const hinge = this.model.doors[key];
      if (hinge) {
        const sign = key === 'left' ? -1 : 1;
        hinge.rotation.y = sign * this.doorAngle[key] * 1.15;
      }
    }
  }

  _updateEffects(dt) {
    const health = this.health;
    this.fireTime += dt;

    const engineLocal = this._v1.set(0, 0.85, 1.55).applyMatrix4(this.group.matrixWorld);

    // fumaça: quando o motor está bem avariado
    if (health < 0.55) {
      const rate = (1 - health / 0.55) * 26;
      this._smokeAcc += rate * dt;
      while (this._smokeAcc >= 1) {
        this._smokeAcc -= 1;
        this.smoke.spawn({
          x: engineLocal.x + (Math.random() - 0.5) * 0.35,
          y: engineLocal.y + Math.random() * 0.1,
          z: engineLocal.z + (Math.random() - 0.5) * 0.35,
          vx: (Math.random() - 0.5) * 0.5,
          vy: 0.9 + Math.random() * 0.8,
          vz: (Math.random() - 0.5) * 0.5,
          max: 1.6 + Math.random() * 1.2,
          size: 0.55 + Math.random() * 0.5,
          grow: 2.4,
          buoyancy: 0.9,
          fadePower: 1.1,
          r: 0.18, g: 0.18, b: 0.19,
        });
      }
    }

    // fogo: motor fundido
    if (this.dead) {
      this._fireAcc += 34 * dt;
      while (this._fireAcc >= 1) {
        this._fireAcc -= 1;
        const t = Math.random();
        this.fire.spawn({
          x: engineLocal.x + (Math.random() - 0.5) * 0.42,
          y: engineLocal.y + Math.random() * 0.25,
          z: engineLocal.z + (Math.random() - 0.5) * 0.42,
          vx: (Math.random() - 0.5) * 0.7,
          vy: 1.5 + Math.random() * 1.7,
          vz: (Math.random() - 0.5) * 0.7,
          max: 0.55 + Math.random() * 0.75,
          size: 0.42 + Math.random() * 0.55,
          grow: 1.5,
          buoyancy: 1.6,
          fadePower: 1.9,
          r: 1.0, g: 0.35 + t * 0.45, b: 0.06 + t * 0.1,
        });
      }
      this.fireLight.visible = true;
      this.fireLight.position.copy(engineLocal).add(new THREE.Vector3(0, 0.35, 0));
      const flicker = 0.65 + Math.sin(this.fireTime * 23) * 0.18 + Math.sin(this.fireTime * 7.7) * 0.17;
      this.fireLight.intensity = 16 * flicker;
    } else {
      this.fireLight.visible = false;
    }

    this.fire.update(dt);
    this.smoke.update(dt);
  }

  /** Trata os eventos de força de contato do mundo do Rapier. */
  handleContactEvents(eventQueue) {
    if (!eventQueue) return;
    const t = this.body.translation();
    const center = this._v1.set(t.x, t.y + 0.7, t.z);
    eventQueue.drainContactForceEvents((event) => {
      const c1 = event.collider1();
      const c2 = event.collider2();
      const mine = (h) => h === this.collider.handle || h === this.ballast.handle;
      if (!mine(c1) && !mine(c2)) return;
      const force = event.totalForceMagnitude();
      if (force < 4500) return;

      // direção do empurrão: do outro corpo para o centro do carro
      const otherHandle = mine(c1) ? c2 : c1;
      const other = this.world.getCollider(otherHandle);
      const dir = new THREE.Vector3();
      if (other) {
        const op = other.translation();
        dir.set(center.x - op.x, center.y - op.y, center.z - op.z);
      }
      if (dir.lengthSq() < 1e-4) {
        const lv = this.body.linvel();
        dir.set(-lv.x, 0, -lv.z);
      }
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      dir.y = clamp(dir.y, -Math.abs(dir.length()) * 0.35, Math.abs(dir.length()) * 0.35);
      dir.normalize();

      // ponto sobre a carcaça, na direção de onde veio o golpe
      this.group.updateMatrixWorld();
      const localDir = dir.clone().applyQuaternion(this.group.quaternion.clone().invert());
      const hx = 0.89, hy = 0.66, hz = 2.16;
      const ax = Math.abs(localDir.x), ay = Math.abs(localDir.y), az = Math.abs(localDir.z);
      const k = Math.min(
        ax > 1e-4 ? hx / ax : Infinity,
        ay > 1e-4 ? hy / ay : Infinity,
        az > 1e-4 ? hz / az : Infinity
      );
      const lp = localDir.multiplyScalar(-k);
      lp.y += 0.66;
      const point = lp.applyMatrix4(this.group.matrixWorld);
      this.applyImpact(point, dir, force);
    });
  }

  /**
   * Impacto real: o dano vem da velocidade de aproximação (não do esforço de
   * contato, que fica enorme também quando o carro só está encostado).
   */
  applyImpact(worldPoint, worldDir, force) {
    const speed = this.speed; // m/s antes do passo de física
    if (force < 4500 || speed < 2.6) return;
    this.lastImpact = force;

    const dmg = clamp((speed - 2.6) / 19, 0, 0.9);
    const before = this.health;
    this.damage = clamp(this.damage + dmg, 0, 1);

    this._dent(worldPoint, worldDir, speed);
    if (this.onImpact) this.onImpact({ force, damage: dmg });

    if (before > DEATH_HEALTH && this.health <= DEATH_HEALTH && !this.dead) {
      this.dead = true;
      this.fireLight.visible = true;
      for (let i = 0; i < 40; i++) {
        this.fire.spawn({
          x: worldPoint.x + (Math.random() - 0.5) * 1.2,
          y: worldPoint.y + Math.random() * 0.8,
          z: worldPoint.z + (Math.random() - 0.5) * 1.2,
          vx: (Math.random() - 0.5) * 3,
          vy: 1 + Math.random() * 3,
          vz: (Math.random() - 0.5) * 3,
          max: 0.8 + Math.random() * 1.1,
          size: 0.8 + Math.random() * 1.1,
          grow: 2,
          buoyancy: 2.2,
          fadePower: 1.6,
          r: 1, g: 0.5, b: 0.12,
        });
      }
      this.engineDead = true;
      if (this.onDeath) this.onDeath();
    }
  }

  /** Amassa os painéis perto do ponto de impacto (profundidade pela velocidade). */
  _dent(worldPoint, worldDir, speed) {
    const dent = Math.min(0.19, 0.03 + speed * 0.0055);
    const radius = Math.min(1.5, 0.55 + speed * 0.055);
    const lp = new THREE.Vector3();
    const ld = new THREE.Vector3();
    for (const mesh of this.model.deformable) {
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      if (!pos) continue;
      mesh.updateMatrixWorld();
      mesh.getWorldQuaternion(this._q);
      ld.copy(worldDir).applyQuaternion(this._q.clone().invert());
      lp.copy(worldPoint).applyMatrix4(this._m.copy(mesh.matrixWorld).invert());
      let touched = false;
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) - lp.x;
        const dy = pos.getY(i) - lp.y;
        const dz = pos.getZ(i) - lp.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > radius) continue;
        const k = Math.pow(1 - d / radius, 1.7) * dent;
        pos.setXYZ(i, pos.getX(i) + ld.x * k, pos.getY(i) + ld.y * k, pos.getZ(i) + ld.z * k);
        touched = true;
      }
      if (touched) {
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
      }
    }
  }

  /** Sincroniza o visual com o corpo rígido (chamado após world.step). */
  syncVisual() {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.group.position.set(t.x, t.y, t.z);
    this.group.quaternion.set(r.x, r.y, r.z, r.w);
    this.group.updateMatrixWorld();

    for (const w of this.wheels) {
      const vis = w.visual;
      if (!vis) continue;
      const hard = this.vehicle.wheelHardPoint(w.index);
      const susp = this.vehicle.wheelSuspensionLength(w.index) ?? CAR_TUNING.suspension.restLength;
      const steer = this.vehicle.wheelSteering(w.index) || 0;
      const spin = this.vehicle.wheelRotation(w.index) || 0;
      const lx = hard.x;
      const ly = hard.y - (susp || 0);
      const lz = hard.z;
      this._v1.set(lx, ly, lz).applyMatrix4(this.group.matrixWorld);
      vis.group.position.copy(this.group.worldToLocal(this._v1.clone()));
      vis.group.quaternion.setFromAxisAngle(UP, steer);
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spin);
      vis.group.quaternion.multiply(spinQ);
    }
  }

  /** Volta o carro para o ponto inicial (usado pelo R). */
  respawn() {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, this.spawn.yaw);
    this.body.setTranslation({ x: this.spawn.x, y: this.spawn.y, z: this.spawn.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.fireLight);
    this.fire.dispose();
    this.smoke.dispose();
    this.world.removeRigidBody(this.body);
  }
}
