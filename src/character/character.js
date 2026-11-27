// Personagem: carrega o avatar realista, transfere as animações Mixamo,
// mistura locomoção e aplica camadas procedurais (agachar, pulo, inclinação,
// respiração, olhar, adaptação dos pés ao terreno).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Retargeter, collectBones } from './retarget.js';
import { buildBoneTracks, applyPose } from './clip.js';
import { clamp, damp, lerp, smoothstep } from '../core/math.js';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Pose de agachamento (graus). */
export const CROUCH = {
  thigh: 66,
  knee: 102,
  ankle: 24,
  footLift: 0.03,
  hipBack: 0.07,
  spine: 16,
  spine1: 8,
  spine2: 5,
  neck: -7,
  head: -10,
  armForward: 14,
  elbow: 24,
};

export const AIR = {
  thighUp: 24,
  kneeUp: 46,
  ankleUp: 16,
  armForward: 20,
  armOut: 12,
};

const WALK_REF = 1.78;
const RUN_REF = 3.9;
const DEG = Math.PI / 180;

export class Character {
  static async load({ avatarUrl, motionUrl, onProgress }) {
    const loader = new GLTFLoader();
    let n = 0;
    const avatar = await loader.loadAsync(avatarUrl, () => onProgress?.(0.05 + n * 0.02));
    n++;
    const motion = await loader.loadAsync(motionUrl, () => onProgress?.(0.6 + n * 0.02));
    onProgress?.(0.85);
    return { avatar, motion };
  }

  constructor({ avatar, motion, scene }) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'player';
    this.holder = new THREE.Group();
    this.holder.name = 'avatarHolder';
    this.root.add(this.holder);

    const avatarScene = avatar.scene;
    this.holder.add(avatarScene);

