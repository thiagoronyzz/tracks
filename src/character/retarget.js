// Retargeting de animação Mixamo -> avatar (ambos usam o esqueleto Mixamo).
//
// O avatar vem em A-pose e o pacote de animações em T-pose. Copiar rotações
// locais quebraria os braços, então a transferência é feita em espaço de mundo:
//
//   A_target(b) = M * (RT_b * RS_b^-1) * A_source(b)
//
// onde RS/RT são as matrizes de mundo em repouso (com o alvo corrigido para
// T-pose) e M corrige a direção "para frente" (o modelo olha para +Z).
// O resultado é assado em keyframes de quaternion, o que permite usar o
// AnimationMixer normal (blend/crossfade) sem custo de retarget em runtime.

import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export function normalizeBoneName(name) {
  return String(name || '').replace(/^mixamorig:?/i, '');
}

export function collectBones(root) {
  const map = new Map();
  root.traverse((o) => {
    if (o.isBone) {
      const key = normalizeBoneName(o.name);
      if (!map.has(key)) map.set(key, o);
    }
  });
  return map;
}

function depthOf(obj, root) {
  let d = 0, p = obj.parent;
  while (p && p !== root) { d++; p = p.parent; }
  return d;
}

const ONE = new THREE.Vector3(1, 1, 1);
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();

/** Matriz de mundo do osso sem escala (as duas malhas usam unidades diferentes). */
function rigidWorld(bone) {
  bone.getWorldPosition(_pos);
  bone.getWorldQuaternion(_quat);
  return new THREE.Matrix4().compose(_pos.clone(), _quat.clone(), ONE);
}

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Substitui a rotação de mundo de um osso, mantendo a hierarquia coerente. */
function setWorldQuaternion(bone, worldQuat) {
  const parent = bone.parent;
  parent.updateWorldMatrix(true, false);
  const parentWorldQ = parent.getWorldQuaternion(_q1).clone();
  bone.quaternion.copy(parentWorldQ.invert().multiply(worldQuat));
  bone.updateMatrixWorld(true);
}

/**
 * Leva os braços do repouso (A-pose) para um T-pose horizontal. Serve apenas
 * como pose de referência do alvo: as rotações dos ossos do avatar passam a
 * ter o mesmo "zero" que as do pacote de animação.
 */
export function straightenArmsToTPose(bones, root) {
  root.updateMatrixWorld(true);
  for (const side of ['Left', 'Right']) {
    const arm = bones.get(side + 'Arm');
    const fore = bones.get(side + 'ForeArm');
    const hand = bones.get(side + 'Hand');
    if (!arm || !fore) continue;

    const shoulderPos = arm.getWorldPosition(new THREE.Vector3());
    const elbowPos = fore.getWorldPosition(new THREE.Vector3());
    const armDir = elbowPos.clone().sub(shoulderPos);
    if (armDir.lengthSq() < 1e-8) continue;

    // direção desejada: horizontal, apontando para fora
    const sign = side === 'Left' ? 1 : -1;
    const targetDir = new THREE.Vector3(sign, 0, 0);
    // no espaço local do modelo (o root do avatar não tem rotação)
    const worldTarget = targetDir.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    const delta = new THREE.Quaternion().setFromUnitVectors(armDir.clone().normalize(), worldTarget);
    const newWorldQ = delta.multiply(arm.getWorldQuaternion(new THREE.Quaternion()));
    setWorldQuaternion(arm, newWorldQ);

    // endireita o antebraço em relação ao braço
    root.updateMatrixWorld(true);
    if (hand) {
      const elbow2 = fore.getWorldPosition(new THREE.Vector3());
      const wrist = hand.getWorldPosition(new THREE.Vector3());
      const foreDir = wrist.clone().sub(elbow2);
      const upper = elbow2.clone().sub(arm.getWorldPosition(new THREE.Vector3()));
      if (foreDir.lengthSq() > 1e-8 && upper.lengthSq() > 1e-8) {
        const d2 = new THREE.Quaternion().setFromUnitVectors(
          foreDir.clone().normalize(),
          upper.clone().normalize()
        );
        const nw = d2.multiply(fore.getWorldQuaternion(new THREE.Quaternion()));
        setWorldQuaternion(fore, nw);
      }
    }
    root.updateMatrixWorld(true);
  }
}

