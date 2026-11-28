import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { collectSkinned, renderView, gridToPNG, updateSkin } from './lib/render.mjs';
import { Retargeter } from '../src/character/retarget.js';

const avatar = await loadGLB('public/models/avatar.glb');
const source = await loadGLB('public/models/motion_source.glb');
const rt = new Retargeter(source.scene, avatar.scene);
const baked = {};
for (const c of source.animations) if (['Idle','Walk','Run'].includes(c.name)) baked[c.name] = rt.bake(c, 40);
const mixA = new THREE.AnimationMixer(avatar.scene);
const acts = {};
for (const k of Object.keys(baked)) { acts[k] = mixA.clipAction(baked[k]); acts[k].play(); acts[k].setEffectiveWeight(0); }
const items = collectSkinned(avatar.scene);
function frame(name, t) { for (const k of Object.keys(acts)) acts[k].setEffectiveWeight(k===name?1:0); mixA.setTime(0); acts[name].time=t; mixA.update(0); updateSkin(avatar.scene); }
const views = [];
frame('Idle', 0.2);
views.push(renderView(items, { scene: avatar.scene, w: 340, h: 720, camPos: [0,1.15,2.6], target: [0,1.0,0], fov: 0.6 }));
views.push(renderView(items, { scene: avatar.scene, w: 340, h: 720, camPos: [2.6,1.15,0], target: [0,1.0,0], fov: 0.6 }));
frame('Walk', 0.1);
views.push(renderView(items, { scene: avatar.scene, w: 340, h: 720, camPos: [0,1.15,2.6], target: [0,1.0,0], fov: 0.6 }));
views.push(renderView(items, { scene: avatar.scene, w: 340, h: 720, camPos: [2.6,1.15,0], target: [0,1.0,0], fov: 0.6 }));
frame('Idle', 0.2);
views.push(renderView(items, { scene: avatar.scene, w: 340, h: 720, camPos: [0.001,1.72,0.9], target: [0,1.6,0], fov: 0.7 }));
gridToPNG(views, '/tmp/zoom.png');
console.log('ok');
