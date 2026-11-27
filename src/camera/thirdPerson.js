// Câmera em terceira pessoa estilo GTA: ombro direito, mira por mouse,
// colisão com o cenário, suavização e FOV dinâmico.

import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from '../core/math.js';

const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export class ThirdPersonCamera {
  constructor({ camera, world, RAPIER, terrain, playerCollider }) {
    this.camera = camera;
    this.world = world;
    this.RAPIER = RAPIER;
    this.terrain = terrain;
    this.playerCollider = playerCollider;
    this.yaw = 0;
    this.pitch = 0.16;
    this.distance = 3.9;
    this.desiredDistance = 3.9;
    this.sensitivity = 0.0022;
    this.baseFov = 62;
    this.currentFov = 62;
    this.smoothPos = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.shoulder = 0.42;
    this.height = 1.42;
    this.timeSinceMouse = 10;
    this.shake = 0;
    this.shakeTime = 0;
    this.initialized = false;
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.bob = 0;
  }

  look(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch = clamp(this.pitch + dy * this.sensitivity, -0.62, 1.02);
    this.timeSinceMouse = 0;
  }

  zoom(delta) {
    this.desiredDistance = clamp(this.desiredDistance + delta * 0.0022, 2.3, 7.5);
  }

  addShake(amount) {
    this.shake = Math.min(1, this.shake + amount);
  }

  update(dt, state) {
    this.timeSinceMouse += dt;
    const { feetPos, yaw, speed, grounded, landingImpact, phase } = state;

    // alinhamento automático atrás do personagem quando ele corre
    if (this.timeSinceMouse > 1.1 && speed > 0.8) {
      this.yaw = dampAngle(this.yaw, yaw, 1.8 + speed * 0.25, dt);
    }
    this.distance = damp(this.distance, this.desiredDistance, 7, dt);

    // tremida de câmera
    if (this.shake > 0.001) {
      this.shakeTime += dt;
      this.shake = damp(this.shake, 0, 6, dt);
    }
    const shakeAmp = this.shake * 0.06;

    // balanço de caminhada
    const bobAmp = clamp(speed / 4, 0, 1) * 0.022 * (grounded ? 1 : 0);
    this.bob = damp(this.bob, Math.sin(phase * Math.PI * 4) * bobAmp, 12, dt);

    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(-_fwd.z, 0, _fwd.x); // direita do personagem

    _target.copy(feetPos);
    _target.y += this.height + this.bob;
    _target.addScaledVector(_right, this.shoulder);

    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    _desired.copy(_target)
      .addScaledVector(_fwd, -this.distance * cosP)
      .addScaledVector(THREE.Object3D.DEFAULT_UP, this.distance * sinP);

    // colisão: encurta a distância se houver algo entre o alvo e a câmera
    _dir.copy(_desired).sub(_target);
    const len = _dir.length();
    if (len > 0.001) {
      _dir.multiplyScalar(1 / len);
      this.ray.origin = { x: _target.x, y: _target.y, z: _target.z };
      this.ray.dir = { x: _dir.x, y: _dir.y, z: _dir.z };
      const hit = this.world.castRay(
        this.ray,
        len,
        true,
        this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        this.playerCollider
      );
      if (hit && hit.timeOfImpact < len) {
        const d = Math.max(0.65, hit.timeOfImpact - 0.28);
        _desired.copy(_target).addScaledVector(_dir, d);
      }
    }

    // não deixa a câmera entrar no chão
    const groundY = this.terrain.heightAt(_desired.x, _desired.z) + 0.45;
    if (_desired.y < groundY) _desired.y = groundY;

    if (!this.initialized) {
      this.smoothPos.copy(_desired);
      this.smoothTarget.copy(_target);
      this.initialized = true;
    } else {
      const posLambda = 13;
      const tgtLambda = 18;
      this.smoothPos.x = damp(this.smoothPos.x, _desired.x, posLambda, dt);
      this.smoothPos.y = damp(this.smoothPos.y, _desired.y, posLambda, dt);
      this.smoothPos.z = damp(this.smoothPos.z, _desired.z, posLambda, dt);
      this.smoothTarget.x = damp(this.smoothTarget.x, _target.x, tgtLambda, dt);
      this.smoothTarget.y = damp(this.smoothTarget.y, _target.y, tgtLambda, dt);
      this.smoothTarget.z = damp(this.smoothTarget.z, _target.z, tgtLambda, dt);
    }

    const cam = this.camera;
    cam.position.copy(this.smoothPos);
    if (shakeAmp > 0.0001) {
      cam.position.x += Math.sin(this.shakeTime * 41) * shakeAmp;
      cam.position.y += Math.sin(this.shakeTime * 53 + 1.3) * shakeAmp * 0.8;
    }
    cam.lookAt(this.smoothTarget);

    // FOV dinâmico
    const targetFov = this.baseFov + clamp((speed - 2.2) * 2.0, 0, 8);
    this.currentFov = damp(this.currentFov, targetFov, 4, dt);
    if (Math.abs(cam.fov - this.currentFov) > 0.01) {
      cam.fov = this.currentFov;
      cam.updateProjectionMatrix();
    }

    // impacto de pouso
    if (landingImpact > 0.02) this.addShake(landingImpact * 0.5);
    void grounded;
    void lerp;
  }
}
