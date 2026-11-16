// Everything the world shows beyond the map and the bodies: tracers, muzzle flashes, dust and
// bullet holes, blood, blasts, smoke clouds, grenades in flight and the charge on the ground.
// Every effect comes from a pool built up front; events start them and update() ages them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { EV } from './events.js';
import { createBatch, vertexColored } from './batch.js';
import { SMOKE_RADIUS, SMOKE_TIME, predictThrow } from './grenades.js';
import { SLOT_GRENADE } from './weapons.js';
import { surfaceAt } from './world.js';

const PUFFS_PER_SMOKE = 16;
// How each surface takes a bullet: the hole's shade, the dust it throws and how many sparks.
// Soft stuff (sand, plaster) puffs big and slow; wood splinters tight; metal barely dusts but sparks.
const SURFACES = {
  plaster: { hole: PALETTE.stoneShade, holeAlpha: 0.9, dust: PALETTE.plaster, dustAlpha: 0.8, life: 0.55, size: 0.7, spread: 0.8, sparks: 0 },
  stone: { hole: PALETTE.wood, holeAlpha: 0.85, dust: PALETTE.stoneCap, dustAlpha: 0.75, life: 0.5, size: 0.6, spread: 0.8, sparks: 0 },
  sand: { hole: PALETTE.sandDark, holeAlpha: 0.9, dust: PALETTE.sand, dustAlpha: 0.85, life: 0.65, size: 0.8, spread: 0.6, sparks: 0 },
  concrete: { hole: PALETTE.concreteDark, holeAlpha: 0.9, dust: PALETTE.concrete, dustAlpha: 0.8, life: 0.5, size: 0.6, spread: 0.8, sparks: 0 },
  wood: { hole: PALETTE.raiderDark, holeAlpha: 0.9, dust: PALETTE.woodLight, dustAlpha: 0.7, life: 0.35, size: 0.35, spread: 1.3, sparks: 0 },
  metal: { hole: PALETTE.gear, holeAlpha: 0.85, dust: PALETTE.metalLight, dustAlpha: 0.45, life: 0.25, size: 0.3, spread: 1, sparks: 4 },
};
// Long and thick enough to read as a streak, even in a still frame, without becoming a beam.
const TRACER_LIFE = 0.1;
const TRACER_WIDTH = 0.03;
// The grenade line-up aid: a dotted arc sampled from the real flight code, every few steps.
const ARC_STEP = 1 / 60;
const ARC_EVERY = 2;
const ARC_POINTS = 96;

function softTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A pool of sprites that grow and fade over their life.
function spritePool(scene, count, texture, blending, fog = true) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending, fog }));
    sprite.visible = false;
    scene.add(sprite);
    items.push({ sprite, life: 0, max: 1, size0: 0, size1: 0, alpha: 1, vx: 0, vy: 0, vz: 0 });
  }
  let next = 0;
  return {
    spawn(x, y, z, color, life, size0, size1, alpha, vx = 0, vy = 0, vz = 0) {
      const p = items[next];
      next = (next + 1) % count;
      p.sprite.position.set(x, y, z);
      p.sprite.material.color.set(color);
      p.sprite.material.rotation = (next * 2.399) % 6.283;
      p.sprite.visible = true;
      p.life = life;
      p.max = life;
      p.size0 = size0;
      p.size1 = size1;
      p.alpha = alpha;
      p.vx = vx;
      p.vy = vy;
      p.vz = vz;
    },
    update(dt) {
      for (const p of items) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.sprite.visible = false;
          continue;
        }
        const t = 1 - p.life / p.max;
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.y += p.vy * dt;
        p.sprite.position.z += p.vz * dt;
        p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * Math.sqrt(t));
        p.sprite.material.opacity = p.alpha * (1 - t) * (1 - t);
      }
    },
    clear() {
      for (const p of items) {
        p.life = 0;
        p.sprite.visible = false;
      }
    },
  };
}

