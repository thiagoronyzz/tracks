// Vegetação, pedras e cercas espalhadas pelo campo.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, fbm2, makeRng } from '../core/math.js';
import { GeoBuilder, addBallCollider, addBoxCollider, addCylinderCollider, cloneWithRepeat } from './builders.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function blobGeometry(radius, detail, rng, colorA, colorB) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm2(v.x * 1.6 + radius * 3.1, v.z * 1.6 + v.y * 1.2, 2) * 0.24;
    v.multiplyScalar(1 + n);
    v.y *= 0.86;
    pos.setXYZ(i, v.x, v.y, v.z);
    const t = clamp(0.35 + (v.y / radius) * 0.35 + rng() * 0.2, 0, 1);
    _c.copy(colorA).lerp(colorB, t);
    colors[i * 3] = _c.r;
    colors[i * 3 + 1] = _c.g;
    colors[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function makeBroadleaf(rng, { height = 7.5, crown = 2.9, blobs = 5 } = {}) {
  const trunkGeos = [];
  const trunkH = height * 0.52;
  const trunk = new THREE.CylinderGeometry(0.16, 0.34, trunkH, 7, 1);
  trunk.translate(0, trunkH / 2, 0);
  trunkGeos.push(trunk);
  // galhos
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rng() * 0.6;
    const len = height * (0.28 + rng() * 0.12);
    const br = new THREE.CylinderGeometry(0.05, 0.12, len, 5, 1);
    br.translate(0, len / 2, 0);
    const m = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(0.55 + rng() * 0.2, a, 0)
    );
    br.applyMatrix4(m);
    br.translate(0, trunkH * 0.92, 0);
    trunkGeos.push(br);
  }

  const leafGeos = [];
  const crownY = trunkH + height * 0.26;
  for (let i = 0; i < blobs; i++) {
    const r = crown * (0.52 + rng() * 0.5);
    const a = (i / blobs) * Math.PI * 2;
    const rad = i === 0 ? 0 : crown * (0.32 + rng() * 0.5);
    const g = blobGeometry(r, 1, rng, new THREE.Color('#3f5f30'), new THREE.Color('#7c964b'));
    g.translate(Math.cos(a) * rad, crownY + (rng() - 0.5) * crown * 0.6, Math.sin(a) * rad);
    leafGeos.push(g);
  }

  return {
    trunk: mergeGeometries(trunkGeos, false),
    leaves: mergeGeometries(leafGeos, false),
    height,
    radius: 0.34,
  };
}

function makeCypress(rng, { height = 9 } = {}) {
  const trunkH = height * 0.35;
  const trunk = new THREE.CylinderGeometry(0.1, 0.26, trunkH, 6, 1);
  trunk.translate(0, trunkH / 2, 0);
  const layers = 4;
  const cones = [];
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = 1.5 * (1 - t * 0.62);
    const h = height * 0.34;
    const cone = new THREE.ConeGeometry(r, h, 7, 1);
    cone.translate(0, trunkH + t * height * 0.5 + h * 0.35, 0);
    const colors = new Float32Array(cone.attributes.position.count * 3);
    for (let k = 0; k < cone.attributes.position.count; k++) {
      _c.copy(new THREE.Color('#2f4a28')).lerp(new THREE.Color('#557a3c'), t * 0.7 + Math.random() * 0.2);
      colors[k * 3] = _c.r; colors[k * 3 + 1] = _c.g; colors[k * 3 + 2] = _c.b;
    }
    cone.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    cones.push(cone);
  }
  return {
    trunk,
    leaves: mergeGeometries(cones, false),
    height,
    radius: 0.28,
  };
}

