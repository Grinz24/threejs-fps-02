// The first-person hands and weapon, drawn in their own scene after the world's depth is
// cleared so they never sink into a wall. Each weapon is a low-poly model with arms in the
// player's team colours; the rig bobs with the stride, sways with the look, kicks on a shot,
// dips for a reload, rises on a draw and swings or throws on cue.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBatch, vertexColored } from './batch.js';
import { groundSpeed, RUN_SPEED } from './movement.js';
import { heldId, heldGun } from './actors.js';
import { RAIDERS } from './level.js';
import { WEAPONS } from './weapons.js';
import { SUN_DIRECTION } from './map.js';

const REST = new THREE.Vector3(0.2, -0.2, -0.6);

// Arms reach from below the frame to the two hands: a glove, a forearm and an elbow stepping
// down out of view.
function arms(b, sleeve, right, left) {
  b.box(right[0] - 0.032, right[1] - 0.05, right[2] - 0.02, right[0] + 0.032, right[1] + 0.02, right[2] + 0.05, PALETTE.gear);
  b.box(right[0] - 0.04, right[1] - 0.1, right[2] + 0.05, right[0] + 0.04, right[1] - 0.02, right[2] + 0.2, sleeve);
  b.box(right[0] - 0.045, right[1] - 0.2, right[2] + 0.18, right[0] + 0.045, right[1] - 0.08, right[2] + 0.3, sleeve);
  if (!left) return;
  b.box(left[0] - 0.032, left[1] - 0.05, left[2] - 0.035, left[0] + 0.032, left[1] + 0.012, left[2] + 0.035, PALETTE.gear);
  b.box(left[0] - 0.09, left[1] - 0.09, left[2] + 0.02, left[0] - 0.01, left[1] - 0.02, left[2] + 0.2, sleeve);
  b.box(left[0] - 0.13, left[1] - 0.2, left[2] + 0.16, left[0] - 0.04, left[1] - 0.08, left[2] + 0.3, sleeve);
}

