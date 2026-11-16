// Boot and the one loop: a fixed 60 Hz simulation and a render at the display's rate. Input
// becomes the player's command before each step; after the steps the frame's events fan out
// to effects, audio, the HUD and the view model, and the camera sits in the watched actor's
// eyes. ?shot=start|play|end&seed=N stages a deterministic capture instead (see shot.js).
import * as THREE from 'three';
import { buildMap } from './map.js';
import { createSim } from './sim.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createRadar } from './radar.js';
import { createBuyMenu } from './buymenu.js';
import { createCharacters } from './characters.js';
import { createEffects } from './effects.js';
import { createViewmodel } from './viewmodel.js';
import { createAudio } from './audio.js';
import { EV } from './events.js';
import { PHASE } from './round.js';
import { TEAMS } from './level.js';
import { clearLine } from './world.js';
import { eyeHeight } from './movement.js';
import { stage } from './shot.js';
import { WEAPONS } from './weapons.js';

const FIXED_STEP = 1 / 60;
const MAX_STEPS = 5;
const FOV = 78;
const SCOPED_FOV = 22;
const SENSITIVITY = 0.0022;
const SLOT_KEYS = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5 };
// A death in the player's eyes: the drop, the time spent on the ground, the pull-back to the body.
const COLLAPSE_TIME = 0.42;
const DOWN_TIME = 0.95;
const PULLBACK_TIME = 0.5;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '', 10) || 1 + Math.floor(Date.now() % 9973);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(shot ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.05, 900);
buildMap(scene);
const viewmodel = createViewmodel(camera.aspect);
const audio = createAudio();
const look = { x: 0, y: 0 };
const listener = { x: 0, z: 0, yaw: 0 };
// The presentation's own camera state: the firing shake, and who the camera was last in.
const shake = { pitch: 0, roll: 0, push: 0, side: 1 };
const view = { viewer: null, deadFor: 0, fallSide: 1, inEyes: true };
const poseFrom = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayCopy = document.getElementById('overlay-copy');
const teams = document.getElementById('teams');
const resume = document.getElementById('resume');

// One match: the simulation and everything drawn from it, rebuilt for a rematch.
let match = null;
let menuOpen = false;
let accumulator = 0;
let lastTime = performance.now();
let fov = FOV;

function createMatch(team, matchSeed) {
  if (match) scene.remove(match.root);
  const sim = createSim(matchSeed, team);
  const root = new THREE.Group();
  scene.add(root);
  match = {
    sim,
    root,
    characters: createCharacters(root, sim),
    effects: createEffects(root, sim),
    hud: createHud(sim),
    radar: createRadar(document.getElementById('radar'), sim),
    viewer: sim.player,
    over: false,
    diedAt: 0,
    armsVisible: false,
  };
  sim.startMatch();
  match.hud.show(true);
  return match;
}

const buyMenu = createBuyMenu((id) => {
  if (match) match.sim.player.cmd.buy = id;
});

function closeBuyMenu(relock) {
  if (!buyMenu.isOpen) return;
  buyMenu.close();
  menuOpen = false;
  if (relock) input.requestLock();
  else showOverlay('paused');
}

function onKey(code) {
  if (!match || match.over) return false;
  const player = match.sim.player;
  if (buyMenu.isOpen) {
    if (code === 'KeyB' || code === 'Escape') closeBuyMenu(true);
    else if (code.startsWith('Digit')) buyMenu.digit(Number(code.slice(5)));
    return true;
  }
  if (code === 'KeyB' && input.state.locked && match.sim.round.buyOpen(player)) {
    menuOpen = true;
    buyMenu.open(player);
    document.exitPointerLock();
    return true;
  }
  return false;
}

function showOverlay(mode) {
  overlay.hidden = false;
  const paused = mode === 'paused';
  teams.hidden = paused;
  resume.hidden = !paused;
  if (mode === 'paused') {
    overlayTitle.innerHTML = 'Paused';
    overlayCopy.textContent = 'The match waits for you. Click to resume.';
  } else if (mode === 'match') {
    const round = match.sim.round.state;
    const won = round.matchWinner === match.sim.player.team;
    overlayTitle.innerHTML = `${TEAMS[round.matchWinner]} <span>win</span>`;
    overlayCopy.textContent = `${won ? 'Victory' : 'Defeat'}, ${round.score[round.matchWinner]} to ${round.score[1 - round.matchWinner]}. You went ${match.sim.player.kills} and ${match.sim.player.deaths}. Pick a side to play again.`;
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    overlay.hidden = true;
    audio.unlock();
  } else if (!menuOpen && match && !match.over) {
    showOverlay('paused');
  }
}

const input = createInput(renderer.domElement, onLockChange, onKey);

