// Terreno: campo com relevos e morros. Um único grid é usado tanto para a
// malha visual quanto para o colisor (trimesh), então o pé do personagem e o
// chão desenhado sempre coincidem.

import * as THREE from 'three';
import { clamp, fbm2, lerp, smoothstep } from '../core/math.js';

export const TERRAIN_SIZE = 900;
export const TERRAIN_SEGMENTS = 256;

const HALF = TERRAIN_SIZE * 0.5;
const STEP = TERRAIN_SIZE / TERRAIN_SEGMENTS;

/** Altura "crua" (sem o platô inicial). */
export function rawHeight(x, z) {
  const dist = Math.hypot(x, z);
  let h = fbm2(x * 0.0021 + 3.7, z * 0.0021 - 8.1, 4) * 24;
  h += fbm2(x * 0.0068 - 1.3, z * 0.0068 + 4.4, 3) * 6.2;
  h += fbm2(x * 0.031 + 9.2, z * 0.031 + 2.6, 2) * 0.75;
  // vale: o miolo do mapa é mais baixo, morros crescem nas bordas
  h += smoothstep(70, 420, dist) * 16;
  return h;
}

const SPAWN_HEIGHT = rawHeight(0, 0);

/** Altura final do terreno (com a clareira plana onde o jogador nasce). */
export function terrainHeight(x, z) {
  const h = rawHeight(x, z);
  const flat = smoothstep(15, 66, Math.hypot(x, z));
  return lerp(SPAWN_HEIGHT + (h - SPAWN_HEIGHT) * 0.2, h, flat);
}

/** Altura aproximada analítica (útil para posicionar objetos). */
export function heightApprox(x, z) {
  return terrainHeight(clamp(x, -HALF + 1, HALF - 1), clamp(z, -HALF + 1, HALF - 1));
}

const COLOR_GRASS_LUSH = new THREE.Color('#5c7a3c');
const COLOR_GRASS_DRY = new THREE.Color('#94955b');
const COLOR_GRASS_DARK = new THREE.Color('#3d5528');
const COLOR_DIRT = new THREE.Color('#7a6a4f');
const COLOR_ROCK = new THREE.Color('#7b7468');

export class Terrain {
  constructor({ scene, world, RAPIER, anisotropy = 4, textures }) {
    this.scene = scene;
    this.world = world;
    this.RAPIER = RAPIER;
    this.anisotropy = anisotropy;
    this.textures = textures;
    this.heights = new Float32Array((TERRAIN_SEGMENTS + 1) * (TERRAIN_SEGMENTS + 1));
    this.normals = new Float32Array(this.heights.length * 3);
    this.mesh = null;
    this.collider = null;
    this._build();
  }

  _gridIndex(ix, iz) {
    return iz * (TERRAIN_SEGMENTS + 1) + ix;
  }