    this.meshes = [];
    avatarScene.traverse((o) => {
      if (o.isBone) o.frustumCulled = false;
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        if (o.isSkinnedMesh) o.skeleton.bones.forEach((b) => (b.frustumCulled = false));
        if (o.material) {
          o.material.envMapIntensity = 0.5;
          if (o.material.map) o.material.map.anisotropy = 4;
          o.material.shadowSide = THREE.FrontSide;
        }
        this.meshes.push(o);
      }
    });

    // retarget + clipes
    this.retargeter = new Retargeter(motion.scene, avatarScene);
    this.holder.rotation.y = this.retargeter.forwardYaw;
    this.bones = collectBones(avatarScene);

    this.b = {
      hips: this.bones.get('Hips'),
      spine: this.bones.get('Spine'),
      spine1: this.bones.get('Spine1'),
      spine2: this.bones.get('Spine2'),
      neck: this.bones.get('Neck'),
      head: this.bones.get('Head'),
      lUpLeg: this.bones.get('LeftUpLeg'),
      lLeg: this.bones.get('LeftLeg'),
      lFoot: this.bones.get('LeftFoot'),
      lToe: this.bones.get('LeftToeBase'),
      rUpLeg: this.bones.get('RightUpLeg'),
      rLeg: this.bones.get('RightLeg'),
      rFoot: this.bones.get('RightFoot'),
      rToe: this.bones.get('RightToeBase'),
      lArm: this.bones.get('LeftArm'),
      rArm: this.bones.get('RightArm'),
      lForeArm: this.bones.get('LeftForeArm'),
      rForeArm: this.bones.get('RightForeArm'),
      lShoulder: this.bones.get('LeftShoulder'),
      rShoulder: this.bones.get('RightShoulder'),
    };

    this._qRootWorld = new THREE.Quaternion();
    this._qParent = new THREE.Quaternion();
    this._qParentInv = new THREE.Quaternion();
    this._axisWorld = new THREE.Vector3();
    this._axisLocal = new THREE.Vector3();
    this._qTwist = new THREE.Quaternion();
    this._headWorld = new THREE.Vector3();

    const motionClips = {};
    for (const c of motion.animations) motionClips[c.name.toLowerCase()] = c;
    const bake = (name) => {
      const src = motionClips[name];
      return src ? this.retargeter.bake(src, 36) : null;
    };
    const idle = bake('idle') || bake('walk');
    const walk = bake('walk') || idle;
    const run = bake('run') || walk;
    this.clips = { idle, walk, run, list: [idle, walk, run] };
    this.tracks = buildBoneTracks(this.clips.list);

    this.measure = this._measureRig();
    this.contactPhases = this._measureContacts();
    this.crouchDrop = 0.3;
    this.landDrop = 0.1;
    this.footMeshes = this._findFootMeshes();
    this.modelOffsetY = this._calibrateFeet();
    this._calibrateOverlayDrops();
    this.holder.position.y = this.modelOffsetY;


    this.time = 0;
    this.smoothedSpeed = 0;
    this.crouchT = 0;
    this.airT = 0;
    this.landT = 0;
    this.phase = 0;
    this.idleTime = 0;
    this.breathTime = Math.random() * 12;
    this.leanSmoothed = 0;
    this.lookYawSmoothed = 0;
    this.lookPitchSmoothed = 0;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.footstepCallback = null;
    this.clipWeights = [1, 0, 0];

    this.scene.add(this.root);
  }

  get walkSpeed() { return WALK_REF; }
  get runSpeed() { return RUN_REF; }

  bone(name) { return this.bones.get(name) || null; }

  _measureRig() {
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.holder.position.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    const pos = (name) => {
      const b = this.bones.get(name);
      return b ? b.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    };
    const hips = pos('Hips');
    const up = pos('LeftUpLeg');
    const knee = pos('LeftLeg');
    const ankle = pos('LeftFoot');
    const toe = pos('LeftToeBase');
    return {
      hipY: hips.y,
      ankleY: ankle.y,
      thighLen: up.distanceTo(knee) || 0.45,
      shinLen: knee.distanceTo(ankle) || 0.44,
      toeLen: ankle.distanceTo(toe) || 0.14,
      footLen: Math.max(0.1, ankle.distanceTo(toe)),
    };
  }

  /** Descobre em que fase do ciclo cada pé toca o chão (para os passos). */
  _measureContacts() {
    const walk = this.clips.walk;
    if (!walk) return [0.25, 0.75];
    const lf = this.b.lFoot, rf = this.b.rFoot;
    if (!lf || !rf) return [0.25, 0.75];
    const N = 48;
    const ys = [];
    for (let i = 0; i < N; i++) {
      const phase = i / N;
      applyPose(this.tracks, this.clipWeights ? [0, 1, 0] : [0, 1, 0], [0, phase * walk.duration, 0]);
      this.root.updateMatrixWorld(true);
      ys.push({
        phase,
        l: lf.getWorldPosition(new THREE.Vector3()).y,
        r: rf.getWorldPosition(new THREE.Vector3()).y,
      });
    }
    const minPhase = (key) => {
      let best = 0;
      let bestY = Infinity;
      for (const s of ys) {
        if (s[key] < bestY) { bestY = s[key]; best = s.phase; }
      }
      return best;
    };
    return [minPhase('l'), minPhase('r')];
  }

  _findFootMeshes() {
    const found = [];
    this.holder.traverse((o) => {
      if (o.isMesh && /foot|shoe|boot/i.test(o.name + ' ' + (o.material?.name || ''))) found.push(o);
    });
    return found.length ? found : this.meshes;
  }

  /** Menor Y da geometria dos pés na pose atual (espaço do mundo). */
  _lowestFootY() {
    const v = new THREE.Vector3();
    let minY = Infinity;
    for (const m of this.footMeshes) {
      const pos = m.geometry.attributes.position;
      if (!pos) continue;
      const step = Math.max(1, Math.floor(pos.count / 1400));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i);
        if (m.isSkinnedMesh) m.applyBoneTransform(i, v);
        v.applyMatrix4(m.matrixWorld);
        if (v.y < minY) minY = v.y;
      }
    }
    return minY;
  }

  _resetForMeasure() {
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.holder.position.set(0, 0, 0);
    this.holder.rotation.y = this.retargeter ? this.retargeter.forwardYaw : 0;
    this.root.updateMatrixWorld(true);
    this.root.getWorldQuaternion(this._qRootWorld);
  }

  _calibrateFeet() {
    // idle (pose neutra)
    if (this.tracks.length) applyPose(this.tracks, [1, 0, 0], [0.35, 0, 0]);
    this._resetForMeasure();
    const idleMin = this._lowestFootY();
    this.idleFootY = isFinite(idleMin) ? idleMin : 0;

    // passada: procura o ponto mais baixo do contato (o pé afunda mais andando)
    let walkMin = Infinity;
    const walk = this.clips.walk;
    if (walk && this.tracks.length) {
      for (let i = 0; i < 14; i++) {
        const t = (i / 14) * walk.duration;
        applyPose(this.tracks, [0, 1, 0], [0, t, 0]);
        this._resetForMeasure();
        const y = this._lowestFootY();
        if (isFinite(y) && y < walkMin) walkMin = y;
      }
    }
    if (!isFinite(walkMin)) walkMin = idleMin;
    // média ponderada: nem flutua parado, nem afunda correndo
    const ref = idleMin * 0.6 + walkMin * 0.4;
    this.walkFootY = walkMin;
    return isFinite(ref) ? -ref + 0.006 - 0.02 : 0; // 2 cm = offset do controlador cinemático
  }

  /** Mede de quanto o quadril precisa descer para os pés ficarem no chão. */
  _calibrateOverlayDrops() {
    if (!isFinite(this.idleFootY)) return;
    if (this.tracks.length) applyPose(this.tracks, [1, 0, 0], [0, 0, 0]);
    this._resetForMeasure();
    this._applyCrouchPose(1, 0);
    this._resetForMeasure();
    const crouchY = this._lowestFootY();
    if (isFinite(crouchY)) {
      this.crouchDrop = Math.max(0.08, Math.min(0.55, crouchY - this.idleFootY));
    }

    if (this.tracks.length) applyPose(this.tracks, [1, 0, 0], [0, 0, 0]);
    this._resetForMeasure();
    this._applyLandPose(1, 0);
    this._resetForMeasure();
    const landY = this._lowestFootY();
    if (isFinite(landY)) {
      this.landDrop = Math.max(0.02, Math.min(0.3, landY - this.idleFootY));
    }
  }

  get headWorldPosition() {
    const head = this.b.head;
    if (!head) return this._headWorld.copy(this.root.position).setY(this.root.position.y + 1.55);
    head.updateWorldMatrix(true, false);
    return head.getWorldPosition(this._headWorld);
  }

  /** Rotação aditiva em torno de um eixo no espaço do personagem. */
  rotateBone(bone, axis, deg) {
    if (!bone || Math.abs(deg) < 1e-4) return;
    const parent = bone.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(this._qParent);
    this._axisWorld.copy(axis).applyQuaternion(this._qRootWorld);
    this._qParentInv.copy(this._qParent).invert();
    this._axisLocal.copy(this._axisWorld).applyQuaternion(this._qParentInv);
    if (this._axisLocal.lengthSq() < 1e-9) return;
    this._qTwist.setFromAxisAngle(this._axisLocal.normalize(), deg * DEG);
    bone.quaternion.premultiply(this._qTwist);
  }

  pitch(bone, deg) { this.rotateBone(bone, X, deg); }
  yawBone(bone, deg) { this.rotateBone(bone, Y, deg); }
  rollBone(bone, deg) { this.rotateBone(bone, Z, deg); }

  /** Move o quadril em metros (up = cima, back = para trás). */
  moveHips(up, back) {
    const hips = this.b.hips;
    if (!hips) return;
    hips.position.y += up;
    hips.position.z += back || 0;
  }

  _applyCrouchPose(c, drop) {
    this.moveHips(-drop * c, CROUCH.hipBack * c);
    this.pitch(this.b.spine, CROUCH.spine * c);
    this.pitch(this.b.spine1, CROUCH.spine1 * c);
    this.pitch(this.b.spine2, CROUCH.spine2 * c);
    this.pitch(this.b.neck, CROUCH.neck * c);
    this.pitch(this.b.head, CROUCH.head * c);
    const legs = [
      [this.b.lUpLeg, this.b.lLeg, this.b.lFoot],
      [this.b.rUpLeg, this.b.rLeg, this.b.rFoot],
    ];
    for (const [up, leg, foot] of legs) {
      this.pitch(up, -CROUCH.thigh * c);
      this.pitch(leg, CROUCH.knee * c);
      this.pitch(foot, -CROUCH.ankle * c);
    }
    this.pitch(this.b.lArm, -CROUCH.armForward * c);
    this.pitch(this.b.rArm, -CROUCH.armForward * c);
    this.pitch(this.b.lForeArm, -CROUCH.elbow * c);
    this.pitch(this.b.rForeArm, -CROUCH.elbow * c);
  }

  _applyLandPose(l, drop) {
    this.moveHips(-drop * l, 0);
    const legs = [
      [this.b.lUpLeg, this.b.lLeg, this.b.lFoot],
      [this.b.rUpLeg, this.b.rLeg, this.b.rFoot],
    ];
    for (const [upB, legB, footB] of legs) {
      this.pitch(upB, -16 * l);
      this.pitch(legB, 30 * l);
      this.pitch(footB, -14 * l);
    }
    this.pitch(this.b.spine, 8 * l);
    this.pitch(this.b.spine1, 4 * l);
  }

  update(dt, ctx) {
    this.time += dt;
    const speed = Math.max(0, ctx.speed || 0);
    this.smoothedSpeed = damp(this.smoothedSpeed, speed, 12, dt);

    // transformações básicas
    this.root.position.copy(ctx.position);
    this.root.rotation.y = ctx.yaw;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(this._qRootWorld);

    // pesos de locomoção (idle <-> walk <-> run)
    const s = this.smoothedSpeed;
    const idleW = 1 - smoothstep(0.1, 0.85, s);
    const runBlend = smoothstep(WALK_REF * 1.06, RUN_REF * 0.9, s);
    const moveW = 1 - idleW;
    const total = idleW + moveW || 1;
    this.clipWeights = [idleW / total, (moveW * (1 - runBlend)) / total, (moveW * runBlend) / total];

    // fase da passada sincronizada com a distância percorrida
    const stride = lerp(WALK_REF * 1.04, RUN_REF * 0.72, runBlend);
    const prevPhase = this.phase;
    if (this.smoothedSpeed > 0.08) {
      this.phase = (this.phase + (this.smoothedSpeed * dt) / stride) % 1;
    }
    this.idleTime += dt;

    const dur = (i) => (this.clips.list[i] ? this.clips.list[i].duration : 1);
    const times = [
      this.idleTime % dur(0),
      this.phase * dur(1),
      this.phase * dur(2),
    ];
    applyPose(this.tracks, this.clipWeights, times);

    // camadas procedurais
    this.crouchT = damp(this.crouchT, clamp(ctx.crouchAmount ?? 0, 0, 1), 15, dt);
    const airborne = !ctx.grounded;
    this.airT = damp(this.airT, airborne ? 1 : 0, airborne ? 8 : 15, dt);
    this.landT = damp(this.landT, clamp(ctx.landingImpact || 0, 0, 1), 8, dt);
    this.groundNormal.copy(ctx.groundNormal || Y);

    const crouch = this.crouchT;
    const air = this.airT;
    const land = this.landT;
    const moving = smoothstep(0.12, 1.6, s);
    const runW = smoothstep(WALK_REF * 1.12, RUN_REF, s);

    // respiração
    this.breathTime += dt;
    const breath = Math.sin(this.breathTime * 1.5);
    const breathAmp = (1 - moving) * (1 - crouch * 0.4) * (1 - air);
    this.pitch(this.b.spine1, breath * 0.55 * breathAmp);
    this.rollBone(this.b.lShoulder, -breath * 0.8 * breathAmp);
    this.rollBone(this.b.rShoulder, breath * 0.8 * breathAmp);
    this.pitch(this.b.head, Math.sin(this.breathTime * 0.42) * 0.7 * breathAmp);

    // inclinação ao correr / frear
    const targetLean = runW * 7 + land * 7 - crouch * 3;
    this.leanSmoothed = damp(this.leanSmoothed, targetLean, 6, dt);
    this.pitch(this.b.spine, this.leanSmoothed * 0.5);
    this.pitch(this.b.spine1, this.leanSmoothed * 0.35);
    this.pitch(this.b.spine2, this.leanSmoothed * 0.15);
    if (ctx.turnLean) this.rollBone(this.b.spine1, clamp(ctx.turnLean, -1, 1) * 3 * runW);

    // agachar
    if (crouch > 0.002) this._applyCrouchPose(crouch, this.crouchDrop);

    // pulo / queda
    if (air > 0.002) {
      const vy = ctx.vy || 0;
      const up = smoothstep(-0.5, 3.4, vy) * air;
      const reach = smoothstep(0.5, -7, vy) * air;
      const legs = [
        [this.b.lUpLeg, this.b.lLeg, this.b.lFoot],
        [this.b.rUpLeg, this.b.rLeg, this.b.rFoot],
      ];
      for (const [upB, legB, footB] of legs) {
        this.pitch(upB, -(AIR.thighUp * up) + reach * 7);
        this.pitch(legB, AIR.kneeUp * up + reach * 12);
        this.pitch(footB, AIR.ankleUp * up + AIR.ankleUp * 0.9 * reach);
      }
      this.pitch(this.b.lArm, -AIR.armForward * up);
      this.pitch(this.b.rArm, -AIR.armForward * up);
      this.rollBone(this.b.lArm, -AIR.armOut * up);
      this.rollBone(this.b.rArm, AIR.armOut * up);
      this.pitch(this.b.lForeArm, -18 * up);
      this.pitch(this.b.rForeArm, -18 * up);
      this.pitch(this.b.spine1, 2.5 * up);
    }

    // absorção do pouso
    if (land > 0.002) this._applyLandPose(land, this.landDrop);

    // pés acompanham a inclinação do terreno
    if (ctx.grounded && ctx.terrain) {
      const n = this.groundNormal;
      const footPitch = -Math.atan2(n.z, Math.max(0.25, n.y)) / DEG;
      const footRoll = -Math.atan2(n.x, Math.max(0.25, n.y)) / DEG;
      const wFoot = clamp(1 - air, 0, 1) * 0.85;
      const p = clamp(footPitch, -20, 20) * wFoot;
      const r = clamp(footRoll, -16, 16) * wFoot;
      this.pitch(this.b.lFoot, p);
      this.pitch(this.b.rFoot, p);
      this.rollBone(this.b.lFoot, r);
      this.rollBone(this.b.rFoot, r);
      this.rollBone(this.b.hips, clamp(footRoll, -6, 6) * 0.5);
    }

    // cabeça acompanha o olhar da câmera
    if (ctx.cameraYaw !== undefined && air < 0.5) {
      let dy = ctx.cameraYaw - ctx.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const targetYaw = clamp(dy / DEG, -46, 46) * 0.7;
      const targetPitch = clamp((ctx.cameraPitch || 0) / DEG * 0.35, -16, 16);
      this.lookYawSmoothed = damp(this.lookYawSmoothed, targetYaw, 5, dt);
      this.lookPitchSmoothed = damp(this.lookPitchSmoothed, targetPitch, 5, dt);
      this.yawBone(this.b.neck, this.lookYawSmoothed * 0.45);
      this.yawBone(this.b.head, this.lookYawSmoothed * 0.45);
      this.pitch(this.b.neck, this.lookPitchSmoothed * 0.45);
      this.pitch(this.b.head, this.lookPitchSmoothed * 0.4);
    }

    // passos
    if (this.footstepCallback && this.smoothedSpeed > 0.3 && ctx.grounded) {
      const p0 = prevPhase;
      const p1 = this.phase;
      for (const mark of this.contactPhases) {
        const crossed = p0 <= p1 ? p0 < mark && p1 >= mark : mark > p0 || mark <= p1;
        if (crossed) {
          this.footstepCallback({
            position: this.root.position,
            speed: this.smoothedSpeed,
            crouch,
          });
          break;
        }
      }
    }
  }
}
