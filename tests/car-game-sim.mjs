// Simula o laço do jogo com carros: assentar, entrar, dirigir, bater, sair.
import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGLB } from './lib/glbdom.mjs';
import { makeGrassTextures } from '../src/world/textures.js';
import { Terrain } from '../src/world/terrain.js';
import { Village } from '../src/world/houses.js';
import { Character } from '../src/character/character.js';
import { PlayerController, PHYS_DT, TUNING } from '../src/character/controller.js';
import { ThirdPersonCamera } from '../src/camera/thirdPerson.js';
import { Car } from '../src/vehicle/car.js';

await RAPIER.init();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.08, 6000);
const world = new RAPIER.World({ x: 0, y: -TUNING.gravity, z: 0 });
world.timestep = PHYS_DT;
const eventQueue = new RAPIER.EventQueue(true);
const textures = { grass: makeGrassTextures({ size: 64, anisotropy: 1 }) };
const terrain = new Terrain({ scene, world, RAPIER, anisotropy: 1, textures });
const village = new Village({ scene, world, RAPIER, terrain, textures, count: 13, anisotropy: 1 });
const character = new Character({
  avatar: await loadGLB('public/models/avatar.glb'),
  motion: await loadGLB('public/models/motion_source.glb'),
  scene,
});
const controller = new PlayerController({ RAPIER, world, terrain, spawn: { x: 0, z: -2 } });
const cam = new ThirdPersonCamera({ camera, world, RAPIER, terrain, playerCollider: controller.collider });

const spots = [{ x: 7.5, z: 4.5, yaw: -1.15 }, { x: -10.5, z: 8, yaw: 2.1 }, { x: 13, z: -8.5, yaw: 0.55 }];
const cars = spots.map((s, i) => new Car({
  scene, world, RAPIER, terrain, eventQueue,
  position: { x: s.x, y: terrain.heightAt(s.x, s.z), z: s.z }, yaw: s.yaw, name: 'carro ' + i,
}));
let impacts = 0;
for (const c of cars) { c.onImpact = () => { impacts++; }; }

const state = { mode: 'foot', active: null, timer: 0 };
const noInput = { moveX: 0, moveZ: 0, run: false, crouch: false, jumpPressed: false, jumpHeld: false };
let simTime = 0;
const camQuat = new THREE.Quaternion();
const carYawOf = (c) => {
  const r = c.body.rotation();
  camQuat.set(r.x, r.y, r.z, r.w);
  return new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(camQuat, 'YXZ').y;
};
function carYaw(c) { return carYawOf(c); }

function stepFixed(inp) {
  if (state.mode === 'foot') {
    controller.step(PHYS_DT, { ...inp, cameraYaw: cam.yaw });
  }
  for (const c of cars) {
    if (state.mode === 'driving' && c === state.active) {
      c.update(PHYS_DT, { throttle: inp.moveZ, steer: -inp.moveX, handbrake: inp.jumpHeld });
    } else {
      c.update(PHYS_DT, {});
    }
  }
  world.step(eventQueue);
  for (const c of cars) c.handleContactEvents(eventQueue);
  simTime += PHYS_DT;
}

function frame(inp) {
  // passos fixos (2 por quadro a 60 fps)
  for (let i = 0; i < 2; i++) stepFixed(inp);
  for (const c of cars) c.syncVisual();
  const driving = state.mode === 'driving';
  const feet = new THREE.Vector3(
    controller.position.x,
    controller.position.y - controller.halfHeight - controller.radius,
    controller.position.z
  );
  let camFeet = feet;
  let camYawTarget = controller.yaw;
  let camSpeed = controller.speed;
  if (driving && state.active) {
    const t = state.active.body.translation();
    camFeet = new THREE.Vector3(t.x, t.y, t.z);
    camYawTarget = carYaw(state.active);
    camSpeed = Math.abs(state.active.forwardSpeed);
  }
  if (!driving) {
    character.update(1 / 60, {
      position: feet, yaw: controller.yaw, speed: controller.speed,
      grounded: controller.grounded, vy: controller.velocity.y,
      crouchAmount: controller.crouchAmount, landingImpact: controller.landingImpact,
      terrain, groundNormal: controller.groundNormal, cameraYaw: cam.yaw, cameraPitch: cam.pitch,
    });
  }
  cam.playerCollider = driving ? state.active.collider : controller.collider;
  cam.update(1 / 60, {
    feetPos: camFeet, yaw: camYawTarget, speed: camSpeed,
    grounded: driving ? true : controller.grounded, landingImpact: 0,
    phase: driving ? 0 : character.phase,
  });
  // transições
  if (state.mode === 'entering' || state.mode === 'exiting') {
    state.timer -= 1 / 60;
    if (state.timer <= 0) {
      if (state.mode === 'entering') {
        state.mode = 'driving';
        state.active.openDoor('left', false);
        character.root.visible = false;
        controller.collider.setEnabled(false);
      } else {
        const p = state.active.exitPosition();
        controller.respawn(p.x, p.z);
        controller.collider.setEnabled(true);
        character.root.visible = true;
        state.mode = 'foot';
        state.active.openDoor('left', false);
        state.active = null;
      }
    }
  }
}

