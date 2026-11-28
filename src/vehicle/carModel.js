// Modelo visual de um sedã: carroceria extrudada (perfil lateral com cavas de
// roda), capô/tampa, cabine com vidros e colunas, duas portas com pivô na
// dobradiça, interior com bancos e volante, rodas com pneu e aro.
//
// Eixos locais: +Z para frente, +Y para cima, +X para a esquerda.

import * as THREE from 'three';

export const CAR_DIMS = {
  length: 4.42,
  width: 1.82,
  height: 1.46,
  wheelBase: 2.66,
  track: 1.56,
  wheelRadius: 0.335,
  wheelWidth: 0.225,
  beltline: 0.92,
  floor: 0.30,
  roof: 1.44,
  doorZ0: -0.36,
  doorZ1: 0.70,
  doorHingeZ: 0.70,
};

const ARCH_R = 0.46;

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a * 0.5;
}

/** Extruda um perfil lateral (pares [z, y]) ao longo de X, centrado. */
export function extrudeProfile(points, width, opts = {}) {
  const pts = points.slice();
  if (signedArea(pts) < 0) pts.reverse(); // Shape precisa ser anti-horário
  const shape = new THREE.Shape();
  pts.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  const bevel = opts.bevel ?? 0.018;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: opts.bevelSegments ?? 2,
    curveSegments: opts.curveSegments ?? 8,
    steps: 1,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function arcPoints(cz, cy, r, from, to, steps = 8) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    out.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/**
 * Metade inferior da carroceria (frente ou trás) com a cava de roda recortada
 * no perfil lateral. dir > 0 = seção dianteira, dir < 0 = traseira.
 */
function lowerSection(dir) {
  const floor = CAR_DIMS.floor;
  const belt = CAR_DIMS.beltline;
  const archZ = dir > 0 ? CAR_DIMS.wheelBase / 2 : -CAR_DIMS.wheelBase / 2;
  const inner = dir > 0 ? 0.66 : -0.34;
  const pts = [];
  const arch = (from, to) => {
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      pts.push([from + (to - from) * t, floor + Math.sin(Math.PI * t) * ARCH_R * 0.95]);
    }
  };
  if (dir > 0) {
    // topo: capô subindo até o para-brisa
    pts.push([inner, belt], [1.25, 0.875], [1.82, 0.80], [2.12, 0.72],
      [2.203, 0.60], [2.19, 0.44], [2.06, 0.325]);
    // fundo: para trás, passando por cima da roda
    pts.push([archZ + ARCH_R, floor]);
    arch(archZ + ARCH_R, archZ - ARCH_R);
    pts.push([archZ - ARCH_R, floor], [inner, floor]);
  } else {
    pts.push([inner, belt - 0.015], [-1.55, 0.885], [-2.03, 0.825],
      [-2.16, 0.72], [-2.2, 0.55], [-2.09, 0.36], [-1.9, floor]);
    pts.push([archZ - ARCH_R, floor]);
    arch(archZ - ARCH_R, archZ + ARCH_R);
    pts.push([archZ + ARCH_R, floor], [inner, floor]);
  }
  return extrudeProfile(pts, CAR_DIMS.width);
}

