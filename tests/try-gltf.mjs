import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// minimal DOM shims so GLTFLoader can decode embedded textures in node
const makeImg = () => {
  const img = new EventTarget();
  img.width = 4; img.height = 4;
  img.setAttribute = () => {};
  img.style = {};
  Object.defineProperty(img, 'src', { set(v) { setTimeout(() => img.dispatchEvent(new Event('load')), 0); }, get() { return ''; } });
  return img;
};
global.document = { createElementNS: () => makeImg(), createElement: () => makeImg(), createElementNSWithOptions: () => makeImg() };
global.self = global;
if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:stub';

const buf = fs.readFileSync('public/models/avatar.glb');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const loader = new GLTFLoader();
loader.parse(ab, '', (gltf) => {
  console.log('loaded. children:', gltf.scene.children.map(c => c.name));
  let meshes = 0, tris = 0;
  const box = new THREE.Box3();
  gltf.scene.traverse(o => {
    if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; box.expandByObject(o); }
  });
  console.log('meshes', meshes, 'tris', Math.round(tris));
  console.log('bbox', box.min.toArray().map(v=>+v.toFixed(2)), box.max.toArray().map(v=>+v.toFixed(2)));
  const bones = [];
  gltf.scene.traverse(o => { if (o.isBone) bones.push(o.name); });
  console.log('bones', bones.length, bones.join(','));
  console.log('animations', gltf.animations.length);
  const skinned = [];
  gltf.scene.traverse(o => { if (o.isSkinnedMesh) skinned.push([o.name, o.skeleton.bones.length]); });
  console.log('skinned', skinned);
}, (e) => console.log('ERR', e));
