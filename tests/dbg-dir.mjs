import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { Character } from '../src/character/character.js';

const scene = new THREE.Scene();
const ch = new Character({
  avatar: await loadGLB('public/models/avatar.glb'),
  motion: await loadGLB('public/models/motion_source.glb'),
  scene,
});
ch.update(1 / 60, { position: new THREE.Vector3(0, 0, 0), yaw: 0, speed: 0, grounded: true, vy: 0, crouchAmount: 0, landingImpact: 0 });
ch.root.updateMatrixWorld(true);
ch.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });

function centroid(meshName) {
  const v = new THREE.Vector3();
  let m = null;
  ch.holder.traverse((o) => { if (o.isMesh && o.name === meshName) m = o; });
  if (!m) return null;
  const pos = m.geometry.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (m.isSkinnedMesh) m.applyBoneTransform(i, p);
    p.applyMatrix4(m.matrixWorld);
    v.add(p);
  }
  return v.multiplyScalar(1 / pos.count);
}
const beard = centroid('Wolf3D_Beard');
const head = ch.b.head.getWorldPosition(new THREE.Vector3());
const neck = ch.b.neck.getWorldPosition(new THREE.Vector3());
const hips = ch.b.hips.getWorldPosition(new THREE.Vector3());
console.log('head', head.toArray().map((v) => +v.toFixed(2)), 'beard', beard?.toArray().map((v) => +v.toFixed(2)));
if (beard) {
  const d = beard.clone().sub(head); d.y = 0;
  console.log('rosto (head->barba) ângulo', (Math.atan2(d.x, d.z) * 180 / Math.PI).toFixed(1), 'módulo', d.length().toFixed(3));
}
// bico do sapato: vértice mais distante do tornozelo, na horizontal
for (const [bone, name] of [[ch.b.lFoot, 'Left'], [ch.b.rFoot, 'Right']]) {
  const foot = bone.getWorldPosition(new THREE.Vector3());
  let m = null;
  ch.holder.traverse((o) => { if (o.isMesh && o.name === 'Wolf3D_Outfit_Footwear') m = o; });
  const pos = m.geometry.attributes.position;
  const p = new THREE.Vector3();
  let best = null, bestD = -1, yMin = Infinity;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (m.isSkinnedMesh) m.applyBoneTransform(i, p);
    p.applyMatrix4(m.matrixWorld);
    if (Math.hypot(p.x - foot.x, p.z - foot.z) > 0.22) continue; // pertence a este pé
    const d = Math.hypot(p.x - foot.x, p.z - foot.z);
    if (d > bestD) { bestD = d; best = p.clone(); }
    yMin = Math.min(yMin, p.y);
  }
  if (best) {
    const d = best.clone().sub(foot); d.y = 0;
    console.log(`sapato ${name}: bico a ${bestD.toFixed(3)} m do tornozelo, ângulo`, (Math.atan2(d.x, d.z) * 180 / Math.PI).toFixed(1), '| yMin', yMin.toFixed(3));
  }
}
