// Ponto de entrada: monta o mundo, o personagem e o laço principal.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import { HUD } from './ui/hud.js';
import { Input } from './core/input.js';
import { AudioEngine } from './audio/audio.js';
import { clamp, dampAngle, lerp } from './core/math.js';
import {
  makeGrassTextures,
  makeRoofTexture,
  makeWoodTexture,
  makePlasterTexture,
  makeStoneTexture,
  makeBarkTexture,
} from './world/textures.js';
import { Terrain } from './world/terrain.js';
import { Sky } from './world/sky.js';
import { Village } from './world/houses.js';
import { Scenery } from './world/props.js';
import { GrassField } from './world/grass.js';
import { Character } from './character/character.js';
import { PlayerController, PHYS_DT, TUNING } from './character/controller.js';
import { ThirdPersonCamera } from './camera/thirdPerson.js';
import { Car, CAR_TUNING } from './vehicle/car.js';

const hud = new HUD();
const audio = new AudioEngine();
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const isSmall = Math.min(window.innerWidth, window.innerHeight) < 720;

const MODELS = {
  avatar: '/models/avatar.glb',
  motion: '/models/motion_source.glb',
};

const state = {
  started: false,
  paused: true,
  quality: 2,
  averageFps: 60,
  everStarted: false,
};

// foot | entering | driving | exiting
const vehicle = { mode: 'foot', active: null, timer: 0, near: null };

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function showError(err) {
  const msg = err && (err.stack || err.message) ? err.stack || err.message : String(err);
  console.error(err);
  hud.showError(msg);
}

