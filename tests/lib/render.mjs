// Tiny software rasterizer (z-buffer + lambert) used only to visually verify rigs/poses offline.
import fs from 'fs';
import { execFileSync } from 'child_process';
import * as THREE from 'three';

class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.color = new Float32Array(w * h * 3);
    this.depth = new Float32Array(w * h).fill(Infinity);
    this.bg = [0.72, 0.80, 0.88];
    for (let i = 0; i < w * h; i++) {
      const y = Math.floor(i / w) / h;
      const g = y * 0.35;
      this.color[i * 3 + 0] = this.bg[0] - g * 0.2;
      this.color[i * 3 + 1] = this.bg[1] - g * 0.22;
      this.color[i * 3 + 2] = this.bg[2] - g * 0.2;
    }
  }
  tri(a, b, c, col) {
    // a,b,c: {x,y,z} screen space with z as depth
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const maxX = Math.min(this.w - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    if (minX > maxX || minY > maxY) return;
    const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (Math.abs(area) < 1e-9) return;
    const inv = 1 / area;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) * inv;
        const w1 = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.0001 || w1 < -0.0001 || w2 < -0.0001) continue;
        const z = a.z * w0 + b.z * w1 + c.z * w2;
        const idx = y * this.w + x;
        if (z < this.depth[idx]) {
          this.depth[idx] = z;
          const i3 = idx * 3;
          this.color[i3] = col[0]; this.color[i3 + 1] = col[1]; this.color[i3 + 2] = col[2];
        }
      }
    }
  }
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function hashTint(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  const hue = (h % 360) / 360;
  const c = new THREE.Color().setHSL(hue, 0.25, 0.55);
  return [c.r, c.g, c.b];
}

export function collectSkinned(scene) {
  const items = [];
  scene.traverse((o) => {
    if (o.isSkinnedMesh || o.isMesh) {
      const g = o.geometry;
      const pos = g.attributes.position;
      if (!pos) return;
      items.push({
        mesh: o,
        geo: g,
        pos,
        index: g.index ? g.index.array : null,
        color: hashTint(o.name || 'x'),
        skinned: !!o.isSkinnedMesh,
      });
    }
  });
  return items;
}

export function updateSkin(scene) {
  scene.updateMatrixWorld(true);
  scene.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.update(); });
}

export function renderView(items, opts = {}) {
  const w = opts.w || 420, h = opts.h || 560;
  const cv = new Canvas(w, h);
  const camPos = new THREE.Vector3(...(opts.camPos || [2.2, 1.35, 3.2]));
  const target = new THREE.Vector3(...(opts.target || [0, 0.95, 0]));
  const dir = new THREE.Vector3().subVectors(target, camPos).normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const fov = opts.fov || 0.72;
  const focal = (h * 0.5) / Math.tan(fov * 0.5);
  const light = new THREE.Vector3(-0.45, 0.8, 0.5).normalize();
  const tmp = new THREE.Vector3();

  updateSkin(opts.scene);

  const verts = [];
  for (const it of items) {
    const { geo, pos, index, skinned, mesh } = it;
    const n = pos.count;
    const arr = new Array(n * 3);
    const m = mesh.matrixWorld;
    const tmpN = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(pos, i);
      if (skinned) mesh.applyBoneTransform(i, _v);
      _v.applyMatrix4(m);
      arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z;
    }
    void tmpN; void arr;
    (it._arr = arr);
    verts.push(it);
  }

  for (const it of verts) {
    const arr = it._arr;
    const cnt = it.index ? it.index.length : it.pos.count;
    for (let t = 0; t < cnt; t += 3) {
      const i0 = (it.index ? it.index[t] : t) * 3;
      const i1 = (it.index ? it.index[t + 1] : t + 1) * 3;
      const i2 = (it.index ? it.index[t + 2] : t + 2) * 3;
      _a.set(arr[i0], arr[i0 + 1], arr[i0 + 2]);
      _b.set(arr[i1], arr[i1 + 1], arr[i1 + 2]);
      _c.set(arr[i2], arr[i2 + 1], arr[i2 + 2]);
      _n.subVectors(_c, _b).cross(_a.clone().sub(_b)).normalize();
      const lam = Math.max(0, _n.dot(light)) * 0.8 + 0.28;
      const shade = Math.min(1.25, lam);
      const col = [it.color[0] * shade, it.color[1] * shade, it.color[2] * shade];
      const pts = [];
      for (const p of [_a, _b, _c]) {
        tmp.copy(p).sub(camPos);
        const z = tmp.dot(dir);
        if (z < 0.05) { pts.push(null); continue; }
        const x = tmp.dot(right) / z;
        const y = tmp.dot(up) / z;
        pts.push({ x: w * 0.5 + x * focal, y: h * 0.5 - y * focal, z });
      }
      if (!pts[0] || !pts[1] || !pts[2]) continue;
      cv.tri(pts[0], pts[1], pts[2], col);
    }
  }
  return cv;
}

export function writePPM(cv, file) {
  const header = Buffer.from(`P6\n${cv.w} ${cv.h}\n255\n`, 'ascii');
  const body = Buffer.alloc(cv.w * cv.h * 3);
  for (let i = 0; i < cv.w * cv.h * 3; i++) {
    body[i] = Math.max(0, Math.min(255, Math.round(Math.pow(cv.color[i], 1 / 2.2) * 255)));
  }
  fs.writeFileSync(file, Buffer.concat([header, body]));
}

export function toPNG(cv, file) {
  const ppm = file.replace(/\.png$/, '.ppm');
  writePPM(cv, ppm);
  execFileSync('convert', [ppm, file]);
  fs.unlinkSync(ppm);
}

// Combine several canvases side by side into one PNG.
export function gridToPNG(canvases, file, labels = []) {
  const w = canvases.reduce((s, c) => s + c.w, 0);
  const h = Math.max(...canvases.map((c) => c.h));
  const merged = new Canvas(w, h);
  merged.color.fill(0.1);
  let off = 0;
  for (const c of canvases) {
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const si = (y * c.w + x) * 3, di = (y * w + off + x) * 3;
        merged.color[di] = c.color[si]; merged.color[di + 1] = c.color[si + 1]; merged.color[di + 2] = c.color[si + 2];
      }
    }
    off += c.w;
  }
  toPNG(merged, file);
  if (labels.length) void labels;
}
