import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { collectSkinned, renderView, gridToPNG, updateSkin } from './lib/render.mjs';
import { Retargeter } from '../src/character/retarget.js';

const avatar = await loadGLB('public/models/avatar.glb');
const source = await loadGLB('public/models/motion_source.glb');
const rt = new Retargeter(source.scene, avatar.scene);
const baked = {};
for (const c of source.animations) if (['Idle','Walk','Run'].includes(c.name)) baked[c.name] = rt.bake(c, 40);
console.log('clips', Object.keys(baked));
const mixA = new THREE.AnimationMixer(avatar.scene);
const acts = {};
for (const k of Object.keys(baked)) { acts[k] = mixA.clipAction(baked[k]); acts[k].play(); acts[k].setEffectiveWeight(0); }
const items = collectSkinned(avatar.scene);
function frame(name, t) { for (const k of Object.keys(acts)) acts[k].setEffectiveWeight(k===name?1:0); mixA.setTime(0); acts[name].time=t; mixA.update(0); updateSkin(avatar.scene); }

frame('Idle', 0.2);
let box = new THREE.Box3();
const v = new THREE.Vector3();
for (const it of items) for (let i=0;i<it.pos.count;i+=3) { v.fromBufferAttribute(it.pos,i); it.mesh.applyBoneTransform(i,v); box.expandByPoint(v); }
console.log('idle skinned bbox', box.min.toArray().map(x=>+x.toFixed(3)), box.max.toArray().map(x=>+x.toFixed(3)));

const views = [];
views.push(renderView(items, { scene: avatar.scene, w: 380, h: 620, camPos: [0,0.9,3.2], target: [0,0.85,0], fov: 0.85 }));
views.push(renderView(items, { scene: avatar.scene, w: 380, h: 620, camPos: [3.2,0.9,0.4], target: [0,0.85,0], fov: 0.85 }));
views.push(renderView(items, { scene: avatar.scene, w: 380, h: 420, camPos: [0,1.0,1.5], target: [0,0.9,0], fov: 0.7 }));
frame('Walk', 0.1);
views.push(renderView(items, { scene: avatar.scene, w: 380, h: 620, camPos: [0,0.9,3.2], target: [0,0.85,0], fov: 0.85 }));
views.push(renderView(items, { scene: avatar.scene, w: 380, h: 620, camPos: [3.2,0.9,0.4], target: [0,0.85,0], fov: 0.85 }));
gridToPNG(views, '/tmp/zoom2.png');
console.log('ok');