teams.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-team]');
  if (!button) return;
  createMatch(Number(button.dataset.team), seed + (match ? match.sim.round.state.number * 7919 : 0));
  audio.unlock();
  input.requestLock();
});
resume.addEventListener('click', () => input.requestLock());

// The player's command from the keyboard and mouse, before each simulation step.
function readPlayer(player) {
  const keys = input.state.keys;
  const cmd = player.cmd;
  const live = input.state.locked;
  cmd.forward = live ? (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) : 0;
  cmd.strafe = live ? (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) : 0;
  cmd.walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
  cmd.crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  cmd.jump = keys.has('Space');
  cmd.fire = live && input.state.fire;
  cmd.use = keys.has('KeyE');
  if (!player.alive) return;
  if (input.took('Mouse0')) cmd.firePressed = true;
  if (input.took('Mouse2')) cmd.scope = true;
  if (input.took('KeyR')) cmd.reload = true;
  if (input.took('KeyG')) cmd.drop = true;
  if (input.took('KeyQ')) cmd.select = player.lastSlot;
  for (const code in SLOT_KEYS) if (input.took(code)) cmd.select = SLOT_KEYS[code];
}

// While dead, linger on the body a moment, then watch a living teammate; a click moves on.
function chooseViewer(now) {
  const { sim } = match;
  const player = sim.player;
  if (player.alive) {
    match.diedAt = 0;
    return player;
  }
  if (!match.diedAt) match.diedAt = now;
  if (now - match.diedAt < 1800) return player;
  const cycle = input.took('Mouse0');
  let viewer = match.viewer;
  if (viewer !== player && viewer.alive && !cycle) return viewer;
  const mates = sim.actors.filter((a) => a.alive && a.team === player.team);
  if (mates.length === 0) return player;
  const at = mates.indexOf(viewer);
  viewer = mates[(at + 1) % mates.length];
  return viewer;
}

// Firing shoves the camera a little on top of the aim punch the bullets follow. This is look
// only: it is added after the aim is placed and never feeds back into the simulation.
function kickCamera(weaponId) {
  const def = WEAPONS[weaponId];
  const k = Math.min(1, (def?.kick ?? 0.02) * 22 + 0.25);
  shake.side = -shake.side;
  shake.pitch = Math.min(0.035, shake.pitch + 0.012 * k);
  shake.roll = Math.max(-0.02, Math.min(0.02, shake.roll + 0.008 * k * shake.side));
  shake.push = Math.min(0.08, shake.push + 0.03 * k);
}

function eyePose(viewer) {
  const b = viewer.body;
  camera.position.set(b.x, b.y + eyeHeight(b), b.z);
  camera.rotation.set(b.pitch + viewer.punchPitch, b.yaw + viewer.punchYaw, 0, 'YXZ');
}

function orbitPose(b) {
  camera.position.set(b.x + Math.sin(b.yaw) * 2.6, b.y + 2.3, b.z + Math.cos(b.yaw) * 2.6);
  camera.lookAt(b.x, b.y + 0.3, b.z);
}

// A death topples the eyes over backwards the way the body falls (characters.js), rolling as
// they go, holds a beat on the ground, then pulls back to look at the body.
function deadPose(viewer) {
  const b = viewer.body;
  const fall = Math.min(1, view.deadFor / COLLAPSE_TIME);
  // Accelerating like a fall, with a small bounce as the head lands.
  const drop = fall * fall - Math.sin(Math.min(1, Math.max(0, (view.deadFor - COLLAPSE_TIME) / 0.18)) * Math.PI) * 0.05;
  const eye = eyeHeight(b);
  const arc = drop * 1.3;
  const back = Math.sin(arc) * eye;
  camera.position.set(b.x + Math.sin(b.yaw) * back, b.y + 0.22 + Math.cos(arc) * (eye - 0.22), b.z + Math.cos(b.yaw) * back);
  camera.rotation.set(b.pitch * (1 - drop) + 0.3 * drop, b.yaw, 0.5 * drop * view.fallSide, 'YXZ');
  const out = (view.deadFor - DOWN_TIME) / PULLBACK_TIME;
  if (out <= 0) return;
  const t = Math.min(1, out);
  const ease = t * t * (3 - 2 * t);
  poseFrom.position.copy(camera.position);
  poseFrom.quaternion.copy(camera.quaternion);
  orbitPose(b);
  camera.position.lerpVectors(poseFrom.position, camera.position, ease);
  camera.quaternion.slerpQuaternions(poseFrom.quaternion, camera.quaternion, ease);
}

