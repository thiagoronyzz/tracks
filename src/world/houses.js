// Casas rurais geradas proceduralmente, com fundação encaixada no relevo.

import * as THREE from 'three';
import { makeRng } from '../core/math.js';
import {
  GeoBuilder,
  addBoxCollider,
  addCylinderCollider,
  cloneWithRepeat,
  quatFromY,
} from './builders.js';

const _m4 = new THREE.Matrix4();

export class Village {
  constructor({ scene, world, RAPIER, terrain, textures, count = 13, anisotropy = 4, seed = 991 }) {
    this.scene = scene;
    this.world = world;
    this.RAPIER = RAPIER;
    this.terrain = terrain;
    this.rng = makeRng(seed);
    this.houses = [];

    const wallMats = [
      new THREE.MeshStandardMaterial({
        map: cloneWithRepeat(textures.plaster, 1, anisotropy),
        color: 0xece5d6,
        roughness: 0.92,
        metalness: 0,
      }),
      new THREE.MeshStandardMaterial({
        map: cloneWithRepeat(textures.plaster, 1, anisotropy),
        color: 0xd9e2e6,
        roughness: 0.92,
        metalness: 0,
      }),
      new THREE.MeshStandardMaterial({
        map: cloneWithRepeat(textures.plaster, 1, anisotropy),
        color: 0xe6cdb4,
        roughness: 0.92,
        metalness: 0,
      }),
    ];
    this.materials = {
      roof: new THREE.MeshStandardMaterial({
        map: cloneWithRepeat(textures.roof, 3, anisotropy),
        color: 0xd0b9a8,
        roughness: 0.88,
        metalness: 0,
      }),
      roofGray: new THREE.MeshStandardMaterial({
        map: cloneWithRepeat(textures.roof, 3, anisotropy),
        color: 0x9aa0a4,
        roughness: 0.85,
        metalness: 0.05,
      }),
      wood: new THREE.MeshStandardMaterial({
        map: cloneWithRepeat(textures.wood, 1.5, anisotropy),
        color: 0x8a6a4a,
        roughness: 0.85,
        metalness: 0,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x101a20,
        roughness: 0.18,
        metalness: 0.35,
        emissive: new THREE.Color('#e0a75a'),
        emissiveIntensity: 0.55,
      }),
      stone: new THREE.MeshStandardMaterial({
        map: cloneWithRepeat(textures.stone, 1.5, anisotropy),
        color: 0xa8a196,
        roughness: 0.95,
        metalness: 0,
      }),
      wall0: wallMats[0],
      wall1: wallMats[1],
      wall2: wallMats[2],
    };

    const builder = new GeoBuilder();
    this._plan(builder);
    const group = builder.build(this.materials, { castShadow: true, receiveShadow: true, name: 'village' });
    this.scene.add(group);
    this.group = group;
  }

