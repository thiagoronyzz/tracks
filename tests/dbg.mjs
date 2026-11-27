import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { Retargeter, collectBones } from '../src/character/retarget.js';

const avatar = await loadGLB('public/models/avatar.glb');
const source = await loadGLB('public/models/motion_source.glb');
const scene = avatar.scene;
const r = new Retargeter(source.scene, scene);
const hipsSrc = r.sourceBones.get('Hips'), hipsTgt = r.targetBones.get('Hips');
source.scene.updateMatrixWorld(true); scene.updateMatrixWorld(true);
console.log('rest src hips world', hipsSrc.getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3)));
console.log('rest tgt hips world', hipsTgt.getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3)));
console.log('src hips parent', hipsSrc.parent.name, 'scale', hipsSrc.parent.scale.toArray());
console.log('tgt hips parent', hipsTgt.parent.name, 'scale', hipsTgt.parent.scale.toArray());
console.log('tgt armature matrixWorld', hipsTgt.parent.matrixWorld.elements.map(v=>+v.toFixed(3)));
const clip = r.bake(source.animations.find(a=>a.name==='Idle'), 40);
const hipTrack = clip.tracks.find(t=>t.name==='Hips.position');
console.log('hips pos track first', hipTrack ? hipTrack.values.slice(0,8) : 'none');
const mixer = new THREE.AnimationMixer(scene);
const a = mixer.clipAction(clip); a.play(); mixer.setTime(0.2);
scene.updateMatrixWorld(true);
console.log('animated tgt hips world', hipsTgt.getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3)));
console.log('animated tgt hips local', hipsTgt.position.toArray().map(v=>+v.toFixed(3)));
console.log('animated tgt hips quat', hipsTgt.quaternion.toArray().map(v=>+v.toFixed(3)));
// foot
const lf = r.targetBones.get('LeftFoot'), lt = r.targetBones.get('LeftToeBase');
console.log('tgt L foot', lf.getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3)), 'toe', lt.getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3)));
const sf = r.sourceBones.get('LeftFoot');
console.log('src L foot rest', sf.getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3)));

console.log('--- mapping debug');
const T = r.maps.get('Hips');
const RS = r.restSource.get('Hips'), RT = r.restTarget.get('Hips');
console.log('RS', RS.elements.map(v=>+v.toFixed(3)));
console.log('RT', RT.elements.map(v=>+v.toFixed(3)));
console.log('T', T.elements.map(v=>+v.toFixed(3)));
const chk = T.clone().multiply(RS);
console.log('T*RS should equal RT:', chk.elements.map(v=>+v.toFixed(3)));
console.log('globalFix', r.globalFix.toArray().map(v=>+v.toFixed(3)));