/**
 * Alinha o "roll" (torção em torno do próprio osso) do esqueleto de destino ao
 * da origem. Sem isso, membros giram em torno do eixo errado quando o pacote de
 * animação vem de outro rig (o clássico braço atravessando o corpo).
 */
export function alignBoneFrames(pairs, targetRoot) {
  targetRoot.updateMatrixWorld(true);
  for (const p of pairs) {
    const tb = p.tb, sb = p.sb;
    // eixo do osso: direção até o primeiro filho (no destino)
    let child = null;
    for (const q of p.tb.children) { if (q.isBone) { child = q; break; } }
    if (!child) continue;
    const bonePos = tb.getWorldPosition(new THREE.Vector3());
    const childPos = child.getWorldPosition(new THREE.Vector3());
    const axis = childPos.sub(bonePos);
    if (axis.lengthSq() < 1e-8) continue;
    axis.normalize();

    const qS = sb.getWorldQuaternion(new THREE.Quaternion());
    const qT = tb.getWorldQuaternion(new THREE.Quaternion());
    const res = qS.clone().multiply(qT.clone().invert()); // leva frame do alvo ao da origem
    // decomposição swing/twist em torno do eixo do osso
    const d = res.x * axis.x + res.y * axis.y + res.z * axis.z;
    let phi = 2 * Math.atan2(d, res.w);
    if (phi > Math.PI) phi -= 2 * Math.PI;
    if (phi < -Math.PI) phi += 2 * Math.PI;
    if (Math.abs(phi) < 1e-4) continue;
    const twist = new THREE.Quaternion().setFromAxisAngle(axis, phi);
    const newWorldQ = twist.multiply(qT);
    setWorldQuaternion(tb, newWorldQ);
    targetRoot.updateMatrixWorld(true);
  }
}

export class Retargeter {
  /**
   * @param {THREE.Object3D} sourceRoot  modelo de origem (com as animações)
   * @param {THREE.Object3D} targetRoot  avatar que vai receber as animações
   */
  constructor(sourceRoot, targetRoot) {
    this.sourceRoot = sourceRoot;
    this.targetRoot = targetRoot;
    this.sourceBones = collectBones(sourceRoot);
    this.targetBones = collectBones(targetRoot);

    this.pairs = [];
    for (const [name, sb] of this.sourceBones) {
      const tb = this.targetBones.get(name);
      if (!tb) continue;
      this.pairs.push({ name, sb, tb, depth: depthOf(sb, sourceRoot) });
    }
    this.pairs.sort((a, b) => a.depth - b.depth);

    // pose de referência do alvo: T-pose
    straightenArmsToTPose(this.targetBones, targetRoot);
    sourceRoot.updateMatrixWorld(true);
    targetRoot.updateMatrixWorld(true);
    alignBoneFrames(this.pairs, targetRoot);

    sourceRoot.updateMatrixWorld(true);
    targetRoot.updateMatrixWorld(true);

    this.restSource = new Map();
    this.restTarget = new Map();
    for (const p of this.pairs) {
      this.restSource.set(p.name, rigidWorld(p.sb));
      this.restTarget.set(p.name, rigidWorld(p.tb));
    }

    // direção para onde o rig de origem olha em repouso (média dos dois pés,
    // o que cancela a abertura natural dos pés). O modelo visual é girado por
    // esse valor para que "para frente" seja +Z no espaço do personagem.
    this.forwardYaw = 0;
    const dirs = [];
    for (const side of ['Left', 'Right']) {
      const foot = this.sourceBones.get(side + 'Foot');
      const toe = this.sourceBones.get(side + 'ToeBase');
      if (!foot || !toe) continue;
      const f = foot.getWorldPosition(new THREE.Vector3());
      const t = toe.getWorldPosition(new THREE.Vector3());
      const dir = t.sub(f);
      dir.y = 0;
      if (dir.lengthSq() > 1e-8) dirs.push(dir.normalize());
    }
    if (dirs.length) {
      const avg = dirs.reduce((a, d) => a.add(d), new THREE.Vector3()).normalize();
      const yaw = Math.atan2(avg.x, avg.z);
      this.forwardYaw = -yaw;
    }

    // matrizes fixas de transferência por osso
    this.maps = new Map();
    for (const p of this.pairs) {
      const m = new THREE.Matrix4()
        .copy(this.restTarget.get(p.name))
        .multiply(new THREE.Matrix4().copy(this.restSource.get(p.name)).invert());
      this.maps.set(p.name, m);
    }

    // alvo: posição de repouso local dos ossos (para restaurar depois)
    this.restLocalPosition = new Map();
    for (const p of this.pairs) {
      this.restLocalPosition.set(p.name, p.tb.position.clone());
    }
  }

