import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { collectSkinned, renderView, gridToPNG, updateSkin } from './lib/render.mjs';
import { Retargeter, collectBones } from '../src/character/retarget.js';

const avatar = await loadGLB('public/models/avatar.glb');
const source = await loadGLB('public/models/motion_source.glb');
const scene = avatar.scene;
const retargeter = new Retargeter(source.scene, scene);

// bbox of avatar at rest after T-pose fix? (bind pose still A-pose)
const clips = {};
for (const c of source.animations) clips[c.name] = retargeter.bake(c, 40);
console.log('baked clips:', Object.entries(clips).map(([k, v]) => [k, +v.duration.toFixed(2), v.tracks.length]));

const mixer = new THREE.AnimationMixer(scene);
const actions = {};
for (const k of ['Idle', 'Walk', 'Run']) {
  const a = mixer.clipAction(clips[k]);
  a.play(); a.setEffectiveWeight(k === 'Idle' ? 1 : 0);
  actions[k] = a;
}

const items = collectSkinned(scene);
const footwear = items.find((i) => /Footwear/i.test(i.mesh.name));

function measure(clipName, t) {
  for (const k of Object.keys(actions)) actions[k].setEffectiveWeight(k === clipName ? 1 : 0);
  mixer.setTime(0);
  actions[clipName].time = t;
  mixer.update(0);
  updateSkin(scene);
  // lowest footwear vertex (skinned)
  let minY = Infinity;
  const v = new THREE.Vector3();
  for (const it of [footwear]) {
    const pos = it.pos;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      it.mesh.applyBoneTransform(i, v);
      v.applyMatrix4(it.mesh.matrixWorld);
      if (v.y < minY) minY = v.y;
    }
  }
  return minY;
}

for (const clipName of ['Idle', 'Walk', 'Run']) {
  let lo = Infinity, hi = -Infinity;
  const dur = clips[clipName].duration;
  for (let i = 0; i < 20; i++) {
    const y = measure(clipName, (i / 20) * dur * 0.999);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  console.log(clipName, 'lowest footwear Y: min', lo.toFixed(3), 'max', hi.toFixed(3));
}

// render a strip: idle 0, walk contact, run contact
const shots = [
  ['Idle', 0.2], ['Walk', 0.18], ['Walk', 0.5], ['Run', 0.1], ['Run', 0.32],
];
const cams = [
  { deg: 20 }, { deg: 20 }, { deg: 90 }, { deg: 20 }, { deg: 90 },
];
const views = shots.map(([name, t], i) => {
  for (const k of Object.keys(actions)) actions[k].setEffectiveWeight(k === name ? 1 : 0);
  mixer.setTime(0);
  actions[name].time = t;
  mixer.update(0);
  updateSkin(scene);
  const a = (cams[i].deg * Math.PI) / 180, r = 4.0;
  return renderView(items, { scene, w: 330, h: 500, camPos: [Math.sin(a) * r, 1.5, Math.cos(a) * r], target: [0, 0.95, 0] });
});
gridToPNG(views, '/tmp/retarget-strip.png');
console.log('wrote /tmp/retarget-strip.png');
