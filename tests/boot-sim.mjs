// Simula o jogo completo (mundo + personagem + controlador + câmera) sem GPU.
import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGLB } from './lib/glbdom.mjs';
import {
  makeGrassTextures, makeRoofTexture, makeWoodTexture, makePlasterTexture,
  makeStoneTexture, makeBarkTexture,
} from '../src/world/textures.js';
import { Terrain } from '../src/world/terrain.js';
import { Sky } from '../src/world/sky.js';
import { Village } from '../src/world/houses.js';
import { Scenery } from '../src/world/props.js';
import { GrassField } from '../src/world/grass.js';
import { Character } from '../src/character/character.js';
import { PlayerController, PHYS_DT, TUNING } from '../src/character/controller.js';
import { ThirdPersonCamera } from '../src/camera/thirdPerson.js';

const t0 = Date.now();
await RAPIER.init();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 16/9, 0.08, 6000);
const world = new RAPIER.World({ x: 0, y: -TUNING.gravity, z: 0 });
const textures = {
  grass: makeGrassTextures({ size: 128, anisotropy: 4 }),
  roof: makeRoofTexture('#8f4433', { size: 128 }),
  wood: makeWoodTexture('#6b4a30', { size: 128 }),
  plaster: makePlasterTexture('#efe9dc', { size: 128 }),
  stone: makeStoneTexture('#8f877a', { size: 128 }),
  bark: makeBarkTexture('#5d4834', { size: 128 }),
};
console.log('textures', Date.now() - t0, 'ms');

const t1 = Date.now();
const terrain = new Terrain({ scene, world, RAPIER, anisotropy: 4, textures });
console.log('terrain', Date.now() - t1, 'ms; tris', terrain.geometry.index.count / 3);
const t2 = Date.now();
const sky = new Sky({ scene, sunAzimuth: 52, sunElevation: 26, shadowMapSize: 512, shadows: true });
console.log('sky', Date.now() - t2, 'ms');
const t3 = Date.now();
const village = new Village({ scene, world, RAPIER, terrain, textures, count: 13, anisotropy: 4 });
console.log('village', Date.now() - t3, 'ms; houses', village.houses.length, village.houses.map(h=>[+h.x.toFixed(0),+h.z.toFixed(0)]));
const occupied = village.houses.map(h => ({ x: h.x, z: h.z, r: h.radius + 2.5 }));
const t4 = Date.now();
const scenery = new Scenery({ scene, world, RAPIER, terrain, textures, occupied, anisotropy: 4 });
console.log('scenery', Date.now() - t4, 'ms; trees', scenery.trees.length);
const t5 = Date.now();
const grass = new GrassField({ scene, terrain, count: 3000, radius: 30, anisotropy: 4 });
console.log('grass built', Date.now() - t5, 'ms');

const t6 = Date.now();
const avatar = await loadGLB('public/models/avatar.glb');
const motion = await loadGLB('public/models/motion_source.glb');
const character = new Character({ avatar, motion, scene });
console.log('character', Date.now() - t6, 'ms; clips', character.clips.list.map(c => c.name + '@' + c.duration.toFixed(2)));

const controller = new PlayerController({ RAPIER, world, terrain, spawn: { x: 0, z: -2 } });
const cam = new ThirdPersonCamera({ camera, world, RAPIER, terrain, playerCollider: controller.collider });
cam.yaw = controller.yaw;

// ---- simulação -----------------------------------------------------------
const feet = new THREE.Vector3(
  controller.position.x,
  controller.position.y - controller.halfHeight - controller.radius,
  controller.position.z
);
let simTime = 0;
const history = [];
let errors = 0;

function simulate(seconds, input, label) {
  const steps = Math.round(seconds / PHYS_DT);
  let minFootGap = Infinity, maxFootGap = -Infinity, maxY = -Infinity, minY = Infinity;
  for (let i = 0; i < steps; i++) {
    controller.step(PHYS_DT, { ...input, cameraYaw: cam.yaw });
    world.step();
    simTime += PHYS_DT;
    const fx = controller.position.x, fz = controller.position.z;
    const fy = controller.position.y - controller.halfHeight - controller.radius;
    const ground = terrain.heightAt(fx, fz);
    const gap = fy - ground;
    if (controller.grounded) {
      minFootGap = Math.min(minFootGap, gap);
      maxFootGap = Math.max(maxFootGap, gap);
    }
    maxY = Math.max(maxY, fy);
    minY = Math.min(minY, fy);
    if (!Number.isFinite(controller.position.x) || !Number.isFinite(controller.position.y)) {
      throw new Error('posição NaN em ' + label);
    }
  }
  // render-side updates
  feet.set(controller.position.x, controller.position.y - controller.halfHeight - controller.radius, controller.position.z);
  character.update(1/60, {
    position: feet, yaw: controller.yaw, speed: controller.speed,
    grounded: controller.grounded, vy: controller.velocity.y,
    crouchAmount: controller.crouchAmount, landingImpact: controller.landingImpact,
    terrain, groundNormal: controller.groundNormal, cameraYaw: cam.yaw, cameraPitch: cam.pitch,
  });
  cam.playerCollider = controller.collider;
  cam.update(1/60, { feetPos: feet, yaw: controller.yaw, speed: controller.speed, grounded: controller.grounded, landingImpact: 0, phase: character.phase });
  grass.update(simTime, feet);
  sky.update(1/60, camera, feet, simTime);
  console.log(
    label.padEnd(18),
    'pos', controller.position.x.toFixed(2), controller.position.y.toFixed(2), controller.position.z.toFixed(2),
    '| grounded', controller.grounded ? 'Y' : 'n',
    '| footGap', minFootGap === Infinity ? '-' : (minFootGap.toFixed(3) + '..' + maxFootGap.toFixed(3)),
    '| cameraY', camera.position.y.toFixed(2)
  );
  return { minFootGap, maxFootGap, maxY, minY };
}

