import * as THREE from 'three';
import { loadGLB } from './lib/glbdom.mjs';
import { Retargeter } from '../src/character/retarget.js';

const pr = (label, m) => {
  m = m.isMatrix4 ? m.elements : m;
  const rows = [];
  for (let r = 0; r < 4; r++) rows.push([0,1,2,3].map(c => (+m[c*4+r].toFixed(4)).toString().padStart(9)).join(' '));
  console.log(label + '\n' + rows.join('\n'));
};
const avatar = await loadGLB('public/models/avatar.glb');
const source = await loadGLB('public/models/motion_source.glb');
const r = new Retargeter(source.scene, avatar.scene);
const sb = r.sourceBones.get('Hips');
source.scene.updateMatrixWorld(true);
pr('RS (source hips rest)', r.restSource.get('Hips'));
pr('RT (target hips rest)', r.restTarget.get('Hips'));
pr('T', r.maps.get('Hips'));
const RS = r.restSource.get('Hips'), RT = r.restTarget.get('Hips');
pr('T*RS', r.maps.get('Hips').clone().multiply(RS));
const s = new THREE.Vector3(); const q = new THREE.Quaternion(); const p = new THREE.Vector3();
RT.decompose(p,q,s); console.log('RT scale', s.toArray());
pr('sanity: inv(RS)', RS.clone().invert());
// check source hips parent world
pr('source root world', source.scene.matrixWorld);
pr('src hips parent world', sb.parent.matrixWorld);
