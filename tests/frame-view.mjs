import { installCanvasStub } from './lib/canvas-stub.mjs';
installCanvasStub();
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGLB } from './lib/glbdom.mjs';
import { renderView, toPNG } from './lib/render.mjs';
import {
  makeGrassTextures, makeRoofTexture, makeWoodTexture, makePlasterTexture,
  makeStoneTexture, makeBarkTexture,
} from '../src/world/textures.js';
import { Terrain } from '../src/world/terrain.js';
import { Village } from '../src/world/houses.js';
import { Character } from '../src/character/character.js';
import { PlayerController, TUNING } from '../src/character/controller.js';
import { ThirdPersonCamera } from '../src/camera/thirdPerson.js';

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
const character = new Character({
  avatar: await loadGLB('public/models/avatar.glb'),
  motion: await loadGLB('public/models/motion_source.glb'),
  scene,
});
// spawn perto de uma casa, olhando para ela
const house = village.houses.reduce((a, b) => (Math.hypot(b.x, b.z) < Math.hypot(a.x, a.z) ? b : a));
console.log('casa mais próxima', house.x.toFixed(1), house.z.toFixed(1), 'r', house.radius.toFixed(1));
const dist = 12;
const px = house.x + dist, pz = house.z + dist * 0.4;
const gy = terrain.heightAt(px, pz);
const feet = new THREE.Vector3(px, gy, pz);
const yaw = Math.atan2(house.x - px, house.z - pz);
character.update(0.5, { position: feet, yaw, speed: 0, grounded: true, vy: 0, crouchAmount: 0, landingImpact: 0, terrain, groundNormal: new THREE.Vector3(0,1,0), cameraYaw: yaw + Math.PI, cameraPitch: 0.12 });
character.root.updateMatrixWorld(true);
character.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });

// câmera real do jogo
const camera = new THREE.PerspectiveCamera(62, 460 / 270, 0.08, 6000);
const cam = new ThirdPersonCamera({ camera, world, RAPIER, terrain, playerCollider: null });
cam.yaw = yaw + Math.PI;
cam.pitch = 0.12;
cam.desiredDistance = 4.0;
cam.update(0.5, { feetPos: feet, yaw, speed: 0, grounded: true, landingImpact: 0, phase: 0 });
console.log('câmera', camera.position.toArray().map((v) => +v.toFixed(2)), 'dist', camera.position.distanceTo(feet).toFixed(2),
  'altura acima do chão', (camera.position.y - terrain.heightAt(camera.position.x, camera.position.z)).toFixed(2));

const items = [];
const push = (o, color) => {
  const g = o.geometry;
  if (!g?.attributes?.position) return;
  let index = g.index ? Array.from(g.index.array) : null;
  const stride = o.name === '' && g.attributes.position.count > 100000 ? 3 : 1;
  if (stride > 1 && index) {
    const out = [];
    for (let i = 0; i + 2 < index.length; i += 3 * stride) out.push(index[i], index[i + 1], index[i + 2]);
    index = out;
  }
  items.push({ mesh: o, geo: g, pos: g.attributes.position, index, color, skinned: !!o.isSkinnedMesh });
};
scene.traverse((o) => {
  if (!o.isMesh) return;
  if (o.material?.name === 'roof') return push(o, [0.66, 0.24, 0.18]);
  if (o.material?.name === 'stone') return push(o, [0.55, 0.53, 0.5]);
  if (o.material?.name === 'wood') return push(o, [0.42, 0.3, 0.2]);
  if (o.material?.name?.startsWith('wall')) return push(o, [0.85, 0.82, 0.75]);
  if (o.material?.name === 'bark') return push(o, [0.32, 0.25, 0.18]);
  if (o.parent === scene) return push(o, [0.44, 0.55, 0.28]);
  push(o, [0.75, 0.72, 0.78]);
});
console.log('meshes', items.length);

const near = { camPos: [px + Math.sin(yaw + Math.PI) * 3.2, gy + 1.5, pz + Math.cos(yaw + Math.PI) * 3.2], target: [px, gy + 1.1, pz] };
const cvs = [];
// olhar do jogo: da câmera para o personagem
const look = new THREE.Vector3(px - camera.position.x, (gy + 1.35) - camera.position.y, pz - camera.position.z).normalize();
const tgt = camera.position.clone().addScaledVector(look, 6);
const cv = renderView(items, { scene, w: 700, h: 394, camPos: camera.position.toArray(), target: tgt.toArray(), fov: 1.08 });
toPNG(cv, '/tmp/frame-game.png');
const cv2 = renderView(items, { scene, w: 700, h: 394, camPos: near.camPos, target: near.target, fov: 0.8 });
toPNG(cv2, '/tmp/frame-close.png');
console.log('ok');

// ---- depuração: onde está o personagem? ----
const box = new THREE.Box3();
let counted = 0;
character.root.traverse((o) => {
  if (!o.isMesh) return;
  const pos = o.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 17) {
    v.fromBufferAttribute(pos, i);
    if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
    v.applyMatrix4(o.matrixWorld);
    box.expandByPoint(v); counted++;
  }
});
console.log('verts amostrados', counted, 'bbox do personagem', box.min.toArray().map(v=>+v.toFixed(2)), box.max.toArray().map(v=>+v.toFixed(2)));
console.log('raiz', character.root.position.toArray(), 'holder', character.holder.position.toArray(), 'offset', character.modelOffsetY);
console.log('câmera', camera.position.toArray().map(v=>+v.toFixed(2)));
console.log('chão no personagem', terrain.heightAt(px, pz).toFixed(2), 'campos do cam: dist', cam.distance?.toFixed?.(2));
