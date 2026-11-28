import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { updateSkin } from './lib/render.mjs';
import { Retargeter } from '../src/character/retarget.js';

const avatar = await loadGLB('public/models/avatar.glb');
const source = await loadGLB('public/models/motion_source.glb');
const rt = new Retargeter(source.scene, avatar.scene);
const bones = rt.targetBones;
const mix = new THREE.AnimationMixer(avatar.scene);
const baked = {};
for (const c of source.animations) baked[c.name] = rt.bake(c, 40);
const state = {};
for (const k of Object.keys(baked)) { state[k] = mix.clipAction(baked[k]); state[k].play(); state[k].setEffectiveWeight(0); }

function pose(name, t) {
  for (const k of Object.keys(state)) state[k].setEffectiveWeight(k === name ? 1 : 0);
  mix.setTime(0); state[name].time = t; mix.update(0);
  avatar.scene.updateMatrixWorld(true);
}

// rig measurements at idle t=0
pose('Idle', 0);
const hips = bones.get('Hips'), lu = bones.get('LeftUpLeg'), ll = bones.get('LeftLeg'), lf = bones.get('LeftFoot'), lt = bones.get('LeftToeBase');
const lp = o => o.getWorldPosition(new THREE.Vector3());
const hip = lp(hips), up = lp(lu), knee = lp(ll), ankle = lp(lf), toe = lp(lt);
console.log('hips', hip.toArray().map(v=>+v.toFixed(3)));
console.log('upLeg', up.toArray().map(v=>+v.toFixed(3)), 'thigh', up.distanceTo(knee).toFixed(3));
console.log('knee', knee.toArray().map(v=>+v.toFixed(3)), 'shin', knee.distanceTo(ankle).toFixed(3));
console.log('ankle', ankle.toArray().map(v=>+v.toFixed(3)), 'foot->toe', ankle.distanceTo(toe).toFixed(3), 'toe', toe.toArray().map(v=>+v.toFixed(3)));
console.log('spine top (Neck)', lp(bones.get('Neck')).toArray().map(v=>+v.toFixed(3)), 'head', lp(bones.get('Head')).toArray().map(v=>+v.toFixed(3)));
// shoulder widths / arm lengths
console.log('L arm', lp(bones.get('LeftArm')).toArray().map(v=>+v.toFixed(3)), 'fore', lp(bones.get('LeftForeArm')).toArray().map(v=>+v.toFixed(3)), 'hand', lp(bones.get('LeftHand')).toArray().map(v=>+v.toFixed(3)));
console.log('upperArm len', lp(bones.get('LeftArm')).distanceTo(lp(bones.get('LeftForeArm'))).toFixed(3), 'foreArm', lp(bones.get('LeftForeArm')).distanceTo(lp(bones.get('LeftHand'))).toFixed(3));

for (const clip of ['Walk', 'Run', 'Idle']) {
  const dur = baked[clip].duration;
  let minZ = Infinity, maxZ = -Infinity, minYL = Infinity, maxYL = -Infinity;
  const N = 60;
  for (let i = 0; i < N; i++) {
    pose(clip, (i / N) * dur);
    const h = lp(hips);
    for (const side of ['Left', 'Right']) {
      const f = lp(bones.get(side + 'Foot'));
      const rel = f.clone().sub(h);
      minZ = Math.min(minZ, rel.z); maxZ = Math.max(maxZ, rel.z);
      minYL = Math.min(minYL, f.y); maxYL = Math.max(maxYL, f.y);
    }
  }
  const stepLen = maxZ - minZ;
  console.log(clip, 'dur', dur.toFixed(3), 'foot Z range', stepLen.toFixed(3), 'natural speed', (2 * stepLen / dur).toFixed(2), 'footY', minYL.toFixed(3), maxYL.toFixed(3));
}
