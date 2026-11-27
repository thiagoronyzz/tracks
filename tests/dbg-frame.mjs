import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { renderView, toPNG } from './lib/render.mjs';
import { Character } from '../src/character/character.js';

const scene = new THREE.Scene();
const character = new Character({
  avatar: await loadGLB('public/models/avatar.glb'),
  motion: await loadGLB('public/models/motion_source.glb'),
  scene,
});
const feet = new THREE.Vector3(32.28, -2.05, 46.46);
character.update(0.5, { position: feet, yaw: -1.95, speed: 0, grounded: true, vy: 0, crouchAmount: 0, landingImpact: 0 });
character.root.updateMatrixWorld(true);
character.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });

const items = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry;
  items.push({ mesh: o, geo: g, pos: g.attributes.position, index: g.index ? g.index.array : null, color: [0.8, 0.6, 0.5], skinned: !!o.isSkinnedMesh });
});
console.log('itens', items.length, items.map((i) => `${i.mesh.name}:${i.skinned}:${i.pos.count}`).join(' | '));
const camPos = new THREE.Vector3(28.44, -0.16, 45.38);
const target = new THREE.Vector3(32.28, -0.7, 46.46);
const cv = renderView(items, { scene, w: 500, h: 500, camPos: camPos.toArray(), target: target.toArray(), fov: 1.08 });
toPNG(cv, '/tmp/dbg-char.png');
console.log('ok /tmp/dbg-char.png');
