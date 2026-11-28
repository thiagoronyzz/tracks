// Texturas procedurais (geradas em canvas): nenhuma dependência externa,
// tudo tileável para repetir sem costura no terreno e nas construções.

import * as THREE from 'three';
import { clamp, lerp, valueNoise2 } from '../core/math.js';

function periodicNoise(x, y, period, seed = 0) {
  // value noise com wrap: amostra um domínio que se repete a cada "period"
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const wrap = (i) => ((i % period) + period) % period;
  const hash = (i, j) => {
    let h = Math.imul(wrap(i) + seed * 97, 374761393) + Math.imul(wrap(j) - seed * 41, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

function fbmPeriodic(x, y, period, octaves, seed) {
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += periodicNoise(x * freq, y * freq, period * freq, seed + o * 13) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function toTexture(c, { srgb = true, repeat = 1, anisotropy = 4 } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = anisotropy;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Chão: detalhe de grama + normal map derivado de um campo de altura.
 */
export function makeGrassTextures({ size = 512, anisotropy = 4 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  const period = 12;
  const p = size / period;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / p, v = y / p;
      // tufos grandes, tufos pequenos e "fibras" de folhas
      const n1 = fbmPeriodic(u, v, period, 4, 3);
      const n2 = fbmPeriodic(u * 4.1, v * 4.1, period * 4, 3, 11);
      const streak = periodicNoise(u * 26, v * 3.0, period * 26, 23);
      const blade = Math.pow(streak, 3.0);
      const h = n1 * 0.55 + n2 * 0.3 + blade * 0.35;
      heights[y * size + x] = h;
      const i = (y * size + x) * 4;
      const lum = clamp(0.62 + h * 0.62, 0, 1.35);
      const tint = clamp(n2 * 1.3 - 0.15, -1, 1);
      // textura neutra: a cor real vem dos vertex colors do terreno
      img.data[i] = clamp(255 * lum * (1 + tint * 0.09), 0, 255);
      img.data[i + 1] = clamp(255 * lum * (1.02 + tint * 0.02), 0, 255);
      img.data[i + 2] = clamp(255 * lum * (0.94 - tint * 0.12), 0, 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // normal map a partir das alturas (diferenças centrais com wrap)
  const nc = canvas(size);
  const nctx = nc.getContext('2d');
  const nimg = nctx.createImageData(size, size);
  const at = (x, y) => heights[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const strength = 2.1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      nimg.data[i] = clamp(255 * (nx / len * 0.5 + 0.5), 0, 255);
      nimg.data[i + 1] = clamp(255 * (ny / len * 0.5 + 0.5), 0, 255);
      nimg.data[i + 2] = clamp(255 * (nz / len * 0.5 + 0.5), 0, 255);
      nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  return {
    map: toTexture(c, { anisotropy, repeat: 1 }),
    normalMap: toTexture(nc, { srgb: false, anisotropy, repeat: 1 }),
  };
}

/** Telhas cerâmicas (fileiras de meias-canas). */
export function makeRoofTexture(base = '#8c3a2a', { size = 512 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rows = 8, cols = 10;
  const rh = size / rows, cw = size / cols;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = k * cw + (r % 2 ? cw * 0.5 : 0);
      const y = r * rh;
      const g = ctx.createLinearGradient(x, y, x + cw, y);
      g.addColorStop(0, 'rgba(0,0,0,0.32)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.16)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.04)');
      g.addColorStop(1, 'rgba(0,0,0,0.30)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cw * 1.02, rh * 1.02);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + rh);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.moveTo(0, (r + 1) * rh);
    ctx.lineTo(size, (r + 1) * rh);
    ctx.stroke();
  }
  // manchas de desgaste
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size, y = Math.random() * size, rad = 2 + Math.random() * 12;
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${0.02 + Math.random() * 0.05})`;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, { repeat: 1 });
}

/** Madeira com veios (portas, cercas, vigas). */
export function makeWoodTexture(base = '#5a3d28', { size = 256 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size;
    const w = 0.6 + Math.random() * 2.2;
    const shade = Math.random() > 0.5 ? 255 : 0;
    ctx.strokeStyle = `rgba(${shade},${shade * 0.85},${shade * 0.7},${0.02 + Math.random() * 0.07})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= size; y += 16) {
      ctx.lineTo(x + Math.sin(y * 0.05 + i) * 3 + (Math.random() - 0.5) * 1.5, y);
    }
    ctx.stroke();
  }
  return toTexture(c, { repeat: 1 });
}

/** Reboco / parede pintada com pequenas imperfeições. */
export function makePlasterTexture(base = '#e8e2d5', { size = 256 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbmPeriodic(x / (size / 8), y / (size / 8), 8, 4, 5) - 0.5;
      const i = (y * size + x) * 4;
      const f = 1 + n * 0.22;
      img.data[i] = clamp(img.data[i] * f, 0, 255);
      img.data[i + 1] = clamp(img.data[i + 1] * f, 0, 255);
      img.data[i + 2] = clamp(img.data[i + 2] * f, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat: 1 });
}

/** Pedra para fundações e muros. */
export function makeStoneTexture(base = '#8b8377', { size = 256 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rows = 5;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = (r % 2) * -20;
    while (x < size) {
      const w = 28 + Math.random() * 34;
      const y = r * rh + 2;
      const h = rh - 4;
      const shade = 0.75 + Math.random() * 0.4;
      ctx.fillStyle = `rgba(${Math.round(139 * shade)},${Math.round(131 * shade)},${Math.round(119 * shade)},1)`;
      ctx.beginPath();
      ctx.roundRect?.(x + 1, y, w - 2, h, 6);
      if (!ctx.roundRect) ctx.rect(x + 1, y, w - 2, h);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,36,30,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      x += w;
    }
  }
  return toTexture(c, { repeat: 1 });
}

/** Casca de árvore. */
export function makeBarkTexture(base = '#5a4632', { size = 256 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * size;
    const w = 1 + Math.random() * 5;
    const dark = Math.random() > 0.45;
    ctx.strokeStyle = dark ? `rgba(0,0,0,${0.05 + Math.random() * 0.14})` : `rgba(255,235,210,${0.03 + Math.random() * 0.07})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= size; y += 12) ctx.lineTo(x + Math.sin(y * 0.06 + i * 0.7) * 4, y);
    ctx.stroke();
  }
  return toTexture(c, { repeat: 1 });
}

/** Sprite radial para partículas de poeira / fumaça. */
export function makeDustSprite({ size = 64 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(235,228,214,0.35)');
  g.addColorStop(1, 'rgba(220,214,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export { valueNoise2 };
