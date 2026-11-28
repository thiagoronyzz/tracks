import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { collectSkinned, renderView, gridToPNG } from './lib/render.mjs';

const gltf = await loadGLB('public/models/motion_source.glb');
const scene = gltf.scene;
const box = new THREE.Box3().setFromObject(scene);
console.log('bbox', box.min.toArray().map(v=>+v.toFixed(2)), box.max.toArray().map(v=>+v.toFixed(2)));
const bones = new Map();
scene.traverse(o => { if (o.isBone) bones.set(o.name.replace(/^mixamorig:?/i,''), o); });
console.log('animations', gltf.animations.map(a=>[a.name, +a.duration.toFixed(2)]));
const items = collectSkinned(scene);
const views = [0, 90, 180, 270].map((deg) => {
  const a = (deg * Math.PI) / 180, r = 4.2;
  return renderView(items, { scene, w: 360, h: 540, camPos: [Math.sin(a)*r, 1.5, Math.cos(a)*r], target: [0, 1.0, 0] });
});
gridToPNG(views, '/tmp/source-views.png');
// toe direction
scene.updateMatrixWorld(true);
for (const side of ['Left','Right']) {
  const f = bones.get(side+'Foot').getWorldPosition(new THREE.Vector3());
  const t = bones.get(side+'ToeBase').getWorldPosition(new THREE.Vector3());
  const hip = bones.get('Hips').getWorldPosition(new THREE.Vector3());
  const head = bones.get('Head').getWorldPosition(new THREE.Vector3());
  console.log(side, 'foot', f.toArray().map(v=>+v.toFixed(3)), 'toe', t.toArray().map(v=>+v.toFixed(3)), 'dir', t.clone().sub(f).toArray().map(v=>+v.toFixed(3)));
  console.log(side, 'hip', hip.toArray().map(v=>+v.toFixed(3)), 'head', head.toArray().map(v=>+v.toFixed(3)));
}
