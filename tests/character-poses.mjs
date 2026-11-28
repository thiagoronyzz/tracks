import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { collectSkinned, renderView, gridToPNG, updateSkin } from './lib/render.mjs';
import { Character } from '../src/character/character.js';

const avatar = await loadGLB('public/models/avatar.glb');
const motion = await loadGLB('public/models/motion_source.glb');
const scene = new THREE.Scene();
const ch = new Character({ avatar, motion, scene });
console.log('modelOffsetY', ch.modelOffsetY.toFixed(4), 'measure', ch.measure, 'contacts', ch.contactPhases.map(p=>+p.toFixed(2)));
const items = collectSkinned(scene);

const footwear = items.filter(i => /foot|shoe|boot/i.test(i.mesh.name + ' ' + (i.mesh.material?.name || '')));
const all = items;
const v = new THREE.Vector3();
function minY(list) {
  let m = Infinity;
  for (const it of list) {
    for (let i = 0; i < it.pos.count; i += Math.max(1, Math.floor(it.pos.count/800))) {
      v.fromBufferAttribute(it.pos, i);
      if (it.skinned) it.mesh.applyBoneTransform(i, v);
      v.applyMatrix4(it.mesh.matrixWorld);
      if (v.y < m) m = v.y;
    }
  }
  return m;
}
function headY() {
  const h = ch.b.head;
  return h ? h.getWorldPosition(new THREE.Vector3()).y : 0;
}

const base = { position: new THREE.Vector3(0,0,0), yaw: 0, speed: 0, grounded: true, vy: 0, crouchAmount: 0, landingImpact: 0, cameraYaw: Math.PI, cameraPitch: 0.15 };
const dt = 1/60;
function run(seconds, overrides) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    ch.update(dt, { ...base, ...overrides });
  }
  updateSkin(scene);
}
function shot(label, camPos, target=[0,0.95,0]) {
  updateSkin(scene);
  const cv = renderView(items, { scene, w: 330, h: 560, camPos, target, fov: 0.72 });
  console.log(label.padEnd(12), 'lowest mesh Y', minY(all).toFixed(3), 'footwear', minY(footwear).toFixed(3), 'head', headY().toFixed(3));
  return cv;
}

const views = [];
run(1.0, {});
views.push(shot('idle', [0.4, 1.35, 3.2]));
views.push(shot('idle-side', [3.2, 1.35, 0.4]));

run(0.7, { speed: 1.78 });
views.push(shot('walk', [1.6, 1.35, 3.0]));
views.push(shot('walk-side', [3.2, 1.35, 0.2]));

run(0.9, { speed: 3.95 });
views.push(shot('run', [1.6, 1.35, 3.0]));
views.push(shot('run-side', [3.2, 1.35, 0.2]));

run(0.6, { speed: 0, crouchAmount: 1 });
views.push(shot('crouch', [1.2, 1.2, 3.0]));
views.push(shot('crouch-side', [3.1, 1.2, 0.2]));

run(0.3, { speed: 0, crouchAmount: 0, grounded: false, vy: 3.0 });
views.push(shot('jump-up', [1.4, 1.35, 3.0]));
run(0.25, { speed: 2.0, crouchAmount: 0, grounded: false, vy: -4.0 });
views.push(shot('jump-fall', [1.4, 1.35, 3.0]));

run(0.05, { speed: 0.3, crouchAmount: 0, grounded: true, vy: 0, landingImpact: 0.9 });
views.push(shot('land', [1.4, 1.35, 3.0]));

gridToPNG(views, '/tmp/char-poses.png');
console.log('wrote /tmp/char-poses.png');