export function createEffects(scene, sim) {
  const soft = softTexture();
  const dust = spritePool(scene, 48, soft, THREE.NormalBlending);
  const glow = spritePool(scene, 40, soft, THREE.AdditiveBlending, false);
  const blood = spritePool(scene, 24, soft, THREE.NormalBlending);

  // Tracers: thin additive bars stretched from muzzle to impact.
  const tracerGeometry = new THREE.BoxGeometry(TRACER_WIDTH, TRACER_WIDTH, 1).translate(0, 0, 0.5);
  const tracers = [];
  for (let i = 0; i < 24; i += 1) {
    const mesh = new THREE.Mesh(tracerGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.flash), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let nextTracer = 0;

  // Bullet holes: small dark squares laid on the surface they hit, in a darker shade of it.
  const holeGeometry = new THREE.PlaneGeometry(0.09, 0.09);
  const holeMaterials = {};
  for (const kind in SURFACES) {
    const { hole, holeAlpha } = SURFACES[kind];
    holeMaterials[kind] = new THREE.MeshBasicMaterial({ color: new THREE.Color(hole), transparent: true, opacity: holeAlpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  const holes = [];
  for (let i = 0; i < 96; i += 1) {
    const mesh = new THREE.Mesh(holeGeometry, holeMaterials.plaster);
    mesh.visible = false;
    scene.add(mesh);
    holes.push(mesh);
  }
  let nextHole = 0;

  // Blast light and smoke-cloud puffs.
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.flash), 0, 26, 1.4);
  scene.add(blastLight);
  let blastLife = 0;
  const clouds = sim.grenades.smokes.map((_, s) => {
    const puffs = [];
    for (let k = 0; k < PUFFS_PER_SMOKE; k += 1) {
      const tone = k % 3 === 0 ? PALETTE.concrete : k % 3 === 1 ? PALETTE.smoke : PALETTE.stoneCap;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: new THREE.Color(tone), transparent: true, depthWrite: false }));
      sprite.material.rotation = k * 1.3;
      sprite.visible = false;
      const a = k * 2.399 + s;
      const r = 0.35 + ((k * 7) % 10) / 10 * 0.6;
      puffs.push({ sprite, ox: Math.cos(a) * r, oy: ((k * 5) % 7) / 7 - 0.4, oz: Math.sin(a) * r });
      scene.add(sprite);
    }
    return puffs;
  });

  // Grenades in flight and the charge.
  const nadeGeometry = new THREE.BoxGeometry(0.09, 0.12, 0.09);
  const nadeMaterials = {
    frag: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.tealDark) }),
    flash: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metalLight) }),
    smoke: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concrete) }),
  };
  const nades = sim.grenades.list.map(() => {
    const mesh = new THREE.Mesh(nadeGeometry, nadeMaterials.frag);
    mesh.visible = false;
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  });
  const charge = createBatch();
  charge.box(-0.2, 0, -0.14, 0.2, 0.16, 0.14, PALETTE.wood);
  charge.box(-0.12, 0.16, -0.08, 0.12, 0.19, 0.08, PALETTE.gear);
  charge.box(-0.17, 0.02, 0.14, 0.17, 0.1, 0.16, PALETTE.terracotta);
  const bomb = new THREE.Mesh(charge.build(), vertexColored());
  bomb.castShadow = true;
  const bombLamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.blood) }));
  bombLamp.position.y = 0.2;
  bomb.add(bombLamp);
  const bombLight = new THREE.PointLight(new THREE.Color('#ff3b2f'), 0, 4, 2);
  bombLight.position.y = 0.4;
  bomb.add(bombLight);
  bomb.visible = false;
  scene.add(bomb);
  let blink = 0;

  // The player's own grenade arc: dots along the flight and a ring where it will pop.
  const arcPositions = new Float32Array(ARC_POINTS * 3);
  const arcGeometry = new THREE.BufferGeometry();
  arcGeometry.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
  const arc = new THREE.Points(arcGeometry, new THREE.PointsMaterial({ map: soft, color: new THREE.Color(PALETTE.lamp), size: 0.32, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  arc.frustumCulled = false;
  arc.visible = false;
  scene.add(arc);
  const landing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
  landing.visible = false;
  scene.add(landing);

  function aimArc(viewer) {
    const show = viewer !== null && viewer === sim.player && viewer.alive && viewer.slot === SLOT_GRENADE
      && viewer.switching === 0 && viewer.nades[viewer.nade] > 0;
    arc.visible = show;
    landing.visible = show;
    if (!show) return;
    const n = predictThrow(viewer, arcPositions, ARC_STEP, ARC_EVERY);
    // Skip the first dots, which would sit in the thrower's face.
    arcGeometry.setDrawRange(3, Math.max(0, n - 3));
    arcGeometry.attributes.position.needsUpdate = true;
    const last = (n - 1) * 3;
    landing.position.set(arcPositions[last], arcPositions[last + 1] + 0.03, arcPositions[last + 2]);
  }

  function tracer(x0, y0, z0, x1, y1, z1) {
    const t = tracers[nextTracer];
    nextTracer = (nextTracer + 1) % tracers.length;
    // Start the streak a little ahead of the eye so it reads as leaving the barrel.
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1.2) return;
    const skip = 0.9 / length;
    t.mesh.position.set(x0 + dx * skip, y0 + dy * skip - 0.12, z0 + dz * skip);
    t.mesh.lookAt(x1, y1, z1);
    t.mesh.scale.z = length * (1 - skip);
    t.mesh.material.opacity = 0.75;
    t.mesh.visible = true;
    t.life = TRACER_LIFE;
  }

  function hole(e, kind) {
    const mesh = holes[nextHole];
    nextHole = (nextHole + 1) % holes.length;
    mesh.material = holeMaterials[kind];
    mesh.position.set(e.x + e.a * 0.01, e.y + e.b * 0.01, e.z + e.c * 0.01);
    mesh.lookAt(e.x + e.a, e.y + e.b, e.z + e.c);
    mesh.visible = true;
  }

  // What flies off the surface: a puff in its own colour, and on metal a spray of sparks.
  function impact(e, kind) {
    const s = SURFACES[kind];
    // A stable per-impact pick, so the look never draws from the simulation's RNG.
    const roll = Math.abs(e.x * 13 + e.y * 5 + e.z * 7) % 3;
    dust.spawn(e.x, e.y, e.z, s.dust, s.life, 0.1, s.size, s.dustAlpha, e.a * s.spread, 0.4 + e.b * 0.6, e.c * s.spread);
    if (s.sparks === 0) {
      if (roll < 1) glow.spawn(e.x, e.y, e.z, PALETTE.flash, 0.05, 0.08, 0.16, 1);
      return;
    }
    glow.spawn(e.x, e.y, e.z, '#ffffff', 0.06, 0.12, 0.3, 1);
    for (let k = 0; k < s.sparks; k += 1) {
      // Fan the sparks off the normal, each a different way round it.
      const a = roll * 2.1 + k * 2.4;
      const vx = e.a * 3 + Math.cos(a) * 2.2;
      const vz = e.c * 3 + Math.sin(a) * 2.2;
      glow.spawn(e.x, e.y, e.z, k % 2 ? PALETTE.flash : PALETTE.lamp, 0.12 + k * 0.03, 0.06, 0.03, 1, vx, 1.2 + e.b * 2 + k * 0.4, vz);
    }
  }

  function blast(e) {
    const kind = e.weapon;
    if (kind === 'smoke') {
      for (let k = 0; k < 6; k += 1) dust.spawn(e.x, e.y + 0.3, e.z, PALETTE.smoke, 1.2, 0.4, 2.4, 0.7, Math.cos(k) * 1.4, 0.8, Math.sin(k) * 1.4);
      return;
    }
    const big = kind === 'bomb';
    blastLight.position.set(e.x, e.y + 1, e.z);
    blastLight.intensity = big ? 220 : kind === 'flash' ? 120 : 70;
    blastLife = big ? 0.5 : 0.18;
    glow.spawn(e.x, e.y + 0.4, e.z, kind === 'flash' ? '#ffffff' : PALETTE.flash, big ? 0.9 : 0.3, 0.5, big ? 16 : kind === 'flash' ? 5 : 5.5, 1);
    if (kind === 'flash') return;
    const count = big ? 14 : 8;
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2;
      const s = big ? 5 : 2.6;
      dust.spawn(e.x, e.y + 0.5, e.z, k % 2 ? PALETTE.concreteDark : PALETTE.sandDark, big ? 2.6 : 1.4, 0.8, big ? 7 : 3.4, 0.85, Math.cos(a) * s, 1.4 + (k % 3), Math.sin(a) * s);
    }
  }

  return {
    // viewer: the actor the camera is in, whose own muzzle flash the view model draws.
    onEvent(e, viewer) {
      if (e.type === EV.SHOT) {
        tracer(e.x, e.y, e.z, e.a, e.b, e.c);
        if (e.actor !== viewer) {
          const b = e.actor.body;
          glow.spawn(e.x - Math.sin(b.yaw) * 0.85, e.y - 0.28, e.z - Math.cos(b.yaw) * 0.85, PALETTE.flash, 0.06, 0.35, 0.55, 1);
        }
      } else if (e.type === EV.IMPACT) {
        const kind = surfaceAt(e.x, e.y, e.z, e.a, e.b, e.c);
        hole(e, kind);
        impact(e, kind);
      } else if (e.type === EV.HIT) {
        const b = e.target.body;
        const y = e.b === 1 ? b.y + 1.6 - b.crouch * 0.4 : b.y + 1.15 - b.crouch * 0.35;
        blood.spawn(b.x, y, b.z, PALETTE.blood, 0.4, 0.15, e.b === 1 ? 0.9 : 0.6, 0.9, 0, 0.3, 0);
      } else if (e.type === EV.BLAST) {
        blast(e);
      } else if (e.type === EV.EXPLODED) {
        e.weapon = 'bomb';
        blast(e);
      } else if (e.type === EV.BEEP) {
        blink = 0.12;
      } else if (e.type === EV.ROUND_START) {
        for (const mesh of holes) mesh.visible = false;
        dust.clear();
        blood.clear();
      }
    },

    // viewer: the actor the camera is in, for the grenade arc.
    update(dt, viewer = null) {
      aimArc(viewer);
      dust.update(dt);
      glow.update(dt);
      blood.update(dt);
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / TRACER_LIFE) * 0.75;
        if (t.life <= 0) t.mesh.visible = false;
      }
      blastLife = Math.max(0, blastLife - dt);
      blastLight.intensity *= blastLife > 0 ? 0.86 : 0;

      const flying = sim.grenades.list;
      for (let i = 0; i < flying.length; i += 1) {
        const g = flying[i];
        const mesh = nades[i];
        mesh.visible = g.active;
        if (!g.active) continue;
        mesh.material = nadeMaterials[g.kind];
        mesh.position.set(g.x, g.y, g.z);
        mesh.rotation.set(g.spin, g.spin * 0.7, 0);
      }
      const smokes = sim.grenades.smokes;
      for (let i = 0; i < smokes.length; i += 1) {
        const s = smokes[i];
        const r = SMOKE_RADIUS * Math.min(1, s.age / 2.5);
        const fade = Math.min(1, (SMOKE_TIME - s.age) / 2.5);
        for (const p of clouds[i]) {
          p.sprite.visible = s.active;
          if (!s.active) continue;
          p.sprite.position.set(s.x + p.ox * r, s.y + p.oy * r * 0.8, s.z + p.oz * r);
          p.sprite.scale.setScalar(1 + r * 1.05);
          p.sprite.material.opacity = 0.78 * fade;
        }
      }

      const state = sim.round.state.bomb;
      bomb.visible = state.state === 'dropped' || state.state === 'planted';
      blink = Math.max(0, blink - dt);
      if (bomb.visible) {
        bomb.position.set(state.x, state.y, state.z);
        const lit = state.state === 'planted' && blink > 0;
        bombLamp.visible = lit;
        bombLight.intensity = lit ? 6 : 0;
      }
    },
  };
}
