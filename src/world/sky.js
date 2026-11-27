// Céu, sol, nuvens, montanhas distantes e iluminação.

import * as THREE from 'three';
import { clamp, fbm2, makeRng, ridged2, smoothstep } from '../core/math.js';

const SKY_RADIUS = 3800;

function makeCloudTexture(size = 256, seed = 1) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size - 0.5;
      const v = y / size - 0.5;
      const r = Math.hypot(u, v * 1.7);
      let n = 0, amp = 0.5, freq = 3.2, norm = 0;
      for (let o = 0; o < 4; o++) {
        n += (fbm2(u * freq + seed * 3.1, v * freq + seed * 1.7, 1) * 0.5 + 0.5) * amp;
        norm += amp;
        amp *= 0.5; freq *= 2.1;
      }
      n /= norm;
      const falloff = smoothstep(0.5, 0.12, r);
      const a = clamp((n - 0.42) * 3.2, 0, 1) * falloff;
      const i = (y * size + x) * 4;
      const shade = 210 + Math.round(n * 45);
      img.data[i] = shade;
      img.data[i + 1] = shade;
      img.data[i + 2] = Math.min(255, shade + 8);
      img.data[i + 3] = Math.round(a * 235);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSunTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,250,1)');
  g.addColorStop(0.08, 'rgba(255,250,235,0.95)');
  g.addColorStop(0.22, 'rgba(255,236,200,0.35)');
  g.addColorStop(0.5, 'rgba(255,220,175,0.10)');
  g.addColorStop(1, 'rgba(255,210,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildSkyDome() {
  const geo = new THREE.SphereGeometry(SKY_RADIUS, 48, 32);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const zenith = new THREE.Color('#3f74b8');
  const mid = new THREE.Color('#8fb4d8');
  const horizon = new THREE.Color('#dfe3e2');
  const warm = new THREE.Color('#ffe0b8');
  const ground = new THREE.Color('#b9b8a6');
  const tmp = new THREE.Color();
  const v = new THREE.Vector3();
  const sunDir = new THREE.Vector3(-0.55, 0.38, 0.74).normalize();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const h = v.y;
    if (h >= 0) {
      const t = Math.pow(clamp(h, 0, 1), 0.62);
      tmp.copy(horizon).lerp(mid, clamp(t * 2.0, 0, 1)).lerp(zenith, clamp(t * 1.45 - 0.35, 0, 1));
      // brilho quente perto do sol
      const sunDot = clamp(v.dot(sunDir), 0, 1);
      tmp.lerp(warm, Math.pow(sunDot, 5.0) * 0.55 * (1 - t * 0.6));
    } else {
      tmp.copy(horizon).lerp(ground, clamp(-h * 3.2, 0, 1));
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

function buildMountainRing({ radius, height, segments, seed, colorTop, colorBottom, heightFn }) {
  const positions = [];
  const colors = [];
  const indices = [];
  const top = new THREE.Color(colorTop);
  const bottom = new THREE.Color(colorBottom);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const n = heightFn(a, seed);
    const h = height * (0.35 + n * 1.25);
    positions.push(x, -60, z);
    positions.push(x, h, z);
    colors.push(bottom.r, bottom.g, bottom.b);
    colors.push(top.r, top.g, top.b);
    if (i < segments) {
      const b = i * 2;
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export class Sky {
  constructor({ scene, sunAzimuth = 52, sunElevation = 25, shadowMapSize = 2048, shadows = true }) {
    this.scene = scene;
    this.shadows = shadows;
    this.sunDir = new THREE.Vector3(
      Math.cos((sunElevation * Math.PI) / 180) * Math.sin((sunAzimuth * Math.PI) / 180),
      Math.sin((sunElevation * Math.PI) / 180),
      Math.cos((sunElevation * Math.PI) / 180) * Math.cos((sunAzimuth * Math.PI) / 180)
    ).normalize();

    this.dome = buildSkyDome();
    scene.add(this.dome);

    // sol (billboard)
    const sunMat = new THREE.SpriteMaterial({
      map: makeSunTexture(),
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
    });
    this.sunSprite = new THREE.Sprite(sunMat);
    this.sunSprite.scale.setScalar(SKY_RADIUS * 0.33);
    this.sunSprite.renderOrder = -9;
    scene.add(this.sunSprite);

    // nuvens
    this.clouds = [];
    const cloudTex = makeCloudTexture(256, 7);
    const rng = makeRng(4242);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        depthWrite: false,
        opacity: rng.range(0.35, 0.78),
        color: new THREE.Color().setHSL(0.08, 0.14, rng.range(0.86, 0.98)),
        fog: false,
        toneMapped: false,
      });
      const s = new THREE.Sprite(mat);
      const ang = rng() * Math.PI * 2;
      const dist = rng.range(1200, 2600);
      const hgt = rng.range(280, 620);
      s.position.set(Math.cos(ang) * dist, hgt, Math.sin(ang) * dist);
      const sc = rng.range(420, 900);
      s.scale.set(sc, sc * rng.range(0.35, 0.6), 1);
      s.renderOrder = -8;
      scene.add(s);
      this.clouds.push({ sprite: s, drift: rng.range(0.15, 0.5), angle: ang, dist });
    }

    // montanhas distantes
    this.mountains = [];
    const rings = [
      { radius: 470, height: 70, segments: 150, seed: 3, top: '#8f9dae', bottom: '#6e7c8c', freq: 4 },
      { radius: 760, height: 130, segments: 120, seed: 11, top: '#9fadb9', bottom: '#7d8b99', freq: 5 },
      { radius: 1150, height: 210, segments: 100, seed: 23, top: '#b3bdc6', bottom: '#96a3ad', freq: 3 },
    ];
    for (const r of rings) {
      const mesh = buildMountainRing({
        radius: r.radius,
        height: r.height,
        segments: r.segments,
        seed: r.seed,
        colorTop: r.top,
        colorBottom: r.bottom,
        heightFn: (a, seed) => ridged2(Math.cos(a) * r.freq + seed, Math.sin(a) * r.freq - seed, 3),
      });
      scene.add(mesh);
      this.mountains.push(mesh);
    }

    // luzes
    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x51603a, 0.85);
    scene.add(this.hemi);

    this.sunLight = new THREE.DirectionalLight(0xfff0d6, 2.9);
    this.sunLight.castShadow = shadows;
    if (shadows) {
      const cam = this.sunLight.shadow.camera;
      cam.left = -42; cam.right = 42; cam.top = 42; cam.bottom = -42;
      cam.near = 1; cam.far = 260;
      cam.updateProjectionMatrix();
      this.sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      this.sunLight.shadow.bias = -0.0004;
      this.sunLight.shadow.normalBias = 0.035;
      this.sunLight.shadow.radius = 2.2;
    }
    this.sunLight.position.copy(this.sunDir).multiplyScalar(120);
    this.sunLight.target.position.set(0, 0, 0);
    scene.add(this.sunLight, this.sunLight.target);

    // luz de preenchimento suave vinda do lado oposto (evita sombras 100% pretas)
    this.fillLight = new THREE.DirectionalLight(0xa8c4e8, 0.35);
    this.fillLight.position.copy(this.sunDir).multiplyScalar(-60).setY(40);
    scene.add(this.fillLight);

    scene.fog = new THREE.FogExp2(0xbfcbd6, 0.0019);
    scene.background = new THREE.Color('#cfdae4');

    this._focus = new THREE.Vector3();
  }

  setShadows(enabled) {
    this.sunLight.castShadow = enabled;
    this.shadows = enabled;
  }

  update(dt, camera, focus, time) {
    this.dome.position.copy(camera.position);
    this.sunSprite.position.copy(camera.position).addScaledVector(this.sunDir, SKY_RADIUS * 0.92);
    for (const c of this.clouds) {
      c.sprite.position.x += c.drift * dt;
      c.sprite.position.z += c.drift * dt * 0.35;
      if (c.sprite.position.lengthSq() > 3000 * 3000) {
        c.sprite.position.multiplyScalar(0.6);
      }
    }
    // sol acompanha o jogador
    this._focus.copy(focus);
    this._focus.x = Math.round(this._focus.x * 2) / 2;
    this._focus.z = Math.round(this._focus.z * 2) / 2;
    this.sunLight.position.copy(this._focus).addScaledVector(this.sunDir, 120);
    this.sunLight.target.position.copy(this._focus);
    this.sunLight.target.updateMatrixWorld();
    this.fillLight.position.copy(this._focus).addScaledVector(this.sunDir, -60).setY(this._focus.y + 40);
    void time;
  }
}
