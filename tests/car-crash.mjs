// Verifica a curva de dano: encostar devagar não amassa, bater rápido destrói.
import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeGrassTextures } from '../src/world/textures.js';
import { Terrain } from '../src/world/terrain.js';
import { Car } from '../src/vehicle/car.js';
import { TUNING } from '../src/character/controller.js';

await RAPIER.init();
const DT = 1 / 120;

for (const targetKmh of [8, 25, 55, 95]) {
  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -TUNING.gravity, z: 0 });
  world.timestep = DT;
  const eventQueue = new RAPIER.EventQueue(true);
  const textures = { grass: makeGrassTextures({ size: 32, anisotropy: 1 }) };
  const terrain = new Terrain({ scene, world, RAPIER, anisotropy: 1, textures });
  const g0 = terrain.heightAt(0, 0);
  const car = new Car({ scene, world, RAPIER, terrain, eventQueue, position: { x: 0, y: g0, z: 0 }, yaw: 0 });
  // parede a 60 m
  const wallZ = 60;
  const wallY = terrain.heightAt(0, wallZ);
  const wb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, wallY + 1.6, wallZ));
  world.createCollider(RAPIER.ColliderDesc.cuboid(9, 1.6, 0.4).setFriction(0.9), wb);

  let touched = false;
  let speedAtImpact = 0;
  car.onImpact = () => { if (!touched) { touched = true; speedAtImpact = car.speed * 3.6; } };
  for (let i = 0; i < 120 * 40; i++) {
    const before = car.speedKmh;
    const throttle = before < targetKmh ? 1 : 0;
    car.update(DT, { throttle, brake: before > targetKmh + 2 ? 1 : 0 });
    world.step(eventQueue);
    car.handleContactEvents(eventQueue);
    const t = car.body.translation();
    if (touched && car.speedKmh < 1) break;
  }
  const speed = car.speed * 3.6;
  const tEnd = car.body.translation();
  if (!touched) console.log('   DEBUG: sem impacto, z final', tEnd.z.toFixed(1), 'km/h', speed.toFixed(0), 'touched', touched);
  console.log(
    `alvo ${String(targetKmh).padStart(3)} km/h -> impacto a ${speedAtImpact.toFixed(0).padStart(3)} km/h |`,
    'health', car.health.toFixed(2), '| morto', car.dead,
    '| porta-malas/amassado', car.model.deformable[0].geometry.attributes.position.array.length > 0
  );
  // amassado máximo
  const arr = car.model.deformable[0].geometry.attributes.position.array;
  const orig = car.model.deformable[0].geometry.userData.orig;
  let maxD = 0;
  if (orig) for (let i = 0; i < arr.length; i += 3) maxD = Math.max(maxD, Math.abs(arr[i] - orig[i]));
  console.log('   fogo', car.fire.parts.filter((p) => p.alive).length, '| fumaça', car.smoke.parts.filter((p) => p.alive).length);
}