  /**
   * Assa um clipe de origem em um clipe do avatar.
   * @param {THREE.AnimationClip} clip
   * @param {number} fps
   */
  bake(clip, fps = 30) {
    const src = this.sourceRoot;
    const mixer = new THREE.AnimationMixer(src);
    const action = mixer.clipAction(clip);
    action.play();

    const duration = Math.max(clip.duration, 1 / fps);
    const steps = Math.max(2, Math.round(duration * fps));
    const times = new Float32Array(steps + 1);

    const quats = new Map();
    const positions = new Map();
    for (const p of this.pairs) {
      quats.set(p.name, new Float32Array((steps + 1) * 4));
      if (p.name === 'Hips') positions.set(p.name, new Float32Array((steps + 1) * 4));
    }

    const worldTarget = new Map();
    const localMat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * duration;
      times[s] = t;
      mixer.setTime(t);
      src.updateMatrixWorld(true);

      worldTarget.clear();
      for (const p of this.pairs) {
        const at = new THREE.Matrix4()
          .copy(this.maps.get(p.name))
          .multiply(rigidWorld(p.sb));
        worldTarget.set(p.name, at);

        const parent = p.tb.parent;
        const parentName = parent ? normalizeBoneName(parent.name) : null;
        const parentTarget = parentName && worldTarget.has(parentName) ? worldTarget.get(parentName) : null;

        if (parentTarget) {
          localMat.copy(parentTarget).invert().multiply(at);
        } else {
          localMat.copy(at);
        }
        localMat.decompose(pos, quat, scale);

        const qa = quats.get(p.name);
        qa[s * 4 + 0] = quat.x; qa[s * 4 + 1] = quat.y; qa[s * 4 + 2] = quat.z; qa[s * 4 + 3] = quat.w;

        const pa = positions.get(p.name);
        if (pa) { pa[s * 4 + 0] = pos.x; pa[s * 4 + 1] = pos.y; pa[s * 4 + 2] = pos.z; pa[s * 4 + 3] = 1; }
      }
    }

    action.stop();
    mixer.uncacheRoot(src);

    const frames = steps + 1;
    const step = duration / steps;
    const bones = [];
    for (const p of this.pairs) {
      const pa = positions.get(p.name) || null;
      bones.push({ name: p.name, bone: p.tb, quats: quats.get(p.name), positions: pa, frames, step });
    }

    return {
      name: clip.name,
      duration,
      frames,
      step,
      bones,
    };
  }
}

/**
 * Assa todos os clipes. Precisa de um nome normalizado por clipe.
 * @returns {Record<string, THREE.AnimationClip>}
 */