  _build() {
    const seg = TERRAIN_SEGMENTS;
    const vcount = (seg + 1) * (seg + 1);
    const positions = new Float32Array(vcount * 3);
    const uvs = new Float32Array(vcount * 2);
    const colors = new Float32Array(vcount * 3);
    const indices = new Uint32Array(seg * seg * 6);

    const grassLush = COLOR_GRASS_LUSH;
    const tmp = new THREE.Color();

    // 1) alturas
    for (let iz = 0; iz <= seg; iz++) {
      for (let ix = 0; ix <= seg; ix++) {
        const x = -HALF + ix * STEP;
        const z = -HALF + iz * STEP;
        const h = terrainHeight(x, z);
        const i = this._gridIndex(ix, iz);
        this.heights[i] = h;
        positions[i * 3 + 0] = x;
        positions[i * 3 + 1] = h;
        positions[i * 3 + 2] = z;
        uvs[i * 2 + 0] = ix / seg;
        uvs[i * 2 + 1] = iz / seg;
      }
    }

    // 2) normais analíticas por diferenças finitas do grid
    for (let iz = 0; iz <= seg; iz++) {
      for (let ix = 0; ix <= seg; ix++) {
        const i = this._gridIndex(ix, iz);
        const hL = this.heights[this._gridIndex(Math.max(0, ix - 1), iz)];
        const hR = this.heights[this._gridIndex(Math.min(seg, ix + 1), iz)];
        const hD = this.heights[this._gridIndex(ix, Math.max(0, iz - 1))];
        const hU = this.heights[this._gridIndex(ix, Math.min(seg, iz + 1))];
        const nx = (hL - hR) / (2 * STEP);
        const nz = (hD - hU) / (2 * STEP);
        const len = Math.hypot(nx, 1, nz);
        this.normals[i * 3 + 0] = nx / len;
        this.normals[i * 3 + 1] = 1 / len;
        this.normals[i * 3 + 2] = nz / len;

        // 3) cor por vértice: variação de vegetação, seco nas alturas e
        //    terra/pedra nas encostas mais íngremes
        const x = positions[i * 3 + 0];
        const z = positions[i * 3 + 2];
        const slope = 1 - 1 / len;
        const patch = fbm2(x * 0.021 + 12, z * 0.021 - 5, 3) * 0.5 + 0.5;
        const wide = fbm2(x * 0.0045 - 7, z * 0.0045 + 3, 3) * 0.5 + 0.5;
        tmp.copy(grassLush);
        tmp.lerp(COLOR_GRASS_DARK, clamp((1 - patch) * 0.85, 0, 1));
        tmp.lerp(COLOR_GRASS_DRY, clamp((wide - 0.35) * 1.1, 0, 0.75));
        tmp.lerp(COLOR_DIRT, clamp(slope * 3.2 - 0.12, 0, 0.7));
        tmp.lerp(COLOR_ROCK, clamp(slope * 5.5 - 0.55, 0, 0.55));
        colors[i * 3 + 0] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
      }
    }

    // 4) índices (mesma triangulação usada por heightAt)
    let p = 0;
    for (let iz = 0; iz < seg; iz++) {
      for (let ix = 0; ix < seg; ix++) {
        const a = this._gridIndex(ix, iz);
        const b = this._gridIndex(ix + 1, iz);
        const c = this._gridIndex(ix + 1, iz + 1);
        const d = this._gridIndex(ix, iz + 1);
        indices[p++] = a; indices[p++] = b; indices[p++] = d;
        indices[p++] = b; indices[p++] = c; indices[p++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    const repeat = 116; // ~7.8 m por repetição
    const map = this.textures.grass.map.clone();
    map.needsUpdate = true;
    map.repeat.set(repeat, repeat);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = this.anisotropy;
    const normalMap = this.textures.grass.normalMap.clone();
    normalMap.needsUpdate = true;
    normalMap.repeat.set(repeat, repeat);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.anisotropy = this.anisotropy;

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      dithering: true,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    // 5) colisor trimesh idêntico à malha
    const colliderDesc = this.RAPIER.ColliderDesc.trimesh(positions, indices)
      .setFriction(1.0)
      .setRestitution(0.0);
    this.collider = this.world.createCollider(colliderDesc);
    this.geometry = geo;
  }

  /**
   * Altura exata na triangulação do mesh. Usada para colocar grama, casas,
   * árvores e para consultas de gameplay.
   */
  heightAt(x, z) {
    const seg = TERRAIN_SEGMENTS;
    const fx = clamp((x + HALF) / STEP, 0, seg - 1e-4);
    const fz = clamp((z + HALF) / STEP, 0, seg - 1e-4);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const hA = this.heights[this._gridIndex(ix, iz)];
    const hB = this.heights[this._gridIndex(ix + 1, iz)];
    const hC = this.heights[this._gridIndex(ix + 1, iz + 1)];
    const hD = this.heights[this._gridIndex(ix, iz + 1)];
    // diagonal b-d: triângulos (a,b,d) e (b,c,d)
    if (tx + tz <= 1) {
      return hA + (hB - hA) * tx + (hD - hA) * tz;
    }
    return hC + (hD - hC) * (1 - tx) + (hB - hC) * (1 - tz);
  }

  /** Normal aproximada do terreno. */
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.2;
    const hL = this.heightAt(x - e, z);
    const hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e);
    const hU = this.heightAt(x, z + e);
    out.set(hL - hR, 2 * e, hD - hU).normalize();
    return out;
  }

  /** Inclinação em graus (0 = plano). */
  slopeAt(x, z) {
    const n = this.normalAt(x, z, _tmpNormal);
    return Math.acos(clamp(n.y, -1, 1)) * (180 / Math.PI);
  }
}

const _tmpNormal = new THREE.Vector3();
