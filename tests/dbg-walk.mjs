import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { Character } from '../src/character/character.js';
const avatar = await loadGLB('public/models/avatar.glb');
const motion = await loadGLB('public/models/motion_source.glb');
const scene = new THREE.Scene();
const ch = new Character({ avatar, motion, scene });
const base = { position: new THREE.Vector3(), yaw: 0, speed: 1.78, grounded: true, vy: 0, crouchAmount: 0, landingImpact: 0 };
const lf = ch.b.lFoot, rf = ch.b.rFoot, lt = ch.b.lToe, rt = ch.b.rToe;
const rows = [];
for (let i = 0; i < 80; i++) {
  ch.update(1/60, base);
  ch.root.updateMatrixWorld(true);
  rows.push({ ph: +ch.phase.toFixed(3), l: +lf.getWorldPosition(new THREE.Vector3()).y.toFixed(3), r: +rf.getWorldPosition(new THREE.Vector3()).y.toFixed(3), lw: +ch.clipWeights[1].toFixed(2) });
}
console.log(rows.filter((_,i)=>i%4===0));
// min foot Y over a full cycle using internal pose (feet geometry)