function placeCamera(viewer, dt) {
  const b = viewer.body;
  if (viewer !== view.viewer || viewer.alive) {
    view.deadFor = 0;
    // Roll away from whoever did it.
    view.fallSide = Math.sin(viewer.hurtFrom - b.yaw) > 0 ? -1 : 1;
  } else view.deadFor += dt;
  view.viewer = viewer;
  if (viewer.alive) {
    eyePose(viewer);
    const zoom = fov / FOV;
    camera.rotation.x += shake.pitch * zoom;
    camera.rotation.z += shake.roll * zoom;
    camera.translateZ(shake.push);
  } else if (viewer === match.sim.player) deadPose(viewer);
  else orbitPose(b);
  // Until the pull-back starts the camera is still in the dead body's head.
  view.inEyes = viewer.alive || (viewer === match.sim.player && view.deadFor < DOWN_TIME + 0.2);
  const fade = Math.exp(-dt * 20);
  shake.pitch *= fade;
  shake.roll *= fade;
  shake.push *= fade;
  const target = viewer.alive && viewer.scoped ? SCOPED_FOV : FOV;
  fov += (target - fov) * Math.min(1, dt * 18);
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  listener.x = b.x;
  listener.z = b.z;
  listener.yaw = b.yaw;
}

// Whether the player has an enemy in view, for the radar.
function playerSees(enemy) {
  const p = match.sim.player;
  if (!p.alive) return false;
  const b = p.body;
  const dx = enemy.body.x - b.x;
  const dz = enemy.body.z - b.z;
  const d = Math.hypot(dx, dz);
  if ((dx * -Math.sin(b.yaw) + dz * -Math.cos(b.yaw)) / d < 0.6) return false;
  return clearLine(b.x, b.y + eyeHeight(b), b.z, enemy.body.x, enemy.body.y + 1.4, enemy.body.z);
}

function dispatch(e) {
  const viewer = match.viewer;
  match.effects.onEvent(e, viewer);
  match.hud.onEvent(e, viewer);
  audio.onEvent(e, listener, viewer);
  if (e.actor === viewer) {
    if (e.type === EV.SHOT) {
      viewmodel.fire();
      kickCamera(e.weapon);
    }
    else if (e.type === EV.SWING) viewmodel.swing();
    else if (e.type === EV.THROW) viewmodel.toss();
  }
  if (e.type === EV.BUY || e.type === EV.ROUND_START) buyMenu.refresh();
  if (e.type === EV.MATCH_END && !shot) {
    match.over = true;
    closeBuyMenu(false);
    if (document.pointerLockElement) document.exitPointerLock();
    showOverlay('match');
  }
}

// Everything but the render: effects, bodies, HUD, radar and the camera.
function tick(dt) {
  const viewer = match.viewer;
  match.effects.update(dt);
  match.characters.update(dt, view.inEyes ? viewer : null);
  match.hud.update(viewer, dt, fov);
  match.hud.toggleBoard(input.state.keys.has('Tab') || match.sim.round.state.phase === PHASE.MATCH, viewer);
  match.radar.update(viewer, dt, playerSees);
  placeCamera(viewer, dt);
  match.armsVisible = viewmodel.update(viewer, dt, camera);
}

// Before a match: a slow drift over the yard behind the menu.
function attract(now) {
  const t = now * 0.00003;
  camera.position.set(Math.sin(t) * 46, 34, Math.cos(t) * 40);
  camera.lookAt(0, 0, 0);
}

function draw(dt, now = 0) {
  const viewer = match ? match.viewer : null;
  if (match) tick(dt);
  else attract(now);
  renderer.clear();
  renderer.render(scene, camera);
  if (match && match.armsVisible) {
    renderer.clearDepth();
    renderer.render(viewmodel.scene, viewmodel.camera);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (match && !match.over && (input.state.locked || menuOpen)) {
    const { sim } = match;
    const player = sim.player;
    input.takeLook(look);
    if (player.alive) {
      const scale = SENSITIVITY * (player.scoped ? SCOPED_FOV / FOV : 1);
      player.body.yaw -= look.x * scale;
      player.body.pitch = Math.max(-1.5, Math.min(1.5, player.body.pitch - look.y * scale));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < MAX_STEPS) {
      readPlayer(player);
      sim.step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * MAX_STEPS) accumulator = 0;
    match.viewer = chooseViewer(now);
    sim.events.drain(dispatch);
    if (buyMenu.isOpen && !sim.round.buyOpen(player)) closeBuyMenu(false);
  } else {
    input.clearPresses();
  }
  draw(dt, now);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  viewmodel.resize(camera.aspect);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shot) {
  // A staged capture: find the moment headless, replay to it, then paint it twice and freeze.
  overlay.hidden = true;
  const advance = (dt) => {
    match.sim.step(dt);
    match.sim.events.drain(dispatch);
    tick(dt);
  };
  stage(shot, () => createMatch(-1, seed), advance, FIXED_STEP, (actor) => buyMenu.open(actor));
  let painted = 0;
  const paint = () => {
    draw(0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  draw(0);
  requestAnimationFrame(frame);
}
