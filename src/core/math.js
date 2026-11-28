// Utilitários matemáticos, ruído procedural e aleatoriedade determinística.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Damping exponencial independente de framerate. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function dampAngle(a, b, lambda, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function moveTowards(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

/** Aproxima componentes de velocidade com aceleração limitada. */
export function accelerate(vx, vz, tx, tz, accel, dt) {
  const dx = tx - vx;
  const dz = tz - vz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return [tx, tz];
  const maxStep = accel * dt;
  if (dist <= maxStep) return [tx, tz];
  return [vx + (dx / dist) * maxStep, vz + (dz / dist) * maxStep];
}

/** PRNG determinístico (mulberry32). */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (min, max) => min + rng() * (max - min);
  rng.int = (min, max) => Math.floor(rng.range(min, max + 1));
  rng.pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
  rng.chance = (p) => rng() < p;
  return rng;
}

// ---------------------------------------------------------------------------
// Ruído de valor 2D (suave, barato, sem dependências)
// ---------------------------------------------------------------------------
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

/** Ruído fractal (fbm) em [-1, 1]. */
export function fbm2(x, z, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise2(x * freq, z * freq) * 2 - 1) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ruído "ridged" para as montanhas distantes. */
export function ridged2(x, z, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2(x * freq, z * freq) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

/** AABB simples para posicionamento de objetos. */
export function boxesOverlap(a, b, pad = 0) {
  return !(a.maxX + pad < b.minX || a.minX - pad > b.maxX || a.maxZ + pad < b.minZ || a.minZ - pad > b.maxZ);
}
