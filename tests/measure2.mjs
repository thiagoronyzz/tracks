import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { Retargeter } from '../src/character/retarget.js';
const avatar = await loadGLB('public/models/avatar.glb');
const source = await loadGLB('public/models/motion_source.glb');
const rt = new Retargeter(source.scene, avatar.scene);
const bones = rt.targetBones;
const mix = new THREE.AnimationMixer(avatar.scene);
const baked = {};
for (const c of source.animations) baked[c.name] = rt.bake(c, 60);
const st = {};
for (const k of Object.keys(baked)) { st[k] = mix.clipAction(baked[k]); st[k].play(); st[k].setEffectiveWeight(0); }
const lp = o => o.getWorldPosition(new THREE.Vector3());
function pose(name, t) {
  for (const k of Object.keys(st)) st[k].setEffectiveWeight(k === name ? 1 : 0);
  mix.setTime(0); st[name].time = t; mix.update(0);
  avatar.scene.updateMatrixWorld(true);
}
for (const clip of ['Walk', 'Run']) {
  const dur = baked[clip].duration;
  const dt = dur / 240;
  const samples = [];
  for (let i = 0; i <= 240; i++) {
    pose(clip, i * dt);
    const h = lp(bones.get('Hips'));
    const l = lp(bones.get('LeftFoot')).sub(h);
    const r = lp(bones.get('RightFoot')).sub(h);
    samples.push({ t: i * dt, lz: l.z, ly: l.y, rz: r.z, ry: r.y });
  }
  // stance = lowest 40% of foot heights; compute mean -dZ/dt during stance
  const allY = samples.flatMap(s => [s.ly, s.ry]);
  const yMin = Math.min(...allY), yMax = Math.max(...allY);
  const thr = yMin + (yMax - yMin) * 0.35;
  const speeds = [];
  for (let i = 1; i < samples.length; i++) {
    for (const side of ['l', 'r']) {
      if (samples[i][side + 'y'] < thr && samples[i - 1][side + 'y'] < thr) {
        speeds.push(-(samples[i][side + 'z'] - samples[i - 1][side + 'z']) / dt);
      }
    }
  }
  speeds.sort((a, b) => a - b);
  const median = speeds[Math.floor(speeds.length / 2)];
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  console.log(clip, 'dur', dur.toFixed(2), 'stance speed median', median.toFixed(2), 'mean', mean.toFixed(2), 'samples', speeds.length, 'thr', thr.toFixed(3), 'range', yMin.toFixed(3), yMax.toFixed(3));
}