  _findSpot(radius) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const dist = 42 + this.rng() * 260;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      let ok = true;
      for (const h of this.houses) {
        const need = h.radius + radius + 9;
        if ((x - h.x) ** 2 + (z - h.z) ** 2 < need * need) { ok = false; break; }
      }
      if (!ok) continue;
      // evita encostas muito íngremes
      let slope = 0;
      for (const [ox, oz] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]) {
        slope = Math.max(slope, this.terrain.slopeAt(x + ox, z + oz));
      }
      if (slope > 15) continue;
      return { x, z };
    }
    return null;
  }

  _plan(builder) {
    const houses = [];
    for (let i = 0; i < 13; i++) {
      const w = this.rng.range(6.4, 9.4);
      const d = this.rng.range(5.2, 7.4);
      const radius = Math.hypot(w, d) * 0.5;
      const spot = this._findSpot(radius);
      if (!spot) continue;
      houses.push({ ...spot, w, d, radius });
    }

    houses.forEach((h, idx) => {
      const rotY = this.rng() * Math.PI * 2;
      const wallVariant = 'wall' + this.rng.int(0, 2);
      const roofMat = this.rng.chance(0.72) ? 'roof' : 'roofGray';
      this._buildHouse(builder, h, { rotY, wallVariant, roofMat, idx });
      this.houses.push({ x: h.x, z: h.z, r: h.radius, radius: h.radius, rotY });
    });
  }

  _buildHouse(builder, h, { rotY, wallVariant, roofMat }) {
    const { w, d } = h;
    const rng = this.rng;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const local = (lx, lz) => ({ x: h.x + lx * cos + lz * sin, z: h.z - lx * sin + lz * cos });

    const corners = [
      local(-w / 2, -d / 2), local(w / 2, -d / 2),
      local(-w / 2, d / 2), local(w / 2, d / 2),
    ];
    let minH = Infinity, maxH = -Infinity;
    for (const c of corners) {
      const y = this.terrain.heightAt(c.x, c.z);
      minH = Math.min(minH, y);
      maxH = Math.max(maxH, y);
    }
    const floorY = maxH + 0.22;
    const wallH = rng.range(2.55, 3.05);
    const baseY = minH - 0.15;
    const foundationH = floorY - baseY + 0.1;

    // rotação em graus para os helpers
    const deg = rotY * 180 / Math.PI;

    // fundação
    builder.box('stone', w + 0.5, foundationH, d + 0.5, h.x, baseY + foundationH / 2, h.z, { y: deg }, 2);

    // paredes (4 blocos sólidos)
    const wallT = 0.26;
    const midY = floorY + wallH / 2;
    const uvWall = [w / 2.6, wallH / 2.6];
    const uvWallSide = [d / 2.6, wallH / 2.6];
    const pBack = local(0, -d / 2);
    const pFront = local(0, d / 2);
    const pLeft = local(-w / 2, 0);
    const pRight = local(w / 2, 0);
    builder.box(wallVariant, w, wallH, wallT, pBack.x, midY, pBack.z, { y: deg }, uvWall);
    builder.box(wallVariant, w, wallH, wallT, pFront.x, midY, pFront.z, { y: deg }, uvWall);
    builder.box(wallVariant, wallT, wallH, d, pLeft.x, midY, pLeft.z, { y: deg }, uvWallSide);
    builder.box(wallVariant, wallT, wallH, d, pRight.x, midY, pRight.z, { y: deg }, uvWallSide);

    // portal + porta (na frente, +Z local)
    const doorW = 1.0, doorH = 2.1;
    const doorPos = local(rng.range(-w * 0.18, w * 0.18), d / 2 + 0.02);
    builder.box('wood', doorW + 0.16, doorH + 0.12, 0.08, doorPos.x, floorY + (doorH + 0.12) / 2, doorPos.z, { y: deg }, 1);
    const doorPanelPos = local(
      (doorPos.x - h.x) * cos - (doorPos.z - h.z) * sin,
      (doorPos.x - h.x) * sin + (doorPos.z - h.z) * cos
    );
    void doorPanelPos;
    builder.box('wood', doorW, doorH, 0.06, doorPos.x + Math.sin(rotY) * 0.05, floorY + doorH / 2, doorPos.z + Math.cos(rotY) * 0.05, { y: deg }, 1);
    // maçaneta
    const knob = local(
      (doorPos.x - h.x) * cos - (doorPos.z - h.z) * sin + 0.3,
      (doorPos.x - h.x) * sin + (doorPos.z - h.z) * cos + 0.06
    );
    builder.box('stone', 0.07, 0.07, 0.07, knob.x, floorY + 1.0, knob.z, { y: deg });

    // janelas
    const windowCount = rng.int(2, 4);
    for (let i = 0; i < windowCount; i++) {
      const side = i % 4;
      const ww = 0.95, wh = 1.05;
      let lx = 0, lz = 0, rot = deg;
      if (side === 0) { lx = rng.range(-w * 0.32, w * 0.32); lz = d / 2 + 0.03; }
      else if (side === 1) { lx = rng.range(-w * 0.32, w * 0.32); lz = -d / 2 - 0.03; rot = deg + 180; }
      else if (side === 2) { lx = -w / 2 - 0.03; lz = rng.range(-d * 0.3, d * 0.3); rot = deg + 90; }
      else { lx = w / 2 + 0.03; lz = rng.range(-d * 0.3, d * 0.3); rot = deg - 90; }
      const p = local(lx, lz);
      const wy = floorY + rng.range(1.15, 1.45);
      builder.box('wood', ww + 0.14, wh + 0.14, 0.07, p.x, wy, p.z, { y: rot }, 1);
      builder.box('glass', ww, wh, 0.03, p.x + Math.sin(rot * Math.PI / 180) * 0.04, wy, p.z + Math.cos(rot * Math.PI / 180) * 0.04, { y: rot }, 1);
      // caixilho central
      builder.box('wood', 0.05, wh, 0.05, p.x + Math.sin(rot * Math.PI / 180) * 0.06, wy, p.z + Math.cos(rot * Math.PI / 180) * 0.06, { y: rot }, 1);
    }

    // telhado de duas águas
    const rise = rng.range(1.15, 1.75);
    const overhangX = 0.55, overhangZ = 0.62;
    const halfRun = d / 2 + overhangZ;
    const slopeLen = Math.hypot(halfRun, rise);
    const angle = Math.atan2(rise, halfRun) * 180 / Math.PI;
    const ridgeY = floorY + wallH + rise;
    const roofThick = 0.15;
    for (const sign of [1, -1]) {
      const cz = sign * halfRun / 2;
      const cy = ridgeY - rise / 2 + roofThick * 0.35;
      const p = local(0, cz);
      builder.box(roofMat, w + overhangX * 2, roofThick, slopeLen + 0.1, p.x, cy, p.z, { x: sign * angle, y: deg }, 2.2);
    }
    // cumeeira
    builder.box(roofMat, w + overhangX * 2, 0.2, 0.34, h.x, ridgeY + 0.06, h.z, { y: deg }, 1);

    // oitões (triângulos das paredes)
    const gableHalfWidth = d / 2;
    for (const sign of [1, -1]) {
      const px = sign * (w / 2 - 0.06);
      const p = local(px, 0);
      builder.shape(
        wallVariant,
        [[-gableHalfWidth, 0], [gableHalfWidth, 0], [0, rise]],
        0.2,
        p.x, floorY + wallH, p.z,
        { y: deg + 90 }
      );
    }

    // chaminé
    if (rng.chance(0.55)) {
      const p = local(rng.range(-w * 0.3, w * 0.3), -d * 0.2);
      const chH = wallH + rise + rng.range(0.4, 1.0);
      builder.box('stone', 0.55, chH, 0.55, p.x, floorY + chH / 2, p.z, { y: deg }, 2);
    }

    // varanda simples na frente
    if (rng.chance(0.6)) {
      const porchDepth = 2.0;
      const porchW = w * rng.range(0.55, 0.8);
      const pCenter = local(0, d / 2 + porchDepth / 2);
      builder.box('stone', porchW, 0.22, porchDepth, pCenter.x, floorY + 0.02, pCenter.z, { y: deg }, 2);
      // telhado da varanda (inclinado)
      const roofY = floorY + wallH * 0.82;
      const pRoof = local(0, d / 2 + porchDepth / 2 + 0.2);
      builder.box(roofMat, porchW + 0.4, 0.12, porchDepth + 0.5, pRoof.x, roofY, pRoof.z, { x: 8, y: deg }, 2);
      // postes
      for (const sx of [-porchW / 2 + 0.25, porchW / 2 - 0.25]) {
        const p = local(sx, d / 2 + porchDepth - 0.25);
        builder.box('wood', 0.16, wallH * 0.82, 0.16, p.x, floorY + wallH * 0.41, p.z, { y: deg }, 1);
        addCylinderCollider(this.world, this.RAPIER, {
          x: p.x, y: floorY + wallH * 0.41, z: p.z,
          radius: 0.13, halfHeight: wallH * 0.41,
        });
      }
      // degrau
      const stepPos = local(0, d / 2 + porchDepth + 0.35);
      builder.box('stone', 1.7, 0.26, 0.5, stepPos.x, floorY - 0.02, stepPos.z, { y: deg }, 2);
    }

    // colisor principal (casa sólida) — evita qualquer forma de atravessar
    const quat = quatFromY(rotY);
    const body = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed()
        .setTranslation(h.x, floorY + wallH * 0.5, h.z)
        .setRotation(quat)
    );
    this.world.createCollider(
      this.RAPIER.ColliderDesc.cuboid(w / 2, wallH * 0.5, d / 2).setFriction(0.85),
      body
    );
    // base da fundação (para poder subir na varanda sem cair dentro da parede)
    addBoxCollider(this.world, this.RAPIER, {
      x: h.x, y: baseY + foundationH / 2, z: h.z,
      hx: w / 2 + 0.25, hy: foundationH / 2, hz: d / 2 + 0.25,
      rotY,
    });
  }
}
