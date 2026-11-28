import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeGrassTextures } from '../src/world/textures.js';
import { Terrain } from '../src/world/terrain.js';
import { PlayerController, PHYS_DT, TUNING } from '../src/character/controller.js';

await RAPIER.init();
const scene = new THREE.Scene();
const world = new RAPIER.World({ x: 0, y: -TUNING.gravity, z: 0 });
const textures = { grass: makeGrassTextures({ size: 64, anisotropy: 1 }) };
const terrain = new Terrain({ scene, world, RAPIER, anisotropy: 1, textures });
const c = new PlayerController({ RAPIER, world, terrain, spawn: { x: 0, z: -2 } });
const noInput = { moveX: 0, moveZ: 0, run: false, crouch: false, jumpPressed: false, jumpHeld: false };
const report = (label) => {
  const t = c.collider.translation();
  const shape = c.collider.shape;
  console.log(label.padEnd(22),
    'pos.y', c.position.y.toFixed(3),
    'caption', t.y.toFixed(3),
    'hh', c.halfHeight, 'r', c.radius,
    'shapeHH', shape.halfHeight?.toFixed(3), 'shapeR', shape.radius?.toFixed(3),
    'grounded', c.grounded,
    'feetGap', (c.position.y - c.halfHeight - c.radius - terrain.heightAt(c.position.x, c.position.z)).toFixed(3),
    'vy', c.velocity.y.toFixed(2));
};
for (let i = 0; i < 60; i++) { c.step(PHYS_DT, noInput); world.step(); }
report('idle after 0.5s');
c.step(PHYS_DT, { ...noInput, crouch: true });
world.step();
report('just crouched');
for (let i = 0; i < 30; i++) { c.step(PHYS_DT, { ...noInput, crouch: true }); world.step(); }
report('crouch 0.25s');
for (let i = 0; i < 60; i++) { c.step(PHYS_DT, { ...noInput, crouch: true }); world.step(); }
report('crouch 0.75s');
for (let i = 0; i < 120; i++) { c.step(PHYS_DT, noInput); world.step(); }
report('stand 1s');
for (let i = 0; i < 60; i++) { c.step(PHYS_DT, noInput); world.step(); }
report('stand 1.5s');
console.log('collider count on body', c.body.numColliders());
