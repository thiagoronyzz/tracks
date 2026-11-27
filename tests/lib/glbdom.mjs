// Minimal DOM shims so THREE's GLTFLoader can decode embedded textures under Node.
import fs from 'fs';
import * as THREE from 'three';

const makeImg = () => {
  const img = new EventTarget();
  img.width = 4; img.height = 4;
  img.setAttribute = () => {};
  img.style = {};
  Object.defineProperty(img, 'src', {
    set() { setTimeout(() => img.dispatchEvent(new Event('load')), 0); },
    get() { return ''; }
  });
  return img;
};
if (typeof global.document === 'undefined') {
  global.document = { createElementNS: () => makeImg(), createElement: () => makeImg() };
}
if (!global.self) global.self = global;
if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:stub';

export async function loadGLB(path) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const buf = fs.readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return await new Promise((resolve, reject) => {
    new GLTFLoader().parse(ab, '', resolve, reject);
  });
}
