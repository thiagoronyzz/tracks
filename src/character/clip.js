// Amostragem e mistura dos clipes assados (substitui o AnimationMixer, para
// termos controle exato de fase, sincronia de passos e blend sem deriva).

import * as THREE from 'three';

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _acc = new THREE.Quaternion();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pAcc = new THREE.Vector3();

export function sampleQuat(track, t, out) {
  const { quats, frames, step } = track;
  if (!quats) return out.identity();
  const maxF = frames - 1;
  let f = t / step;
  if (!(f > 0)) f = 0;
  else if (f > maxF) f = maxF;
  const i0 = f | 0;
  const i1 = i0 + 1 > maxF ? maxF : i0 + 1;
  const a = f - i0;
  _qa.fromArray(quats, i0 * 4);
  if (i1 === i0) {
    out.copy(_qa);
  } else {
    _qb.fromArray(quats, i1 * 4);
    out.slerpQuaternions(_qa, _qb, a);
  }
  return out;
}

export function samplePos(track, t, out) {
  const { positions, frames, step } = track;
  if (!positions) return out.set(0, 0, 0);
  const maxF = frames - 1;
  let f = t / step;
  if (!(f > 0)) f = 0;
  else if (f > maxF) f = maxF;
  const i0 = f | 0;
  const i1 = i0 + 1 > maxF ? maxF : i0 + 1;
  const a = f - i0;
  _pa.fromArray(positions, i0 * 4);
  if (i1 === i0) {
    out.copy(_pa);
  } else {
    _pb.fromArray(positions, i1 * 4);
    out.lerpVectors(_pa, _pb, a);
  }
  return out;
}

/** Une os clipes em uma lista de trilhas por osso (mesma ordem em todos). */
export function buildBoneTracks(clips) {
  const map = new Map();
  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci];
    for (const b of clip.bones) {
      let e = map.get(b.name);
      if (!e) {
        e = { name: b.name, bone: b.bone, tracks: new Array(clips.length).fill(null) };
        map.set(b.name, e);
      }
      e.tracks[ci] = b;
    }
  }
  return [...map.values()];
}

/**
 * Aplica a mistura de poses nos ossos.
 * @param {Array} tracks resultado de buildBoneTracks
 * @param {Array} weights pesos (serão normalizados)
 * @param {Array} times tempo de cada clipe
 * @param {string} hipName osso cuja translação deve ser misturada
 */
export function applyPose(tracks, weights, times, hipName = 'Hips') {
  for (const tr of tracks) {
    let hasAny = false;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] > 0.0008 && tr.tracks[i]) { hasAny = true; break; }
    }
    if (!hasAny) continue;

    let accW = 0;
    let posW = 0;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i];
      if (w <= 0.0008) continue;
      const track = tr.tracks[i];
      if (!track) continue;
      sampleQuat(track, times[i], _q);
      if (accW === 0) {
        _acc.copy(_q);
        accW = w;
      } else {
        accW += w;
        _acc.slerp(_q, w / accW);
      }
      if (tr.name === hipName && track.positions) {
        samplePos(track, times[i], _pAcc);
        const prevW = posW;
        posW += w;
        const px = _pAcc.x, py = _pAcc.y, pz = _pAcc.z;
        if (prevW === 0) {
          tr._px = px; tr._py = py; tr._pz = pz;
        } else {
          tr._px = (tr._px * prevW + px * w) / posW;
          tr._py = (tr._py * prevW + py * w) / posW;
          tr._pz = (tr._pz * prevW + pz * w) / posW;
        }
      }
    }
    if (accW > 0) {
      tr.bone.quaternion.copy(_acc);
      if (tr.name === hipName && posW > 0) {
        tr.bone.position.set(tr._px, tr._py, tr._pz);
      }
    }
  }
}

export function createTempQuat() {
  return new THREE.Quaternion();
}
