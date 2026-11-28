// Fumaça e fogo em partículas (para o carro batido/pegando fogo).
// Um único draw call por sistema; a vida/tamanho são atualizados na CPU.

import * as THREE from 'three';

const VERT = `
attribute float aLife;
attribute float aSize;
attribute vec3 aColor;
varying float vLife;
varying vec3 vColor;
void main() {
  vLife = aLife;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (330.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying float vLife;
varying vec3 vColor;
uniform float uOpacity;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.02, r) * vLife * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}`;

export class ParticleCloud {
  constructor(scene, { max = 80, blending = THREE.AdditiveBlending, opacity = 1 } = {}) {
    this.max = max;
    this.parts = [];
    for (let i = 0; i < max; i++) {
      this.parts.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grow: 1, r: 1, g: 1, b: 1 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(max), 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(max), 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: opacity } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.cursor = 0;
  }

  spawn(p) {
    for (let n = 0; n < this.max; n++) {
      const i = (this.cursor + n) % this.max;
      const q = this.parts[i];
      if (q.alive && q.life > 0.35) continue;
      Object.assign(q, p, { alive: true, life: 1 });
      this.cursor = (i + 1) % this.max;
      return;
    }
  }

  clear() {
    for (const p of this.parts) { p.alive = false; p.life = 0; }
    this.flush();
  }

  update(dt) {
    const pos = this.geometry.attributes.position.array;
    const life = this.geometry.attributes.aLife.array;
    const size = this.geometry.attributes.aSize.array;
    const col = this.geometry.attributes.aColor.array;
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i];
      if (!p.alive) {
        life[i] = 0;
        size[i] = 0;
        pos[i * 3] = 0;
        pos[i * 3 + 1] = -999;
        pos[i * 3 + 2] = 0;
        continue;
      }
      p.life -= dt / p.max;
      if (p.life <= 0) {
        p.alive = false;
        life[i] = 0;
        size[i] = 0;
        pos[i * 3 + 1] = -999;
        continue;
      }
      const drag = 1 - Math.min(0.9, dt * 0.7);
      p.vx *= drag;
      p.vz *= drag;
      p.vy += dt * (p.buoyancy || 1.4);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      life[i] = Math.min(1, p.life * (p.fadePower || 1.6));
      size[i] = p.size * (1 + (1 - p.life) * (p.grow || 1));
      col[i * 3] = p.r;
      col[i * 3 + 1] = p.g;
      col[i * 3 + 2] = p.b;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
  }

  flush() {
    this.update(0);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.points.parent?.remove(this.points);
  }
}
