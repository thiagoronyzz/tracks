import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { collectSkinned, renderView, gridToPNG, updateSkin } from './lib/render.mjs';
import { Retargeter } from '../src/character/retarget.js';

const avatar = await loadGLB('public/models/avatar.glb');
const source = await loadGLB('public/models/motion_source.glb');
const rt = new Retargeter(source.scene, avatar.scene);
console.log('forwardYaw (deg)', (rt.forwardYaw * 180 / Math.PI).toFixed(1));

const baked = {};
for (const c of source.animations) if (['Idle','Walk','Run'].includes(c.name)) baked[c.name] = rt.bake(c, 40);

const mixA = new THREE.AnimationMixer(avatar.scene);
const mixS = new THREE.AnimationMixer(source.scene);
const actA = {}, actS = {};
for (const k of Object.keys(baked)) { actA[k] = mixA.clipAction(baked[k]); actA[k].play(); actA[k].setEffectiveWeight(0); }
for (const k of Object.keys(baked)) { const clip = source.animations.find(a=>a.name===k); actS[k] = mixS.clipAction(clip); actS[k].play(); actS[k].setEffectiveWeight(0); }

const itemsA = collectSkinned(avatar.scene);
const itemsS = collectSkinned(source.scene);

function setFrame(mixer, acts, name, t) {
  for (const k of Object.keys(acts)) acts[k].setEffectiveWeight(k===name?1:0);
  mixer.setTime(0);
  acts[name].time = t;
  mixer.update(0);
}

const cases = [['Idle',0.3],['Walk',0.1],['Walk',0.55],['Run',0.08],['Run',0.3]];
const views = [];
for (const [name, t] of cases) {
  setFrame(mixS, actS, name, t); updateSkin(source.scene);
  views.push(renderView(itemsS, { scene: source.scene, w: 300, h: 470, camPos: [2.6,1.35,2.6], target: [0,0.95,0] }));
  setFrame(mixA, actA, name, t); updateSkin(avatar.scene);
  views.push(renderView(itemsA, { scene: avatar.scene, w: 300, h: 470, camPos: [2.6,1.35,2.6], target: [0,0.95,0] }));
}
gridToPNG(views, '/tmp/compare.png');
// front view of avatar idle, to check facing
setFrame(mixA, actA, 'Idle', 0.3); updateSkin(avatar.scene);
const front = renderView(itemsA, { scene: avatar.scene, w: 420, h: 620, camPos: [0,1.4,3.4], target: [0,0.95,0] });
const side = renderView(itemsA, { scene: avatar.scene, w: 420, h: 620, camPos: [3.4,1.4,0], target: [0,0.95,0] });
gridToPNG([front, side], '/tmp/avatar-facing.png');
console.log('done');
