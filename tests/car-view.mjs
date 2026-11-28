import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import { renderView, toPNG } from './lib/render.mjs';
import { buildCarModel } from '../src/vehicle/carModel.js';

const scene = new THREE.Scene();
const car = buildCarModel({ color: '#b6412f' });
scene.add(car.group);
// abre as portas para conferir o pivô
if (process.argv[2] === 'open') {
  car.doors.left.rotation.y = -1.15;
  car.doors.right.rotation.y = 1.15;
}
car.group.updateMatrixWorld(true);

const items = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry;
  const c = o.material.color || new THREE.Color(1, 0, 1);
  const tint = c.clone().convertLinearToSRGB();
  items.push({
    mesh: o, geo: g, pos: g.attributes.position,
    index: g.index ? g.index.array : null,
    color: [tint.r, tint.g, tint.b],
    skinned: false,
  });
});
console.log('meshes', items.length, 'tris', items.reduce((a, i) => a + (i.index ? i.index.length : i.pos.count) / 3, 0));
const box = new THREE.Box3().setFromObject(car.group);
console.log('bbox', box.min.toArray().map(v => +v.toFixed(2)), box.max.toArray().map(v => +v.toFixed(2)));
const views = [
  { name: '3/4 frente', camPos: [4.6, 2.6, 5.6], target: [0, 0.7, 0], fov: 0.7 },
  { name: 'lateral (porta aberta)', camPos: [7.2, 1.7, 0.2], target: [0, 0.7, 0], fov: 0.7 },
  { name: 'traseira', camPos: [-3.2, 3.0, -6.2], target: [0, 0.7, 0], fov: 0.7 },
  { name: 'frente', camPos: [0.4, 1.5, 7.4], target: [0, 0.7, 0], fov: 0.62 },
];
let i = 0;
for (const v of views) {
  const cv = renderView(items, { scene, w: 520, h: 320, camPos: v.camPos, target: v.target, fov: v.fov });
  toPNG(cv, `/tmp/car-${i++}.png`);
  console.log('ok', v.name);
}
