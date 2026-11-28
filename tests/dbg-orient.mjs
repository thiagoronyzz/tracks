import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGLB } from './lib/glbdom.mjs';
import { Character } from '../src/character/character.js';
import { PlayerController, PHYS_DT } from '../src/character/controller.js';
import { Terrain } from '../src/world/terrain.js';
import { makeGrassTextures } from '../src/world/textures.js';

await RAPIER.init();
const scene = new THREE.Scene();
const world = new RAPIER.World({ x: 0, y: -12.8, z: 0 });
const textures = { grass: makeGrassTextures({ size: 64, anisotropy: 1 }) };
const terrain = new Terrain({ scene, world, RAPIER, anisotropy: 1, textures });
const ch = new Character({
  avatar: await loadGLB('public/models/avatar.glb'),
  motion: await loadGLB('public/models/motion_source.glb'),
  scene,
});
ch.update(1 / 60, { position: new THREE.Vector3(0, 0, 0), yaw: 0, speed: 0, grounded: true, vy: 0, crouchAmount: 0, landingImpact: 0 });
ch.root.updateMatrixWorld(true);
console.log('forwardYaw', ch.retargeter.forwardYaw.toFixed(3), 'holder.y', ch.holder.rotation.y.toFixed(3), 'root.y', ch.root.rotation.y.toFixed(3));
const v = (b) => b.getWorldPosition(new THREE.Vector3());
for (const side of ['Left', 'Right']) {
  const foot = ch.b[side === 'Left' ? 'lFoot' : 'rFoot'];
  const toe = ch.b[side === 'Left' ? 'lToe' : 'rToe'];
  const f = v(foot), t = v(toe);
  const d = t.clone().sub(f); d.y = 0;
  console.log(`pé ${side}: foot->toe =`, d.toArray().map((x) => +x.toFixed(3)), 'ângulo', (Math.atan2(d.x, d.z) * 180 / Math.PI).toFixed(1));
}
const hips = v(ch.b.hips), head = v(ch.b.head), neck = v(ch.b.neck);
console.log('hips', hips.toArray().map((x) => +x.toFixed(2)), 'neck', neck.toArray().map((x) => +x.toFixed(2)), 'head', head.toArray().map((x) => +x.toFixed(2)));
// direção do nariz: eixo local +Z da cabeça em espaço de mundo
const headQ = ch.b.head.getWorldQuaternion(new THREE.Quaternion());
const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(headQ);
console.log('nariz (local +Z da cabeça)', nose.toArray().map((x) => +x.toFixed(3)), 'ângulo', (Math.atan2(nose.x, nose.z) * 180 / Math.PI).toFixed(1));

// ---- rotação: andar em 8 direções relativas à câmera ----
const c = new PlayerController({ RAPIER, world, terrain, spawn: { x: 0, z: -2 } });
const base = { moveX: 0, moveZ: 0, run: false, crouch: false, jumpPressed: false, jumpHeld: false, cameraYaw: Math.PI };
c.yaw = 0;
for (const [mx, mz, name] of [[0, 1, 'frente'], [0, -1, 'trás'], [1, 0, 'direita'], [-1, 0, 'esquerda'], [1, 1, 'diag+'], [-1, -1, 'diag-']]) {
  c.respawn(0, -2);
  c.yaw = 0; c.velocity.set(0, 0, 0);
  for (let i = 0; i < 60; i++) { c.step(PHYS_DT, { ...base, moveX: mx, moveZ: mz }); world.step(); }
  const d = Math.hypot(c.position.x, c.position.z - (-2));
  console.log(name.padEnd(9), 'yaw do personagem', (c.yaw * 180 / Math.PI).toFixed(0).padStart(5),
    '| deslocamento', (c.position.x).toFixed(2), (c.position.z + 2).toFixed(2),
    '| direção do movimento', (Math.atan2(c.velocity.x, c.velocity.z) * 180 / Math.PI).toFixed(0).padStart(5));
}