const noInput = { moveX: 0, moveZ: 0, run: false, crouch: false, jumpPressed: false, jumpHeld: false };
simulate(1.0, noInput, 'spawn/idle');
simulate(2.0, { ...noInput, moveZ: 1 }, 'walk fwd');
simulate(1.5, { ...noInput, moveZ: 1, run: true }, 'run fwd');
simulate(1.2, { ...noInput, moveX: 1 }, 'strafe right');
simulate(1.0, { ...noInput, moveZ: -1, run: true }, 'run back');
simulate(0.5, { ...noInput, crouch: true }, 'crouch');
simulate(1.0, { ...noInput, crouch: true, moveZ: 1 }, 'crouch walk');
simulate(0.5, { ...noInput }, 'stand up');
// pulo
let apex = -Infinity, startY = null, landed = false;
const y0 = controller.position.y;
for (let i = 0; i < 240; i++) {
  const pressed = i === 0;
  controller.step(PHYS_DT, { ...noInput, jumpPressed: pressed, jumpHeld: i < 12 });
  world.step();
  apex = Math.max(apex, controller.position.y);
  if (i > 5 && controller.grounded) { landed = true; if (i > 20) break; }
}
console.log('jump height', (apex - y0).toFixed(3), 'landed', landed, 'airtime', controller.airTime.toFixed(2));
// curto (solta o botão)
const y1 = controller.position.y;
let apex2 = -Infinity;
for (let i = 0; i < 200; i++) {
  controller.step(PHYS_DT, { ...noInput, jumpPressed: i === 0, jumpHeld: i < 3 });
  world.step();
  apex2 = Math.max(apex2, controller.position.y);
  if (i > 5 && controller.grounded) break;
}
console.log('short jump height', (apex2 - y1).toFixed(3));

// ---- colisão com casa ---------------------------------------------------
const house = village.houses[0];
const hp = new THREE.Vector3(house.x, 0, house.z);
const dirToHouse = new THREE.Vector3(house.x, 0, house.z).normalize().multiplyScalar(-1);
controller.respawn(house.x + dirToHouse.x * 30, house.z + dirToHouse.z * 30);
cam.yaw = Math.atan2(dirToHouse.x, dirToHouse.z) + Math.PI;
const before = controller.position.clone();
let minDist = Infinity;
for (let i = 0; i < 900; i++) {
  controller.step(PHYS_DT, { ...noInput, moveZ: 1, run: true, cameraYaw: cam.yaw });
  world.step();
  const d = Math.hypot(controller.position.x - house.x, controller.position.z - house.z);
  minDist = Math.min(minDist, d);
}
console.log('casa: distância mínima ao centro', minDist.toFixed(2), 'raio da casa', house.radius.toFixed(2), '| pos', controller.position.x.toFixed(1), controller.position.z.toFixed(1));
console.log('casa: atravessou?', minDist < house.radius * 0.55 ? 'SIM (bug)' : 'não');

// ---- caminhada longa (10 s) por terreno variado --------------------------
controller.respawn(0, -2);
cam.yaw = 0;
let maxGap = 0, minGap = 1e9, nan = false, steps = 0;
const path = [];
for (let i = 0; i < 1200; i++) {
  const t = i * PHYS_DT;
  const input = { ...noInput, moveZ: 1, run: (i % 300) > 150, crouch: (i % 400) > 340, jumpPressed: i % 260 === 0, jumpHeld: (i % 260) < 20 };
  controller.step(PHYS_DT, { ...input, cameraYaw: 0.35 * Math.sin(t * 0.2) });
  world.step();
  const fy = controller.position.y - controller.halfHeight - controller.radius;
  const g = terrain.heightAt(controller.position.x, controller.position.z);
  if (controller.grounded) { maxGap = Math.max(maxGap, fy - g); minGap = Math.min(minGap, fy - g); }
  if (!Number.isFinite(controller.position.y)) nan = true;
  steps++;
  if (i % 200 === 0) path.push([+controller.position.x.toFixed(1), +controller.position.z.toFixed(1), +fy.toFixed(2)]);
}
console.log('10s: passos', steps, 'NaN?', nan, 'gap do pé (chão)', minGap.toFixed(3), maxGap.toFixed(3), 'trajeto', path);
console.log('personagem acima do terreno?', controller.position.y - controller.halfHeight - controller.radius > terrain.heightAt(controller.position.x, controller.position.z) - 1.5);
console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(1), 's');