function makeRockGeometry(rng) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(0.75 + rng() * 0.5);
    v.y *= 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Scenery {
  constructor({ scene, world, RAPIER, terrain, textures, occupied = [], anisotropy = 4 }) {
    this.scene = scene;
    this.world = world;
    this.RAPIER = RAPIER;
    this.terrain = terrain;
    this.occupied = occupied;
    this.textures = textures;
    this.rng = makeRng(20261127);
    this.trees = [];

    const barkMap = cloneWithRepeat(textures.bark, 2, anisotropy);
    const leafMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
      flatShading: false,
    });
    const trunkMat = new THREE.MeshStandardMaterial({
      map: barkMap,
      color: 0xb59a7d,
      roughness: 0.95,
      metalness: 0,
    });

    this.variants = [
      { ...makeBroadleaf(this.rng, { height: 8.2, crown: 3.0, blobs: 5 }), count: 96 },
      { ...makeBroadleaf(this.rng, { height: 6.4, crown: 2.4, blobs: 4 }), count: 70 },
      { ...makeCypress(this.rng, { height: 8.5 }), count: 46 },
    ];

    this._placeTrees(trunkMat, leafMat, anisotropy);
    this._placeBushes(leafMat);
    this._placeRocks(leafMat);
    this._buildFences(anisotropy);
  }

  _canPlace(x, z, radius, { minR = 26, maxR = 392, maxSlope = 26 } = {}) {
    const d = Math.hypot(x, z);
    if (d < minR || d > maxR) return false;
    if (this.terrain.slopeAt(x, z) > maxSlope) return false;
    for (const o of this.occupied) {
      if ((x - o.x) ** 2 + (z - o.z) ** 2 < (radius + o.r) ** 2) return false;
    }
    return true;
  }

  _placeTrees(trunkMat, leafMat, anisotropy) {
    for (const variant of this.variants) {
      const trunkMesh = new THREE.InstancedMesh(variant.trunk, trunkMat, variant.count);
      const leafMesh = new THREE.InstancedMesh(variant.leaves, leafMat, variant.count);
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      leafMesh.castShadow = true;
      leafMesh.receiveShadow = true;
      leafMesh.frustumCulled = false;
      trunkMesh.frustumCulled = false;
      trunkMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      leafMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      let placed = 0;
      let guard = 0;
      while (placed < variant.count && guard < variant.count * 60) {
        guard++;
        // agrupa árvores em bosques usando ruído
        const x = this.rng.range(-392, 392);
        const z = this.rng.range(-392, 392);
        const density = fbm2(x * 0.006 + 5, z * 0.006 - 3, 3) * 0.5 + 0.5;
        if (this.rng() > density * 1.25) continue;
        if (!this._canPlace(x, z, 3.2)) continue;
        const y = this.terrain.heightAt(x, z);
        const scale = this.rng.range(0.75, 1.35);
        const tilt = this.rng.range(-0.04, 0.04);
        _p.set(x, y - 0.15, z);
        _q.setFromEuler(new THREE.Euler(tilt, this.rng() * Math.PI * 2, tilt * 0.7));
        _s.set(scale * this.rng.range(0.9, 1.1), scale, scale * this.rng.range(0.9, 1.1));
        _m.compose(_p, _q, _s);
        trunkMesh.setMatrixAt(placed, _m);
        leafMesh.setMatrixAt(placed, _m);
        const tint = this.rng.range(0.78, 1.12);
        _c.setRGB(tint * 0.95, tint, tint * 0.85);
        leafMesh.setColorAt(placed, _c);

        addCylinderCollider(this.world, this.RAPIER, {
          x, y: y + 2.2 * scale, z,
          radius: variant.radius * scale + 0.12,
          halfHeight: 2.3 * scale,
        });
        this.occupied.push({ x, z, r: 1.4 });
        this.trees.push({ x, z, y, scale });
        placed++;
      }
      trunkMesh.count = placed;
      leafMesh.count = placed;
      trunkMesh.instanceMatrix.needsUpdate = true;
      leafMesh.instanceMatrix.needsUpdate = true;
      if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
      this.scene.add(trunkMesh, leafMesh);
    }
  }

  _placeBushes(leafMat) {
    const count = 150;
    const geo = blobGeometry(0.8, 1, this.rng, new THREE.Color('#33491f'), new THREE.Color('#6c8a3f'));
    geo.scale(1, 0.75, 1);
    geo.translate(0, 0.35, 0);
    const mesh = new THREE.InstancedMesh(geo, leafMat.clone(), count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 40) {
      guard++;
      const x = this.rng.range(-300, 300);
      const z = this.rng.range(-300, 300);
      if (!this._canPlace(x, z, 1.2, { minR: 18 })) continue;
      const y = this.terrain.heightAt(x, z);
      _p.set(x, y - 0.1, z);
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng() * Math.PI * 2);
      const s = this.rng.range(0.6, 1.5);
      _s.set(s, s * this.rng.range(0.8, 1.2), s);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(placed, _m);
      const tint = this.rng.range(0.8, 1.1);
      mesh.setColorAt(placed, _c.setRGB(tint, tint * 1.03, tint * 0.8));
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }

  _placeRocks(leafMat) {
    const count = 90;
    const geo = makeRockGeometry(this.rng);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a8378,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 40) {
      guard++;
      const x = this.rng.range(-330, 330);
      const z = this.rng.range(-330, 330);
      if (!this._canPlace(x, z, 2.0, { minR: 22 })) continue;
      const y = this.terrain.heightAt(x, z);
      const s = this.rng.range(0.5, 2.6);
      _p.set(x, y + s * 0.18, z);
      _q.setFromEuler(new THREE.Euler(this.rng.range(-0.2, 0.2), this.rng() * Math.PI * 2, this.rng.range(-0.2, 0.2)));
      _s.set(s * this.rng.range(0.8, 1.3), s * this.rng.range(0.6, 1.0), s * this.rng.range(0.8, 1.3));
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(placed, _m);
      addBallCollider(this.world, this.RAPIER, {
        x, y: y + s * 0.25, z,
        radius: Math.max(0.35, s * 1.05),
      });
      this.occupied.push({ x, z, r: s });
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  _buildFences(anisotropy) {
    const woodMat = new THREE.MeshStandardMaterial({
      map: cloneWithRepeat(this.textures.wood, 1.5, anisotropy),
      color: 0x9b8468,
      roughness: 0.9,
      metalness: 0,
    });
    const builder = new GeoBuilder();
    const lines = 7;
    for (let l = 0; l < lines; l++) {
      let x = this.rng.range(-280, 280);
      let z = this.rng.range(-280, 280);
      if (Math.hypot(x, z) < 40) {
        x += 60;
        z += 40;
      }
      let angle = this.rng() * Math.PI * 2;
      const posts = this.rng.int(7, 12);
      const spacing = 2.6;
      const points = [];
      for (let i = 0; i < posts; i++) {
        const px = x + Math.cos(angle) * spacing * i;
        const pz = z + Math.sin(angle) * spacing * i;
        const py = this.terrain.heightAt(px, pz);
        points.push({ x: px, y: py, z: pz });
        if (i < posts - 1) {
          angle += this.rng.range(-0.06, 0.06);
        }
      }
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        builder.box('wood', 0.14, 1.25, 0.14, p.x, p.y + 0.55, p.z, { y: this.rng.range(0, 90) }, 1);
        if (i < points.length - 1) {
          const n = points[i + 1];
          const dx = n.x - p.x, dz = n.z - p.z;
          const len = Math.hypot(dx, dz);
          const rotY = Math.atan2(dx, dz);
          const midX = (p.x + n.x) / 2, midZ = (p.z + n.z) / 2;
          const midY = (p.y + n.y) / 2;
          for (const h of [0.55, 0.95]) {
            builder.box('wood', 0.07, 0.11, len, midX, midY + h, midZ, { y: rotY }, 2);
          }
          addBoxCollider(this.world, this.RAPIER, {
            x: midX, y: midY + 0.7, z: midZ,
            hx: 0.12, hy: 0.68, hz: len * 0.5,
            rotY,
          });
        }
        this.occupied.push({ x: p.x, z: p.z, r: 0.6 });
      }
    }
    const group = builder.build({ wood: woodMat }, { castShadow: true, receiveShadow: true, name: 'fences' });
    this.scene.add(group);
  }
}