function buildModel(id, sleeve) {
  const b = createBatch();
  let muzzle = -0.5;
  let lift = 0;
  const metal = PALETTE.metal;
  const dark = PALETTE.gear;
  switch (WEAPONS[id]?.model ?? id) {
    case 'rifle':
      b.box(-0.032, -0.03, -0.26, 0.032, 0.05, 0.12, metal);
      b.box(-0.036, -0.035, -0.5, 0.036, 0.03, -0.26, PALETTE.wood);
      b.box(-0.012, 0.0, -0.74, 0.012, 0.022, -0.5, dark);
      b.box(-0.018, 0.035, -0.46, 0.018, 0.06, -0.42, dark);
      b.box(-0.028, -0.16, -0.17, 0.028, -0.03, -0.09, dark);
      b.box(-0.028, -0.21, -0.15, 0.028, -0.15, -0.06, dark);
      b.box(-0.026, -0.12, 0.02, 0.026, -0.03, 0.08, PALETTE.wood);
      b.box(-0.03, -0.06, 0.12, 0.03, 0.04, 0.34, PALETTE.wood);
      arms(b, sleeve, [0, -0.08, 0.04], [0, -0.05, -0.38]);
      muzzle = -0.76;
      break;
    case 'smg':
      b.box(-0.032, -0.03, -0.24, 0.032, 0.05, 0.1, PALETTE.metalLight);
      b.box(-0.014, 0.0, -0.4, 0.014, 0.026, -0.24, dark);
      b.box(-0.022, -0.2, -0.13, 0.022, -0.03, -0.08, dark);
      b.box(-0.025, -0.12, 0.0, 0.025, -0.03, 0.06, dark);
      b.box(-0.012, -0.02, 0.1, 0.012, 0.02, 0.3, metal);
      arms(b, sleeve, [0, -0.08, 0.03], [0, -0.05, -0.26]);
      muzzle = -0.42;
      break;
    case 'shotgun':
      b.box(-0.034, -0.035, -0.2, 0.034, 0.05, 0.1, metal);
      b.box(-0.016, 0.005, -0.78, 0.016, 0.037, -0.2, dark);
      b.box(-0.02, -0.04, -0.72, 0.02, -0.005, -0.2, dark);
      b.box(-0.034, -0.05, -0.5, 0.034, 0.0, -0.34, PALETTE.wood);
      b.box(-0.028, -0.12, 0.02, 0.028, -0.03, 0.08, PALETTE.wood);
      b.box(-0.03, -0.07, 0.1, 0.03, 0.03, 0.34, PALETTE.wood);
      arms(b, sleeve, [0, -0.08, 0.04], [0, -0.07, -0.42]);
      muzzle = -0.8;
      break;
    case 'sniper':
      b.box(-0.034, -0.035, -0.3, 0.034, 0.045, 0.14, PALETTE.tealDark);
      b.box(-0.013, 0.0, -0.92, 0.013, 0.024, -0.3, dark);
      b.box(-0.03, 0.06, -0.24, 0.03, 0.11, 0.02, dark);
      b.box(-0.036, 0.055, -0.3, 0.036, 0.115, -0.24, metal);
      b.box(-0.01, 0.045, -0.1, 0.01, 0.06, -0.06, metal);
      b.box(-0.024, -0.12, -0.1, 0.024, -0.035, -0.04, dark);
      b.box(-0.026, -0.12, 0.04, 0.026, -0.03, 0.1, PALETTE.tealDark);
      b.box(-0.032, -0.07, 0.14, 0.032, 0.05, 0.38, PALETTE.tealDark);
      arms(b, sleeve, [0, -0.08, 0.06], [0, -0.05, -0.4]);
      muzzle = -0.94;
      break;
    case 'pistol':
      b.box(-0.022, 0.0, -0.2, 0.022, 0.05, 0.02, id === 'hammer' ? PALETTE.metalLight : metal);
      b.box(-0.02, -0.12, -0.03, 0.02, 0.0, 0.03, dark);
      b.box(-0.006, 0.05, -0.19, 0.006, 0.062, -0.17, dark);
      arms(b, sleeve, [0, -0.08, 0.02], [-0.02, -0.1, 0.0]);
      muzzle = -0.22;
      lift = 0.06;
      break;
    case 'knife':
      b.box(-0.012, -0.03, -0.26, 0.012, 0.02, -0.04, PALETTE.metalLight);
      b.box(-0.004, 0.02, -0.24, 0.004, 0.03, -0.06, PALETTE.stoneCap);
      b.box(-0.022, -0.04, -0.05, 0.022, 0.03, 0.08, PALETTE.wood);
      arms(b, sleeve, [0, -0.02, 0.04]);
      lift = 0.04;
      break;
    case 'bomb':
      b.box(-0.1, -0.09, -0.2, 0.1, 0.06, 0.02, PALETTE.wood);
      b.box(-0.06, 0.06, -0.15, 0.06, 0.075, -0.05, dark);
      b.box(-0.04, 0.075, -0.13, 0.04, 0.08, -0.08, PALETTE.blood);
      arms(b, sleeve, [0.1, -0.06, -0.02], [-0.1, -0.06, -0.02]);
      lift = 0.05;
      break;
    default: {
      const tone = id === 'frag' ? PALETTE.tealDark : id === 'flash' ? PALETTE.metalLight : PALETTE.concrete;
      b.box(-0.035, -0.06, -0.1, 0.035, 0.05, -0.03, tone);
      b.box(-0.015, 0.05, -0.08, 0.015, 0.08, -0.05, PALETTE.metal);
      b.box(0.015, -0.02, -0.08, 0.025, 0.07, -0.06, PALETTE.metal);
      arms(b, sleeve, [0, -0.06, 0.0]);
      lift = 0.06;
    }
  }
  return { geometry: b.build(), muzzle, lift };
}

function flashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.35, 'rgba(255,200,110,0.9)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let k = 0; k < 16; k += 1) {
    const r = k % 2 === 0 ? 31 : 12;
    const a = (k / 16) * Math.PI * 2;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createViewmodel(aspect) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, aspect, 0.01, 5);
  scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.skyHorizon), new THREE.Color(PALETTE.sandDark), 1.5));
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.sun), 2.2);
  scene.add(sun);
  const rig = new THREE.Group();
  scene.add(rig);
  const material = vertexColored({ roughness: 0.6, metalness: 0.15 });
  const cache = new Map();
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.flash), 0, 3, 2);
  rig.add(flashLight);
  let mesh = null;
  let current = '';
  let team = -1;
  const inverse = new THREE.Quaternion();
  const state = { kick: 0, flash: 0, swing: 0, toss: 0, bob: 0, swayX: 0, swayY: 0, lastYaw: 0, lastPitch: 0 };

  function show(id, actorTeam) {
    if (id === current && actorTeam === team) return;
    current = id;
    team = actorTeam;
    const key = `${id}:${actorTeam}`;
    if (!cache.has(key)) {
      const built = buildModel(id, actorTeam === RAIDERS ? PALETTE.raider : PALETTE.warden);
      const model = new THREE.Mesh(built.geometry, material);
      model.position.set(-built.lift * 0.5, built.lift, -built.lift);
      cache.set(key, { mesh: model, muzzle: built.muzzle });
    }
    if (mesh) rig.remove(mesh);
    const entry = cache.get(key);
    mesh = entry.mesh;
    rig.add(mesh);
    mesh.add(flash);
    flash.position.set(0, 0.012, entry.muzzle - 0.05);
    flashLight.position.set(0, 0.02, entry.muzzle);
  }

  return {
    scene,
    camera,
    fire() {
      state.kick = 1;
      state.flash = 0.05;
    },
    swing() {
      state.swing = 1;
    },
    toss() {
      state.toss = 1;
    },
    resize(nextAspect) {
      camera.aspect = nextAspect;
      camera.updateProjectionMatrix();
    },
    // Pose the rig for the actor being watched; returns false when nothing should be drawn.
    update(actor, dt, worldCamera) {
      if (!actor || !actor.alive || actor.scoped) return false;
      show(heldId(actor), actor.team);
      sun.position.copy(SUN_DIRECTION).applyQuaternion(inverse.copy(worldCamera.quaternion).invert());
      const b = actor.body;
      const speed = b.onGround ? groundSpeed(b) / RUN_SPEED : 0;
      state.bob += dt * (4 + speed * 7);
      const bobX = Math.sin(state.bob) * 0.012 * speed;
      const bobY = -Math.abs(Math.cos(state.bob)) * 0.014 * speed;
      // Lag the look a little so the gun sways.
      const dyaw = Math.atan2(Math.sin(b.yaw - state.lastYaw), Math.cos(b.yaw - state.lastYaw));
      const dpitch = b.pitch - state.lastPitch;
      state.lastYaw = b.yaw;
      state.lastPitch = b.pitch;
      const ease = Math.min(1, dt * 10);
      state.swayX += (Math.max(-0.05, Math.min(0.05, dyaw * 0.6)) - state.swayX) * ease;
      state.swayY += (Math.max(-0.05, Math.min(0.05, -dpitch * 0.6)) - state.swayY) * ease;
      state.kick = Math.max(0, state.kick - dt * 9);
      state.flash = Math.max(0, state.flash - dt);
      state.swing = Math.max(0, state.swing - dt * 3.2);
      state.toss = Math.max(0, state.toss - dt * 2.6);

      const gun = heldGun(actor);
      const reloadTime = gun && gun.def.kind === 'gun' ? gun.def.reload : 1;
      const reload = actor.reloading > 0 ? Math.sin((1 - actor.reloading / reloadTime) * Math.PI) : 0;
      const draw = actor.switching / 0.45;
      const kickScale = gun && gun.def.kind === 'gun' ? Math.min(1.6, gun.def.kick * 40 + 0.4) : 0;
      rig.position.set(
        REST.x + bobX + state.swayX - state.swing * 0.08,
        REST.y + bobY + state.swayY - reload * 0.12 - draw * 0.25 - b.crouch * 0.01 + state.toss * 0.05,
        REST.z + state.kick * 0.045 * kickScale - state.swing * 0.12,
      );
      rig.rotation.set(
        state.kick * 0.09 * kickScale - reload * 0.5 - draw * 0.6 + state.toss * 0.9,
        state.swing * 0.9,
        reload * 0.45 + state.swing * -0.6,
      );
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 90;
      flash.scale.setScalar(0.8 + state.flash * 8);
      flashLight.intensity = state.flash > 0 ? 3 : 0;
      return true;
    },
  };
}