window.addEventListener('error', (e) => showError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

async function boot() {
  // ---- renderer -----------------------------------------------------------
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isSmall,
    powerPreference: 'high-performance',
    stencil: false,
  });
  const maxDpr = isTouch ? 1.7 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 6000);
  camera.position.set(0, 3.2, -6);

  hud.setProgress(0.04, 'iniciando a física…');
  await RAPIER.init();

  // ---- texturas -----------------------------------------------------------
  hud.setProgress(0.1, 'pintando as texturas do campo…');
  await nextFrame();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures = {
    grass: makeGrassTextures({ size: 512, anisotropy }),
    roof: makeRoofTexture('#8f4433'),
    wood: makeWoodTexture('#6b4a30'),
    plaster: makePlasterTexture('#efe9dc'),
    stone: makeStoneTexture('#8f877a'),
    bark: makeBarkTexture('#5d4834'),
  };

  // ---- mundo --------------------------------------------------------------
  const world = new RAPIER.World({ x: 0, y: -TUNING.gravity, z: 0 });
  world.timestep = PHYS_DT;

  hud.setProgress(0.2, 'esculpindo morros e o campo…');
  await nextFrame();
  const terrain = new Terrain({ scene, world, RAPIER, anisotropy, textures });

  hud.setProgress(0.38, 'acendendo o sol…');
  await nextFrame();
  const sky = new Sky({
    scene,
    sunAzimuth: 52,
    sunElevation: 26,
    shadowMapSize: isTouch ? 1024 : 2048,
    shadows: true,
  });

  hud.setProgress(0.48, 'construindo as casas…');
  await nextFrame();
  const village = new Village({
    scene, world, RAPIER, terrain, textures,
    count: 13, anisotropy,
  });
  const occupied = village.houses.map((h) => ({ x: h.x, z: h.z, r: h.radius + 2.5 }));

  hud.setProgress(0.58, 'plantando árvores, pedras e cercas…');
  await nextFrame();
  const scenery = new Scenery({
    scene, world, RAPIER, terrain, textures, occupied, anisotropy,
  });

  hud.setProgress(0.7, 'semeando a grama…');
  await nextFrame();
  const grass = new GrassField({
    scene, terrain,
    count: isTouch ? 5200 : 10000,
    radius: isTouch ? 26 : 34,
    anisotropy,
  });

  hud.setProgress(0.74, 'estacionando os carros…');
  await nextFrame();
  const eventQueue = new RAPIER.EventQueue(true);
  const carSpots = [
    { x: 7.5, z: 4.5, yaw: -1.15, color: '#b6412f' },
    { x: -10.5, z: 8.0, yaw: 2.1, color: '#2f5d8c' },
    { x: 13.0, z: -8.5, yaw: 0.55, color: '#c9b13f' },
  ];
  const cars = carSpots.map((spot, i) => new Car({
    scene, world, RAPIER, terrain, eventQueue,
    position: { x: spot.x, y: terrain.heightAt(spot.x, spot.z), z: spot.z },
    yaw: spot.yaw,
    color: spot.color,
    name: 'carro ' + (i + 1),
  }));
  for (const c of cars) {
    c.onImpact = ({ force }) => {
      audio.crash(force / 9000);
      cam.addShake(Math.min(0.55, force / 260000));
    };
    c.onDeath = () => {
      audio.explosion();
      hud.toast('o motor fundiu — o carro pegou fogo', 3200);
    };
  }

  hud.setProgress(0.78, 'carregando o personagem…');
  const { avatar, motion } = await Character.load({
    avatarUrl: MODELS.avatar,
    motionUrl: MODELS.motion,
    onProgress: (p) => hud.setProgress(0.76 + p * 0.12, 'carregando o personagem…'),
  });

  hud.setProgress(0.9, 'ajustando a animação e a física do personagem…');
  await nextFrame();
  const character = new Character({ avatar, motion, scene });

  const controller = new PlayerController({
    RAPIER, world, terrain, spawn: { x: 0, z: -2 },
  });
  controller.yaw = 0;

  const cam = new ThirdPersonCamera({
    camera, world, RAPIER, terrain, playerCollider: controller.collider,
  });
  cam.yaw = Math.PI; // começa olhando o personagem de frente
  cam.pitch = 0.14;
  cam.desiredDistance = isTouch ? 4.6 : 4.0;

  character.footstepCallback = (info) => {
    audio.footstep(info);
  };

  // ---- entrada ------------------------------------------------------------
  const input = new Input({
    domElement: canvas,
    onPointerLockChange: (locked) => {
      if (!locked && state.everStarted && !state.paused && !input.dragLook && !isTouch) {
        pauseGame();
      }
    },
    onAction: (code) => {
      if (code === 'KeyH') hud.toggleHelp();
      if (code === 'KeyM') {
        audio.setEnabled(!audio.enabled);
        hud.toast(audio.enabled ? 'som ligado' : 'som desligado', 1400);
      }
      if (code === 'KeyE') {
        if (vehicle.mode === 'foot' && vehicle.near) enterVehicle(vehicle.near);
        else if (vehicle.mode === 'driving') exitVehicle();
      }
      if (code === 'KeyR') {
        if (vehicle.mode === 'driving' && vehicle.active) {
          vehicle.active.respawn();
          hud.toast('carro de volta ao lugar', 1600);
        } else {
          controller.respawn(0, -2);
          hud.toast('voltando ao centro do vale', 1600);
        }
      }
      if (code === 'Escape' && state.everStarted && !state.paused) {
        pauseGame();
      }
    },
  });
  input.dragLook = isTouch;
  if (isTouch) {
    input.touch.active = true;
    hud.setTouchMode(true);
    bindTouchControls(input);
  }

  const carGround = new THREE.Vector3();
  const carQuat = new THREE.Quaternion();
  const carEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  function carYawOf(c) {
    const r = c.body.rotation();
    carQuat.set(r.x, r.y, r.z, r.w);
    return carEuler.setFromQuaternion(carQuat, 'YXZ').y;
  }

  function enterVehicle(c) {
    if (!c || vehicle.mode !== 'foot') return;
    const t = c.body.translation();
    if (Math.hypot(t.x - controller.position.x, t.z - controller.position.z) > 4.2) return;
    vehicle.mode = 'entering';
    vehicle.active = c;
    vehicle.timer = 0.58;
    vehicle.near = null;
    c.openDoor('left', true);
    hud.setCarPrompt(null);
  }

  function finishEnter() {
    const c = vehicle.active;
    if (!c) { vehicle.mode = 'foot'; return; }
    c.openDoor('left', false);
    vehicle.mode = 'driving';
    character.root.visible = false;
    if (controller.collider?.setEnabled) controller.collider.setEnabled(false);
    controller.velocity.set(0, 0, 0);
    cam.height = 1.12;
    cam.shoulder = 0;
    cam.desiredDistance = 7.4;
    cam.baseFov = 66;
    cam.yaw = carYawOf(c);
    audio.startEngine();
    hud.setDriving(true);
    hud.toast('W/S acelera e freia · A/D dirige · Espaço freio de mão', 3400);
  }

  function exitVehicle() {
    const c = vehicle.active;
    if (!c || vehicle.mode !== 'driving') return;
    if (c.speedKmh > 22) {
      hud.toast('pare o carro para descer', 1500);
      return;
    }
    vehicle.mode = 'exiting';
    vehicle.timer = 0.5;
    c.openDoor('left', true);
    audio.stopEngine();
  }

  function finishExit() {
    const c = vehicle.active;
    if (!c) { vehicle.mode = 'foot'; return; }
    const p = c.exitPosition();
    controller.respawn(p.x, p.z);
    controller.yaw = carYawOf(c) + Math.PI * 0.5;
    if (controller.collider?.setEnabled) controller.collider.setEnabled(true);
    character.root.visible = true;
    cam.height = 1.42;
    cam.shoulder = 0.42;
    cam.desiredDistance = 4.0;
    cam.baseFov = 62;
    vehicle.mode = 'foot';
    vehicle.active = null;
    c.openDoor('left', false);
    hud.setDriving(false);
  }

  function nearestCar() {
    let best = null;
    let bestD = 3.4;
    for (const c of cars) {
      const t = c.body.translation();
      const d = Math.hypot(t.x - controller.position.x, t.z - controller.position.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function startGame() {
    if (!state.everStarted) {
      state.everStarted = true;
      hud.hideStart();
      hud.showGame();
      hud.toggleHelp(false);
    }
    hud.hidePause();
    state.started = true;
    state.paused = false;
    audio.init();
    audio.resume();
    if (!isTouch) {
      try {
        input.requestPointerLock();
      } catch (e) { /* alguns navegadores bloqueiam; cai no arrastar */ }
      window.setTimeout(() => {
        if (!input.pointerLocked) {
          input.dragLook = true;
          hud.toast('arraste com o mouse para olhar ao redor', 3600);
        }
      }, 400);
    }
  }

  function pauseGame() {
    if (!state.everStarted || state.paused) return;
    state.paused = true;
    hud.showPause();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  document.getElementById('play')?.addEventListener('click', startGame);
  document.getElementById('resume')?.addEventListener('click', startGame);
  document.getElementById('pause')?.addEventListener('click', (e) => {
    if (e.target.id === 'pause') startGame();
  });
  document.getElementById('start')?.addEventListener('click', (e) => {
    if (e.target.id === 'start') startGame();
  });

  // ---- laço ---------------------------------------------------------------
  const prevFeet = new THREE.Vector3();
  const curFeet = new THREE.Vector3();
  const feetPos = new THREE.Vector3();
  let prevYaw = controller.yaw;
  let yawRender = controller.yaw;
  let accumulator = 0;
  let time = 0;
  let orbit = Math.PI;
  let turnLean = 0;
  let last = performance.now();
  let fpsTimer = 0;
  let fpsFrames = 0;
  let qualityCooldown = 0;
  let lowFpsTime = 0;
  let statusTimer = 0;

  function currentFeet(out) {
    return out.set(
      controller.position.x,
      controller.position.y - controller.halfHeight - controller.radius,
      controller.position.z
    );
  }

  currentFeet(prevFeet);
  currentFeet(curFeet);

  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = clamp(rawDt, 0.0002, 0.05);
    time += dt;

    // fps médio
    fpsTimer += rawDt;
    fpsFrames++;
    if (fpsTimer > 0.5) {
      const fps = fpsFrames / fpsTimer;
      state.averageFps = state.averageFps * 0.5 + fps * 0.5;
      hud.setFps(state.averageFps);
      fpsTimer = 0;
      fpsFrames = 0;
    }

    const inp = input.poll();
    if (inp.lookDx || inp.lookDy) cam.look(inp.lookDx, inp.lookDy);
    if (inp.wheel) cam.zoom(inp.wheel);

    prevFeet.copy(curFeet);
    prevYaw = controller.yaw;
    const active = state.everStarted && !state.paused;

    const driving = vehicle.mode === 'driving' && vehicle.active;
    const activeCar = vehicle.mode === 'driving' || vehicle.mode === 'entering' || vehicle.mode === 'exiting'
      ? vehicle.active : null;

    if (active) {
      if (vehicle.mode === 'entering' || vehicle.mode === 'exiting') {
        vehicle.timer -= dt;
        if (vehicle.timer <= 0) {
          if (vehicle.mode === 'entering') finishEnter();
          else finishExit();
        }
      }

      accumulator += dt;
      let steps = 0;
      while (accumulator >= PHYS_DT && steps < 6) {
        if (vehicle.mode === 'foot') {
          controller.step(PHYS_DT, {
            moveX: inp.moveX,
            moveZ: inp.moveZ,
            run: inp.run,
            crouch: inp.crouch,
            jumpPressed: steps === 0 ? inp.jumpPressed : false,
            jumpHeld: inp.jumpHeld,
            cameraYaw: cam.yaw,
          });
        }
        for (const c of cars) {
          if (driving && c === activeCar) {
            c.update(PHYS_DT, {
              throttle: inp.moveZ,
              steer: -inp.moveX,
              brake: 0,
              handbrake: inp.jumpHeld,
            });
          } else {
            c.update(PHYS_DT, {});
          }
        }
        world.step(eventQueue);
        for (const c of cars) c.handleContactEvents(eventQueue);
        accumulator -= PHYS_DT;
        steps++;
      }
      if (steps === 6) accumulator = 0;
      for (const c of cars) c.syncVisual();

      if (controller.justLanded) {
        audio.land(controller.justLanded.impact);
        cam.addShake(controller.justLanded.impact * 0.7);
        controller.justLanded = null;
      }
      if (controller.justJumped) {
        audio.jump();
        controller.justJumped = false;
      }
    } else {
      accumulator = 0;
      if (!state.everStarted) {
        orbit += dt * 0.18;
        cam.yaw = orbit;
        cam.pitch = 0.16;
      }
      for (const c of cars) c.syncVisual();
    }

    currentFeet(curFeet);
    const alpha = active ? clamp(accumulator / PHYS_DT, 0, 1) : 1;
    feetPos.lerpVectors(prevFeet, curFeet, alpha);
    const yawDelta = dampAngle(prevYaw, controller.yaw, 1000, 1);
    yawRender = prevYaw + yawDelta * alpha;
    turnLean = lerp(turnLean, clamp(yawDelta / Math.max(dt, 0.001) * 0.22, -1, 1), 1 - Math.exp(-6 * dt));

    if (!driving) {
      character.update(dt, {
        position: feetPos,
        yaw: yawRender,
        speed: vehicle.mode === 'foot' ? controller.speed : 0,
        grounded: controller.grounded,
        vy: controller.velocity.y,
        crouchAmount: controller.crouchAmount,
        landingImpact: controller.landingImpact,
        terrain,
        groundNormal: controller.groundNormal,
        cameraYaw: cam.yaw,
        cameraPitch: cam.pitch,
        turnLean,
      });
    }

    // alvo da câmera: personagem a pé ou o carro
    let camFeet = feetPos;
    let camYawTarget = yawRender;
    let camSpeed = controller.speed;
    let camPhase = character.phase ?? 0;
    if (driving) {
      const t = activeCar.body.translation();
      carGround.set(t.x, t.y, t.z);
      camFeet = carGround;
      camYawTarget = carYawOf(activeCar);
      camSpeed = Math.abs(activeCar.forwardSpeed);
      camPhase = 0;
    }

    cam.playerCollider = driving ? activeCar.collider : controller.collider;
    cam.update(dt, {
      feetPos: camFeet,
      yaw: camYawTarget,
      speed: camSpeed,
      grounded: driving ? true : controller.grounded,
      landingImpact: 0,
      phase: camPhase,
    });

    grass.update(time, camFeet);
    sky.update(dt, camera, camFeet, time);
    if (driving) {
      const rpm = Math.min(1, 0.14 + (camSpeed / CAR_TUNING.maxSpeed) * 0.86);
      if (activeCar.dead) {
        if (!activeCar.engineSilenced) {
          activeCar.engineSilenced = true;
          audio.stopEngine();
        }
      } else {
        audio.setEngine(rpm, Math.abs(inp.moveZ));
      }
      audio.update(0);
    } else {
      audio.update(camSpeed);
    }

    // ---- HUD --------------------------------------------------------------
    statusTimer += dt;
    if (statusTimer > 0.25) {
      statusTimer = 0;
      if (driving) {
        hud.setStamina(controller.stamina, false);
        hud.setCarPrompt(null);
        hud.setSpeed(activeCar.speedKmh, activeCar.health, activeCar.dead);
        hud.setStatus(activeCar.dead ? 'motor fundido' : activeCar.health < 0.5 ? 'carro avariado' : 'dirigindo');
      } else {
        hud.setDriving(false);
        const showStamina = controller.stamina < 0.995 || (inp.run && controller.speed > TUNING.walkSpeed * 1.1);
        hud.setStamina(controller.stamina, showStamina);
        let status = 'parado';
        if (!controller.grounded) status = 'no ar';
        else if (controller.crouching) status = controller.speed > 0.3 ? 'andando agachado' : 'agachado';
        else if (controller.speed > TUNING.walkSpeed * 1.15) status = 'correndo';
        else if (controller.speed > 0.4) status = 'andando';
        hud.setStatus(status);
        if (vehicle.mode === 'foot' && state.everStarted) {
          vehicle.near = nearestCar();
          hud.setCarPrompt(vehicle.near ? 'entrar no carro' : null);
        }
      }
      if (input.touch.active) updateKnob(input);
    }

    // ---- qualidade adaptativa --------------------------------------------
    qualityCooldown -= dt;
    if (state.averageFps < 42) lowFpsTime += dt;
    else lowFpsTime = Math.max(0, lowFpsTime - dt * 0.5);

    if (lowFpsTime > 2.5 && qualityCooldown <= 0) {
      lowFpsTime = 0;
      qualityCooldown = 3;
      if (state.quality === 2) {
        state.quality = 1;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        grass.setVisible(false);
      } else if (state.quality === 1) {
        state.quality = 0;
        renderer.shadowMap.enabled = false;
        sky.setShadows(false);
        renderer.setPixelRatio(1);
        hud.toast('modo de desempenho ativado', 2000);
      }
    }

    renderer.render(scene, camera);
  }

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  }
  window.addEventListener('resize', onResize);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  // primeiro frame (compila shaders antes de liberar o jogo)
  hud.setProgress(0.97, 'compilando o cenário…');
  await nextFrame();
  renderer.compile(scene, camera);
  hud.setProgress(1, 'pronto');
  window.setTimeout(() => {
    hud.loadingDone();
    hud.showStart();
  }, 180);

  input.dragLook = isTouch;
  last = performance.now();
  requestAnimationFrame(frame);

  // expõe para depuração no console
  window.__game = { scene, camera, renderer, terrain, controller, character, grass, sky, world, state, cars, vehicle };
}

function bindTouchControls(input) {
  const btnJump = document.getElementById('btnJump');
  const btnRun = document.getElementById('btnRun');
  const btnCrouch = document.getElementById('btnCrouch');
  btnJump?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    input.jumpPressed = true;
    input.jumpHeld = true;
  });
  btnJump?.addEventListener('touchend', () => { input.jumpHeld = false; });
  btnJump?.addEventListener('mousedown', () => { input.jumpPressed = true; input.jumpHeld = true; });
  btnJump?.addEventListener('mouseup', () => { input.jumpHeld = false; });
  btnRun?.addEventListener('click', () => {
    input.run = !input.run;
    btnRun.style.background = input.run ? 'rgba(200,224,138,0.35)' : 'rgba(10,14,16,0.55)';
  });
  btnCrouch?.addEventListener('click', () => {
    input.crouch = !input.crouch;
    btnCrouch.style.background = input.crouch ? 'rgba(200,224,138,0.35)' : 'rgba(10,14,16,0.55)';
  });
}

function updateKnob(input) {
  const knob = document.getElementById('knob');
  if (!knob) return;
  const v = input.touch.moveValue;
  knob.style.transform = `translate(${v.x * 38}px, ${v.y * 38}px)`;
}

boot().catch(showError);
