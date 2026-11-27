import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { Character } from '../src/character/character.js';
const avatar = await loadGLB('public/models/avatar.glb');
const motion = await loadGLB('public/models/motion_source.glb');
const scene = new THREE.Scene();
const ch = new Character({ avatar, motion, scene });
console.log('contacts', ch.contactPhases, 'offset', ch.modelOffsetY, 'crouchDrop', ch.crouchDrop);
const v = new THREE.Vector3();
function lowestFoot() {
  ch.root.updateMatrixWorld(true);
  let min = Infinity;
  for (const m of ch.footMeshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) {
      v.fromBufferAttribute(pos, i);
      if (m.isSkinnedMesh) m.applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld);
      if (v.y < min) min = v.y;
    }
  }
  return min;
}
for (const speed of [0, 1.78, 3.95]) {
  const base = { position: new THREE.Vector3(), yaw: 0, speed, grounded: true, vy: 0, crouchAmount: 0, landingImpact: 0 };
  ch.smoothedSpeed = speed;
  let lo = Infinity, hi = -Infinity;
  const N = 120;
  for (let i = 0; i < N; i++) {
    ch.phase = (i / N);
    ch.update(1/120, base);
    const y = lowestFoot();
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  console.log('speed', speed, 'footwear Y min', lo.toFixed(3), 'max', hi.toFixed(3));
}
