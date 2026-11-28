import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { collectSkinned, renderView, gridToPNG } from './lib/render.mjs';
import {
  makeGrassTextures, makeRoofTexture, makeWoodTexture, makePlasterTexture,
  makeStoneTexture, makeBarkTexture,
} from '../src/world/textures.js';
import { Terrain } from '../src/world/terrain.js';
import { Village } from '../src/world/houses.js';
import { Scenery } from '../src/world/props.js';
import { TUNING } from '../src/character/controller.js';

await RAPIER.init();
const scene = new THREE.Scene();
const world = new RAPIER.World({ x: 0, y: -TUNING.gravity, z: 0 });
const textures = {
  grass: makeGrassTextures({ size: 64, anisotropy: 1 }),
  roof: makeRoofTexture('#8f4433', { size: 64 }),
  wood: makeWoodTexture('#6b4a30', { size: 64 }),
  plaster: makePlasterTexture('#efe9dc', { size: 64 }),
  stone: makeStoneTexture('#8f877a', { size: 64 }),
  bark: makeBarkTexture('#5d4834', { size: 64 }),
};
const terrain = new Terrain({ scene, world, RAPIER, anisotropy: 1, textures });
const village = new Village({ scene, world, RAPIER, terrain, textures, count: 13, anisotropy: 1 });
const occupied = village.houses.map((h) => ({ x: h.x, z: h.z, r: h.radius + 2.5 }));
const scenery = new Scenery({ scene, world, RAPIER, terrain, textures, occupied, anisotropy: 1 });
console.log('mundo pronto');

// cores por grupo para leitura
const items = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry; if (!g?.attributes?.position) return;
  let color = [0.45, 0.55, 0.3];
  if (o.material?.name === 'roof' || /roof/i.test(o.name)) color = [0.62, 0.26, 0.2];
  if (o.parent?.name === 'houses') color = [0.8, 0.78, 0.72];
  items.push({
    mesh: o, geo: g, pos: g.attributes.position,
    index: g.index ? g.index.array : null, color, skinned: false,
  });
});
console.log('meshes', items.length, 'tris', items.reduce((a, it) => a + (it.index ? it.index.length : it.pos.count) / 3, 0));

const h0 = terrain.heightAt(0, -2);
console.log('altura no spawn', h0.toFixed(2));
const views = [
  { name: 'jogador', camPos: [0.5, h0 + 1.9, -2 - 4.2], target: [0, h0 + 1.35, -2 + 3], fov: 1.08 },
  { name: 'aereo', camPos: [-40, h0 + 55, -60], target: [20, h0, 40], fov: 1.1 },
  { name: 'casas', camPos: [village.houses[5].x - 14, terrain.heightAt(village.houses[5].x, village.houses[5].z) + 8, village.houses[5].z - 16], target: [village.houses[5].x, terrain.heightAt(village.houses[5].x, village.houses[5].z) + 2, village.houses[5].z], fov: 0.9 },
];
const cvs = [];
for (const v of views) {
  const t0 = Date.now();
  cvs.push(renderView(items, { scene, w: 460, h: 270, camPos: v.camPos, target: v.target, fov: v.fov }));
  console.log(v.name, Date.now() - t0, 'ms');
}
gridToPNG(cvs, '/tmp/world-views.png', views.map((v) => v.name));
console.log('wrote /tmp/world-views.png');
