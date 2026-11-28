import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { collectSkinned, renderView, gridToPNG } from './lib/render.mjs';

const gltf = await loadGLB('public/models/avatar.glb');
const scene = gltf.scene;
scene.position.set(0, 0, 0);
const items = collectSkinned(scene);

const views = [0, 90, 180, 270].map((deg) => {
  const a = (deg * Math.PI) / 180;
  const r = 3.6;
  return renderView(items, {
    scene,
    w: 380, h: 560,
    camPos: [Math.sin(a) * r, 1.5, Math.cos(a) * r],
    target: [0, 0.95, 0],
  });
});
gridToPNG(views, '/tmp/avatar-views.png');
console.log('wrote /tmp/avatar-views.png');
