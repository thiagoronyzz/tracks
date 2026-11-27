import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { renderView, gridToPNG } from './lib/render.mjs';
import { Character } from '../src/character/character.js';

const scene = new THREE.Scene();
const character = new Character({
  avatar: await loadGLB('public/models/avatar.glb'),
  motion: await loadGLB('public/models/motion_source.glb'),
  scene,
});
const items = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry;
  items.push({ mesh: o, geo: g, pos: g.attributes.position, index: g.index ? g.index.array : null, color: [0.78, 0.66, 0.55], skinned: !!o.isSkinnedMesh });
});
const cvs = [];
const feet = new THREE.Vector3(0, 0, 0);
for (const t of [0.0, 0.5, 1.0, 1.5]) {
  character.idleTime = t;
  character.smoothedSpeed = 0;
  character.update(0.0001, { position: feet, yaw: 0, speed: 0, grounded: true, vy: 0, crouchAmount: 0, landingImpact: 0, terrain: null, cameraYaw: 0, cameraPitch: 0 });
  cvs.push(renderView(items, { scene, w: 300, h: 380, camPos: [0, 1.2, 3.4], target: [0, 0.95, 0], fov: 0.85 }));
}
gridToPNG(cvs, '/tmp/idle-front.png', ['0.0s', '0.5s', '1.0s', '1.5s']);
console.log('ok', 'weights', character.clipWeights, 'phase', character.phase);
