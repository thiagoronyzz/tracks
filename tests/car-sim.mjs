import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeGrassTextures } from '../src/world/textures.js';
import { Terrain } from '../src/world/terrain.js';
import { Village } from '../src/world/houses.js';
import { Car } from '../src/vehicle/car.js';
import { TUNING } from '../src/character/controller.js';

await RAPIER.init();
const scene = new THREE.Scene();
const world = new RAPIER.World({ x: 0, y: -TUNING.gravity, z: 0 });
world.timestep = 1 / 120;
const eventQueue = new RAPIER.EventQueue(true);
const textures = { grass: makeGrassTextures({ size: 64, anisotropy: 1 }) };
const terrain = new Terrain({ scene, world, RAPIER, anisotropy: 1, textures });
const g0 = terrain.heightAt(0, 0);
const car = new Car({ scene, world, RAPIER, terrain, eventQueue, position: { x: 0, y: g0, z: 0 }, yaw: 0, color: '#b6412f' });
console.log('mass', car.body.mass().toFixed(0), 'kg | com', car.body.centerOfMass ? JSON.stringify(car.body.centerOfMass()) : '-');

const DT = 1 / 120;
function step(n, input, label, report = true) {
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    car.update(DT, input);
    world.step(eventQueue);
    car.handleContactEvents(eventQueue);
    sumY += car.body.translation().y;
  }
  car.syncVisual();
  if (report) {
    const t = car.body.translation();
    const r = car.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const wheelInfo = car.wheels.map((w) => (car.vehicle.wheelIsInContact(w.index) ? 'C' : '-')).join('');
    console.log(
      label.padEnd(16),
      'pos', t.x.toFixed(2), t.y.toFixed(2), t.z.toFixed(2),
      '| fwd', fwd.x.toFixed(2), fwd.z.toFixed(2),
      '| km/h', car.speedKmh.toFixed(1),
      '| fwdSpeed', car.forwardSpeed.toFixed(2),
      '| rodas', wheelInfo,
      '| susp', car.wheels.map((w) => (car.vehicle.wheelSuspensionLength(w.index) || 0).toFixed(2)).join(','),
      '| health', car.health.toFixed(2)
    );
  }
}

step(180, {}, 'assentar (1.5s)');
console.log('altura do chassi acima do chão', (car.body.translation().y - terrain.heightAt(car.body.translation().x, car.body.translation().z)).toFixed(3));
step(240, { throttle: 1 }, 'acelerar 2s');
step(240, { throttle: 1 }, 'acelerar 4s');
step(240, { throttle: 1 }, 'acelerar 6s');
step(120, { throttle: 1, steer: 0.6 }, 'curva esq 1s');
step(120, { throttle: 1, steer: -0.6 }, 'curva dir 1s');
step(180, { brake: 1 }, 'frear 1.5s');
step(60, { throttle: -1 }, 'ré 0.5s');
// ---- batida frontal contra parede de teste -------------------------------
car.respawn();
let maxForce = 0, impacts = 0, deathAt = null;
car.onImpact = (e) => { impacts++; maxForce = Math.max(maxForce, e.force); };
const origDent = car._dent.bind(car);
let dentCalls = 0, dentTouched = 0;
car._dent = (p, d, f) => {
  dentCalls++;
  let t = 0;
  for (const m of car.model.deformable) {
    const arr = m.geometry.attributes.position.array.slice();
    origDent(p, d, f);
    const now = m.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i++) if (arr[i] !== now[i]) t++;
    break;
  }
  dentTouched += t;
  if (dentCalls < 5) console.log('   dent: força', f.toFixed(0), 'painéis', car.model.deformable.length, 'vértices movidos', t, 'ponto', p.toArray().map(v=>+v.toFixed(2)));
};
car.onDeath = () => { deathAt = car.body.translation().z; };
const beforeDent = car.model.deformable[0].geometry.attributes.position.array.slice();
let wall = null;
for (let i = 0; i < 120 * 26; i++) {
  const t = car.body.translation();
  if (!wall && car.speedKmh > 80) {
    // parede à frente do carro, apoiada no terreno
    const r = car.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const wx = t.x + fwd.x * 26;
    const wz = t.z + fwd.z * 26;
    const wy = terrain.heightAt(wx, wz);
    const wb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(wx, wy + 1.6, wz));
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fwd.x, fwd.z));
    wb.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, true);
    world.createCollider(RAPIER.ColliderDesc.cuboid(7, 1.6, 0.45).setFriction(0.9), wb);
    wall = { x: wx, z: wz };
    console.log('parede criada em', wx.toFixed(1), wz.toFixed(1), 'carro a', car.speedKmh.toFixed(0), 'km/h');
  }
  car.update(DT, { throttle: 1 });
  world.step(eventQueue);
  car.handleContactEvents(eventQueue);
  car.syncVisual();
  if (wall && i % 30 === 0) console.log('  t=' + (i / 120).toFixed(1), 'z=' + t.z.toFixed(1), 'km/h', car.speedKmh.toFixed(0), 'health', car.health.toFixed(2), 'dead', car.dead);
  if (car.dead && !deathAt) { deathAt = t.z; console.log('  -> motor fundiu em t=' + (i / 120).toFixed(1) + 's, km/h ' + car.speedKmh.toFixed(0)); }
  if (deathAt && i > 0 && car.speedKmh < 1) break;
}
let moved = 0;
const after = car.model.deformable[0].geometry.attributes.position.array;
for (let i = 0; i < beforeDent.length; i += 3) {
  moved = Math.max(moved, Math.abs(after[i] - beforeDent[i]) + Math.abs(after[i+1] - beforeDent[i+1]) + Math.abs(after[i+2] - beforeDent[i+2]));
}
const pos = car.body.translation();
console.log('batida: Z final', pos.z.toFixed(1), '| impactos', impacts, '| maior força', maxForce.toFixed(0), 'N | health', car.health.toFixed(3), '| morto', car.dead, '| amassado máximo', moved.toFixed(3), 'm');
console.log('partículas de fogo ativas', car.fire.parts.filter((p) => p.alive).length, '| fumaça', car.smoke.parts.filter((p) => p.alive).length);
const house = null;