export function buildCarModel({ color = '#b6412f' } = {}) {
  const group = new THREE.Group();
  group.name = 'car';

  const paint = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.55,
    roughness: 0.32,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.2, roughness: 0.75 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0d1418, metalness: 0.15, roughness: 0.06, transparent: true, opacity: 0.62,
  });
  const interior = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.05, roughness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.95, roughness: 0.22 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x121316, metalness: 0.02, roughness: 0.95 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.9, roughness: 0.3 });
  const lightWhite = new THREE.MeshStandardMaterial({
    color: 0xf4f6ff, emissive: 0xdfe8ff, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1,
  });
  const lightRed = new THREE.MeshStandardMaterial({
    color: 0x8e1414, emissive: 0xc02020, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.1,
  });
  const plate = new THREE.MeshStandardMaterial({ color: 0xdad7c8, roughness: 0.7, metalness: 0.05 });

  const deformable = [];

  // ---- carroceria -----------------------------------------------------------
  const front = new THREE.Mesh(lowerSection(1), paint);
  const rear = new THREE.Mesh(lowerSection(-1), paint);
  front.name = 'carFront';
  rear.name = 'carRear';
  front.castShadow = true;
  front.receiveShadow = true;
  rear.castShadow = true;
  rear.receiveShadow = true;
  group.add(front, rear);
  deformable.push(front, rear);

  // caixa central (assoalho / interior) mais estreita que as portas
  const tubW = 1.34;
  const tub = new THREE.Mesh(
    extrudeProfile(
      [
        [-0.36, 0.26], [0.70, 0.26], [0.70, 0.885], [-0.36, 0.885],
      ],
      tubW,
      { bevel: 0.01 }
    ),
    interior
  );
  tub.receiveShadow = true;
  group.add(tub);

  // soleiras laterais
  for (const s of [-1, 1]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.13, 1.06), dark);
    sill.position.set(s * 0.80, 0.34, 0.17);
    sill.castShadow = true;
    group.add(sill);
  }

  // ---- cabine: teto, colunas, vidros ---------------------------------------
  // retângulo entre dois pontos do perfil (z,y), com a espessura na vertical
  const panelBetween = (z0, y0, z1, y1, width, thick, mat) => {
    const dz = z1 - z0;
    const dy = y1 - y0;
    const len = Math.hypot(dz, dy);
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, thick, len), mat);
    m.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    m.rotation.x = Math.atan2(-dy, dz);
    return m;
  };

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.08, 1.16), paint);
  roof.position.set(0, CAR_DIMS.roof - 0.04, -0.05);
  roof.castShadow = true;
  group.add(roof);

  const windshield = panelBetween(0.70, 0.92, 0.52, 1.40, 1.46, 0.03, glass);
  const rearWindow = panelBetween(-0.62, 1.40, -0.86, 0.95, 1.40, 0.03, glass);
  group.add(windshield, rearWindow);

  // vidros traseiros laterais (entre a coluna B e a C)
  for (const s of [-1, 1]) {
    const quarter = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.44, 0.24), glass);
    quarter.position.set(s * 0.695, 1.16, -0.48);
    group.add(quarter);
  }

  // colunas A, B e C dos dois lados
  for (const s of [-1, 1]) {
    const pillarA = panelBetween(0.70, 0.92, 0.52, 1.40, 0.10, 0.09, paint);
    pillarA.position.x = s * 0.71;
    const pillarC = panelBetween(-0.62, 1.40, -0.86, 0.95, 0.10, 0.09, paint);
    pillarC.position.x = s * 0.68;
    const pillarB = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.50, 0.12), paint);
    pillarB.position.set(s * 0.70, 1.16, -0.34);
    pillarA.castShadow = true;
    pillarC.castShadow = true;
    pillarB.castShadow = true;
    group.add(pillarA, pillarC, pillarB);
  }

  // ---- portas --------------------------------------------------------------
  const doors = {};
  for (const [key, sign] of [['left', 1], ['right', -1]]) {
    const hinge = new THREE.Group();
    hinge.position.set(sign * 0.885, 0.32, CAR_DIMS.doorHingeZ);
    hinge.name = 'door' + key;

    const panelH = 0.60;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.055, panelH, 1.04), paint);
    panel.position.set(0, panelH / 2, -0.53);
    panel.castShadow = true;
    panel.receiveShadow = true;
    hinge.add(panel);

    const win = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.86), glass);
    win.position.set(0, panelH + 0.21, -0.50);
    hinge.add(win);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.98), paint);
    frame.position.set(0, panelH + 0.42, -0.52);
    hinge.add(frame);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.16), chrome);
    handle.position.set(sign * 0.03, 0.50, -0.86);
    hinge.add(handle);

    group.add(hinge);
    doors[key] = hinge;
    deformable.push(panel);
  }

  // ---- detalhes: para-choques, faróis, lanternas, grade, placa ------------
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.22, 0.20), dark);
  bumperF.position.set(0, 0.40, 2.12);
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.22, 0.18), dark);
  bumperR.position.set(0, 0.40, -2.13);
  bumperF.castShadow = bumperR.castShadow = true;
  group.add(bumperF, bumperR);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.16, 0.06), dark);
  grille.position.set(0, 0.63, 2.16);
  group.add(grille);

  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.08), lightWhite);
    head.position.set(s * 0.62, 0.66, 2.14);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.12, 0.07), lightRed);
    tail.position.set(s * 0.64, 0.70, -2.17);
    group.add(head, tail);

    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.10), paint);
    mirror.position.set(s * 0.94, 0.99, 0.58);
    mirror.castShadow = true;
    group.add(mirror);
  }

  const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.03), plate);
  plateMesh.position.set(0, 0.42, -2.23);
  group.add(plateMesh);

  // ---- interior ------------------------------------------------------------
  for (const s of [-1, 1]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), interior);
    seat.position.set(s * 0.34, 0.56, -0.06);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.12), interior);
    back.position.set(s * 0.34, 0.80, -0.28);
    back.rotation.x = 0.16;
    group.add(seat, back);
  }
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.16, 0.26), interior);
  dash.position.set(0, 0.86, 0.56);
  group.add(dash);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.024, 8, 16), dark);
  wheel.position.set(0.34, 0.88, 0.44);
  wheel.rotation.x = -1.28;
  group.add(wheel);

  // ---- rodas ---------------------------------------------------------------
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(
    CAR_DIMS.wheelRadius, CAR_DIMS.wheelRadius, CAR_DIMS.wheelWidth, 22, 1
  );
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(
    CAR_DIMS.wheelRadius * 0.62, CAR_DIMS.wheelRadius * 0.62, CAR_DIMS.wheelWidth + 0.012, 18, 1
  );
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(CAR_DIMS.wheelWidth + 0.02, 0.30, 0.05);

  for (const [zi, z] of [[0, CAR_DIMS.wheelBase / 2], [1, -CAR_DIMS.wheelBase / 2]]) {
    for (const [si, x] of [[0, CAR_DIMS.track / 2], [1, -CAR_DIMS.track / 2]]) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, rubber);
      tire.castShadow = true;
      const disc = new THREE.Mesh(rimGeo, rim);
      for (let k = 0; k < 4; k++) {
        const spoke = new THREE.Mesh(spokeGeo, rim);
        spoke.rotation.x = (k / 4) * Math.PI;
        w.add(spoke);
      }
      w.add(tire, disc);
      w.position.set(x, CAR_DIMS.wheelRadius, z);
      w.name = `wheel${zi}${si}`;
      group.add(w);
      wheels.push({ group: w, front: zi === 0, radius: CAR_DIMS.wheelRadius, steering: 0, spin: 0 });
    }
  }

  group.traverse((o) => {
    if (o.isMesh && o.material === paint) o.castShadow = true;
  });

  return { group, doors, wheels, deformable, dims: CAR_DIMS };
}
