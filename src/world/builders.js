// Construtor de geometria por material + utilitários de colisão.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Construtor de geometria agrupada por material
// ---------------------------------------------------------------------------
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export class GeoBuilder {
  constructor() {
    this.parts = new Map();
  }

  add(matKey, geometry) {
    if (!this.parts.has(matKey)) this.parts.set(matKey, []);
    // mergeGeometries exige todos os atributos iguais: usamos sempre não-indexado
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geo !== geometry) geometry.dispose();
    // remove atributos extras que algumas geometrias trazem
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    }
    this.parts.get(matKey).push(geo);
    return this;
  }

  /** Caixa com posição e rotação (graus) aplicadas. */
  box(matKey, w, h, d, x = 0, y = 0, z = 0, rot = { x: 0, y: 0, z: 0 }, uvScale = null) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (uvScale) scaleUV(geo, uvScale);
    applyTransform(geo, x, y, z, rot);
    return this.add(matKey, geo);
  }

  /** Plano (parede fina) virado para +Z antes das rotações. */
  plane(matKey, w, h, x, y, z, rot = { x: 0, y: 0, z: 0 }, uvScale = null) {
    const geo = new THREE.PlaneGeometry(w, h);
    if (uvScale) scaleUV(geo, uvScale);
    applyTransform(geo, x, y, z, rot);
    return this.add(matKey, geo);
  }

  cylinder(matKey, rt, rb, h, seg, x, y, z, rot = { x: 0, y: 0, z: 0 }, uvScale = null) {
    const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (uvScale) scaleUV(geo, uvScale);
    applyTransform(geo, x, y, z, rot);
    return this.add(matKey, geo);
  }

  shape(matKey, points2D, depth, x, y, z, rot = { x: 0, y: 0, z: 0 }) {
    const shape = new THREE.Shape();
    shape.moveTo(points2D[0][0], points2D[0][1]);
    for (let i = 1; i < points2D.length; i++) shape.lineTo(points2D[i][0], points2D[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    applyTransform(geo, x, y, z, rot);
    return this.add(matKey, geo);
  }

  /** Junta tudo e devolve um grupo com 1 mesh por material. */
  build(materials, { castShadow = true, receiveShadow = true, name = 'build' } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, geos] of this.parts) {
      const mat = materials[key];
      if (!mat) continue;
      let merged = null;
      try {
        merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      } catch (e) {
        merged = geos[0];
      }
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.name = `${name}-${key}`;
      group.add(mesh);
    }
    return group;
  }
}

export function scaleUV(geo, scale) {
  const uv = geo.attributes.uv;
  if (!uv) return;
  const sx = Array.isArray(scale) ? scale[0] : scale;
  const sy = Array.isArray(scale) ? scale[1] : scale;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
}

export function applyTransform(geo, x, y, z, rot = { x: 0, y: 0, z: 0 }) {
  _e.set(
    (rot.x || 0) * Math.PI / 180,
    (rot.y || 0) * Math.PI / 180,
    (rot.z || 0) * Math.PI / 180,
    'YXZ'
  );
  _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s);
  geo.applyMatrix4(_m4);
  return geo;
}

// ---------------------------------------------------------------------------
// Colisores
// ---------------------------------------------------------------------------
export function addBoxCollider(world, RAPIER, { x, y, z, hx, hy, hz, rotY = 0, friction = 0.9 }) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(x, y, z)
      .setRotation(quatFromY(rotY))
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction),
    body
  );
  return col;
}

export function addCylinderCollider(world, RAPIER, { x, y, z, radius, halfHeight, friction = 0.9 }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
  return world.createCollider(
    RAPIER.ColliderDesc.cylinder(halfHeight, radius).setFriction(friction),
    body
  );
}

export function addBallCollider(world, RAPIER, { x, y, z, radius, friction = 0.9 }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
  return world.createCollider(RAPIER.ColliderDesc.ball(radius).setFriction(friction), body);
}

export function quatFromY(rotY) {
  const h = rotY * 0.5;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

/** Índice de material clonando textura com repetição própria. */
export function cloneWithRepeat(tex, repeat, anisotropy = 4) {
  if (!tex) return null;
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = anisotropy;
  return t;
}