const report = (label) => {
  const car = state.active || cars[0];
  const t = car.body.translation();
  const gateY = terrain.heightAt(t.x, t.z);
  console.log(label.padEnd(22), 'modo', state.mode.padEnd(9),
    'carro', t.x.toFixed(1), t.y.toFixed(2), t.z.toFixed(1),
    '| chão', gateY.toFixed(2), '| km/h', car.speedKmh.toFixed(0),
    '| porta', car.doorAngle.left.toFixed(2),
    '| health', car.health.toFixed(2),
    '| câmera', camera.position.y.toFixed(2));
};

for (let i = 0; i < 90; i++) frame(noInput);
report('assentar');
for (const c of cars) {
  const t = c.body.translation();
  const q = new THREE.Quaternion(c.body.rotation().x, c.body.rotation().y, c.body.rotation().z, c.body.rotation().w);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  console.log('  carro em', t.x.toFixed(1), t.z.toFixed(1), '| dist do spawn',
    Math.hypot(t.x - c.spawn.x, t.z - c.spawn.z).toFixed(2), '| up.y', up.y.toFixed(3),
    '| rodas no chão', c.wheels.map((w) => (c.vehicle.wheelIsInContact(w.index) ? 'C' : '-')).join(''));
}

// anda até o carro 1 e entra
const car1 = cars[0];
const t1 = car1.body.translation();
controller.respawn(t1.x + 2.6, t1.z + 1.4);
for (let i = 0; i < 10; i++) frame(noInput);
state.mode = 'entering';
state.active = car1;
state.timer = 0.58;
car1.openDoor('left', true);
for (let i = 0; i < 4; i++) frame(noInput);
report('porta abrindo');
for (let i = 0; i < 45; i++) frame(noInput);
report('entrou');
for (let i = 0; i < 200; i++) frame({ ...noInput, moveZ: 1 });
report('acelerou');
for (let i = 0; i < 200; i++) frame({ ...noInput, moveZ: 1, moveX: 1 });
report('curvou');
for (let i = 0; i < 120; i++) frame({ ...noInput, moveZ: 1 });
report('reta de novo');
// bate numa casa
const house = village.houses[6];
const t2 = car1.body.translation();
console.log('casa alvo', house.x.toFixed(0), house.z.toFixed(0), '| carro', t2.x.toFixed(0), t2.z.toFixed(0));
let crashed = false;
for (let i = 0; i < 60 * 12; i++) {
  const t = car1.body.translation();
  const dx = house.x - t.x;
  const dz = house.z - t.z;
  const yaw = carYaw(car1);
  // mira: vira o volante para apontar para a casa
  const want = Math.atan2(dx, dz);
  let diff = want - yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  frame({ ...noInput, moveZ: 1, moveX: Math.max(-1, Math.min(1, -diff * 1.6)) });
  if (car1.damage > 0.01 && !crashed) {
    crashed = true;
    console.log('  bateu na casa em', (i / 60).toFixed(1), 's | km/h', car1.speedKmh.toFixed(0), '| health', car1.health.toFixed(2));
  }
}
const tEnd = car1.body.translation();
console.log('depois da batida: pos', tEnd.x.toFixed(1), tEnd.z.toFixed(1), '| health', car1.health.toFixed(3), '| morto', car1.dead,
  '| impactos', impacts, '| fogo', car1.fire.parts.filter((p) => p.alive).length);
// sai do carro
car1.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
state.mode = 'exiting';
state.timer = 0.5;
car1.openDoor('left', true);
for (let i = 0; i < 5; i++) frame(noInput);
report('abrindo para sair');
for (let i = 0; i < 40; i++) frame(noInput);
report('saiu');
const feetAfter = controller.position.y - controller.halfHeight - controller.radius;
console.log('personagem visível', character.root.visible, '| colisor ativo', controller.collider.isEnabled?.(),
  '| pé no chão?', (feetAfter - terrain.heightAt(controller.position.x, controller.position.z)).toFixed(3));
for (let i = 0; i < 90; i++) frame({ ...noInput, moveZ: 1 });
console.log('anda depois de sair: pos', controller.position.x.toFixed(1), controller.position.z.toFixed(1),
  '| pé no chão', (controller.position.y - controller.halfHeight - controller.radius - terrain.heightAt(controller.position.x, controller.position.z)).toFixed(3));
