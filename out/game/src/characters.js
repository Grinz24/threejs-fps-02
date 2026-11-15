// The bodies on screen: a low-poly soldier per actor in the team's colours (Raiders in kiln
// orange with bandanas, Wardens in slate teal with helmets), legs that stride with speed, a
// crouch, a torso that follows the aim, the charge on the carrier's back, a fall on death and
// name tags over teammates. Reads actor state; never writes it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBatch, vertexColored } from './batch.js';
import { groundSpeed } from './movement.js';
import { RAIDERS } from './level.js';

const HIP = 0.9;
const CROUCH_HIP = 0.56;

function teamParts(team) {
  const raider = team === RAIDERS;
  const shirt = raider ? PALETTE.raider : PALETTE.warden;
  const pants = raider ? PALETTE.raiderDark : PALETTE.wardenDark;
  const leg = createBatch();
  leg.box(-0.09, -HIP, -0.1, 0.09, -0.12, 0.1, pants);
  leg.box(-0.1, -0.5, -0.12, 0.1, -0.38, 0.11, PALETTE.gear);
  leg.box(-0.1, -HIP, -0.16, 0.1, -HIP + 0.12, 0.11, PALETTE.gear);
  leg.box(-0.1, -0.12, -0.11, 0.1, 0, 0.11, pants);

  const torso = createBatch();
  torso.box(-0.22, 0, -0.13, 0.22, 0.58, 0.13, shirt);
  torso.box(-0.235, 0.12, -0.15, 0.235, 0.5, 0.15, raider ? PALETTE.gear : PALETTE.metal);
  torso.box(-0.15, 0.2, -0.19, -0.03, 0.34, -0.14, PALETTE.wood);
  torso.box(0.03, 0.2, -0.19, 0.15, 0.34, -0.14, PALETTE.wood);
  torso.box(-0.24, 0, -0.14, 0.24, 0.07, 0.14, PALETTE.gear);
  torso.box(-0.07, 0.58, -0.07, 0.07, 0.64, 0.07, PALETTE.skin);
  // Head and headgear.
  torso.box(-0.1, 0.64, -0.12, 0.1, 0.88, 0.1, PALETTE.skin);
  if (raider) {
    torso.box(-0.115, 0.8, -0.13, 0.115, 0.92, 0.115, PALETTE.raider);
    torso.box(-0.105, 0.72, -0.135, 0.105, 0.77, -0.11, PALETTE.gear);
    torso.box(-0.11, 0.64, -0.13, 0.11, 0.7, 0.11, PALETTE.raiderDark);
  } else {
    torso.box(-0.125, 0.79, -0.14, 0.125, 0.95, 0.125, PALETTE.wardenDark);
    torso.box(-0.13, 0.78, -0.16, 0.13, 0.81, 0.14, PALETTE.wardenDark);
    torso.box(-0.1, 0.71, -0.15, 0.1, 0.77, -0.12, PALETTE.metalLight);
  }
  // Arms brought forward to a two-handed hold, and the gun.
  torso.box(0.2, 0.32, -0.1, 0.3, 0.56, 0.08, shirt);
  torso.box(-0.3, 0.32, -0.1, -0.2, 0.56, 0.08, shirt);
  torso.box(0.14, 0.3, -0.42, 0.25, 0.4, -0.08, shirt);
  torso.box(-0.22, 0.32, -0.5, -0.1, 0.42, -0.08, shirt);
  torso.box(0.12, 0.28, -0.5, 0.24, 0.38, -0.4, PALETTE.gear);
  torso.box(-0.12, 0.33, -0.58, 0.02, 0.43, -0.48, PALETTE.gear);
  torso.box(0.03, 0.36, -0.95, 0.1, 0.44, -0.3, PALETTE.metal);
  torso.box(0.04, 0.3, -0.55, 0.09, 0.38, -0.42, PALETTE.metal);

  const material = vertexColored({ roughness: 0.8 });
  return { leg: leg.build(), torso: torso.build(), material };
}

function bombGeometry() {
  const b = createBatch();
  b.box(-0.14, 0.12, 0.13, 0.14, 0.42, 0.27, PALETTE.wood);
  b.box(-0.1, 0.18, 0.27, 0.1, 0.34, 0.3, PALETTE.gear);
  b.box(-0.03, 0.3, 0.28, 0.03, 0.33, 0.305, PALETTE.blood);
  return b.build();
}

function nameTag(name, team) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.font = '600 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(20,22,26,0.85)';
  g.strokeText(name, 128, 34);
  g.fillStyle = team === RAIDERS ? PALETTE.raider : PALETTE.warden;
  g.fillText(name, 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(1.1, 0.275, 1);
  sprite.position.y = 2.15;
  return sprite;
}

export function createCharacters(scene, sim) {
  const parts = [teamParts(0), teamParts(1)];
  const bomb = bombGeometry();
  const bombMaterial = vertexColored();
  const models = sim.actors.map((actor) => {
    const p = parts[actor.team];
    const root = new THREE.Group();
    const hips = new THREE.Group();
    const legL = new THREE.Mesh(p.leg, p.material);
    const legR = new THREE.Mesh(p.leg, p.material);
    legL.position.x = -0.11;
    legR.position.x = 0.11;
    const torso = new THREE.Mesh(p.torso, p.material);
    const pack = new THREE.Mesh(bomb, bombMaterial);
    torso.add(pack);
    hips.add(legL, legR, torso);
    root.add(hips);
    const tag = nameTag(actor.name, actor.team);
    root.add(tag);
    for (const mesh of [legL, legR, torso, pack]) mesh.castShadow = true;
    scene.add(root);
    return { actor, root, hips, legL, legR, torso, pack, tag, stride: 0, fall: 0 };
  });

  return {
    update(dt, viewer) {
      for (const m of models) {
        const a = m.actor;
        const b = a.body;
        const visible = a !== viewer;
        m.root.visible = visible;
        if (!visible) continue;
        m.root.position.set(b.x, b.y, b.z);
        m.root.rotation.y = b.yaw;
        m.pack.visible = a.hasBomb;
        m.tag.visible = a.alive && viewer !== null && a.team === viewer.team;
        if (!a.alive) {
          m.fall = Math.min(1, m.fall + dt * 3.2);
          const ease = 1 - (1 - m.fall) ** 3;
          m.root.rotation.x = ease * 1.45;
          m.root.position.y = b.y + ease * 0.16;
          m.hips.position.y = HIP;
          m.legL.rotation.x = 0.2;
          m.legR.rotation.x = -0.1;
          m.torso.rotation.x = 0;
          continue;
        }
        m.fall = 0;
        m.root.rotation.x = 0;
        const speed = groundSpeed(b);
        m.stride += dt * (2.2 + speed * 1.55);
        const swing = Math.sin(m.stride) * Math.min(1, speed / 4.5) * (b.onGround ? 0.62 : 0.15);
        m.hips.position.y = HIP + (CROUCH_HIP - HIP) * b.crouch + Math.abs(Math.cos(m.stride)) * Math.min(1, speed / 5) * 0.04;
        const knee = b.crouch * 0.75;
        m.legL.rotation.x = swing - knee;
        m.legR.rotation.x = -swing - knee;
        m.legL.scale.y = 1 - b.crouch * 0.18;
        m.legR.scale.y = 1 - b.crouch * 0.18;
        m.torso.rotation.x = Math.max(-0.5, Math.min(0.5, b.pitch * 0.55)) + b.crouch * 0.12;
      }
    },
  };
}
