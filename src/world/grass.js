// Campo de grama instanciado, ancorado ao terreno. O padrão é determinístico
// por célula, então ao andar a grama não "teleporta": só entra e sai do raio.

import * as THREE from 'three';
import { clamp, fbm2, makeRng } from '../core/math.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

function bladeGeometry(blades = 4, height = 0.42, width = 0.028) {
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const bottom = new THREE.Color('#3d5a26');
  const top = new THREE.Color('#8aa653');

  for (let b = 0; b < blades; b++) {
    const yaw = (b / blades) * Math.PI * 2 + Math.random() * 0.9;
    const h = height * (0.65 + Math.random() * 0.7);
    const w = width * (0.7 + Math.random() * 0.7);
    const leanDir = Math.random() * Math.PI * 2;
    const leanAmount = h * (0.18 + Math.random() * 0.3);
    const base = positions.length / 3;
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    // 3 segmentos na vertical, curvando na direção "leanDir"
    const segs = 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const y = h * t;
      const bend = leanAmount * t * t;
      const halfW = w * (1 - t * 0.9) * 0.5;
      const cx = Math.cos(leanDir) * bend;
      const cz = Math.sin(leanDir) * bend;
      // duas laterais do talo
      for (const side of [-1, 1]) {
        positions.push(cx + ca * halfW * side, y, cz + sa * halfW * side);
        uvs.push(side > 0 ? 1 : 0, t);
        _color.copy(bottom).lerp(top, t * 0.85);
        colors.push(_color.r, _color.g, _color.b);
      }
      if (s > 0) {
        const i0 = base + (s - 1) * 2;
        const i1 = base + (s - 1) * 2 + 1;
        const i2 = base + s * 2;
        const i3 = base + s * 2 + 1;
        indices.push(i0, i1, i2, i1, i3, i2);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class GrassField {
  constructor({ scene, terrain, count = 9000, radius = 34, cell = 4.2, anisotropy = 4 }) {
    this.terrain = terrain;
    this.count = count;
    this.radius = radius;
    this.cell = cell;
    this.cellsPerSide = Math.ceil((radius * 2) / cell) + 1;
    this.perCell = Math.ceil(count / (this.cellsPerSide * this.cellsPerSide)) + 1;
    this.enabled = true;

    const geo = bladeGeometry(4, 0.44, 0.03);
    this.uniforms = {
      uTime: { value: 0 },
      uWind: { value: 0.05 },
      uRadius: { value: radius },
    };

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.92,
      metalness: 0,
      dithering: true,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uWind = this.uniforms.uWind;
      shader.uniforms.uRadius = this.uniforms.uRadius;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uWind;
           uniform float uRadius;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
             vec3 iOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
           #else
             vec3 iOrigin = vec3(0.0);
           #endif
           float bendH = clamp(transformed.y / 0.30, 0.0, 1.0);
           float phase = iOrigin.x * 0.62 + iOrigin.z * 0.41;
           float sway = sin(uTime * 1.9 + phase) * 0.6 + sin(uTime * 3.7 + phase * 1.9) * 0.25;
           float gust = 0.65 + 0.35 * sin(uTime * 0.32 + iOrigin.x * 0.02 + iOrigin.z * 0.017);
           transformed.x += sway * uWind * gust * bendH * bendH;
           transformed.z += cos(uTime * 1.5 + phase * 0.8) * uWind * 0.6 * gust * bendH * bendH;
           float camDist = length((modelViewMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz);
           transformed *= 1.0 - smoothstep(uRadius - 9.0, uRadius, camDist);`
        );
    };
    mat.customProgramCacheKey = () => 'grass-wind-v2';

    this.material = mat;
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = count;
    this.mesh.visible = true;
    scene.add(this.mesh);

    // cores por instância
    const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.mesh.instanceColor = colorAttr;
    this.mesh.instanceColor.needsUpdate = true;

    this.lastCell = { x: 1e9, z: 1e9 };
    this.placeholder = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  setVisible(v) {
    this.enabled = v;
    this.mesh.visible = v;
  }

  update(time, playerPos, force = false) {
    this.uniforms.uTime.value = time;
    if (!this.enabled) return;
    const cx = Math.floor(playerPos.x / this.cell);
    const cz = Math.floor(playerPos.z / this.cell);
    if (!force && cx === this.lastCell.x && cz === this.lastCell.z) return;
    this.lastCell.x = cx;
    this.lastCell.z = cz;
    this._rebuild(cx, cz);
  }

  _rebuild(centerCx, centerCz) {
    const half = (this.cellsPerSide - 1) >> 1;
    const m = this.mesh;
    let i = 0;
    const r2 = this.radius * this.radius;

    for (let dz = -half; dz <= half; dz++) {
      for (let dx = -half; dx <= half; dx++) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        const rng = makeRng(((cx * 73856093) ^ (cz * 19349663)) >>> 0);
        for (let k = 0; k < this.perCell && i < this.count; k++) {
          const worldX = (cx + rng()) * this.cell;
          const worldZ = (cz + rng()) * this.cell;
          if (i >= this.count) break;
          // descarta fora do raio, mas sempre preenche o índice (scale 0)
          const ddx = worldX - (centerCx + 0.5) * this.cell;
          const ddz = worldZ - (centerCz + 0.5) * this.cell;
          if (ddx * ddx + ddz * ddz > r2) {
            m.setMatrixAt(i, this.placeholder);
            colorAttrSet(m, i, 0, 0, 0);
            i++;
            continue;
          }
          const y = this.terrain.heightAt(worldX, worldZ);
          const slope = this.terrain.slopeAt(worldX, worldZ);
          if (slope > 34) {
            m.setMatrixAt(i, this.placeholder);
            colorAttrSet(m, i, 0, 0, 0);
            i++;
            continue;
          }
          const scale = 0.72 + rng() * 0.85;
          _pos.set(worldX, y - 0.02, worldZ);
          _q.setFromAxisAngle(UP, rng() * Math.PI * 2);
          _scale.set(scale * (0.85 + rng() * 0.3), scale, scale * (0.85 + rng() * 0.3));
          _m.compose(_pos, _q, _scale);
          m.setMatrixAt(i, _m);

          // variação sutil de cor (mais amarelada nas áreas secas)
          const dryness = fbm2(worldX * 0.02 + 4, worldZ * 0.02 - 2, 2) * 0.5 + 0.5;
          const tint = 0.82 + rng() * 0.3;
          _color.setRGB(
            tint * (0.92 + dryness * 0.35),
            tint * (1.0 + dryness * 0.12),
            tint * (0.72 - dryness * 0.05)
          );
          colorAttrSet(m, i, _color.r, _color.g, _color.b);
          i++;
        }
      }
    }
    for (; i < this.count; i++) m.setMatrixAt(i, this.placeholder);
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

function colorAttrSet(mesh, i, r, g, b) {
  if (!mesh.instanceColor) return;
  const arr = mesh.instanceColor.array;
  arr[i * 3 + 0] = r;
  arr[i * 3 + 1] = g;
  arr[i * 3 + 2] = b;
}
