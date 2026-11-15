// Thrown grenades: a fixed pool of projectiles that arc, bounce off the map and pop on their
// fuse. A frag hurts everyone it can see within its radius, a flash blinds whoever is looking
// at it and a smoke grows a cloud that blocks sight lines (bots read smokeBlocks).
import { raycast, clearLine } from './world.js';
import { eyeHeight } from './movement.js';
import { EV } from './events.js';
import { GRENADES } from './weapons.js';
import { aimDirection, applyDamage } from './combat.js';
import { equipBest, hitVolumes } from './actors.js';

const POOL = 16;
const SMOKES = 8;
const GRAVITY = 17;
const THROW_SPEED = 15.5;
const RADIUS = 0.08;
const RESTITUTION = 0.42;
const FRAG_RADIUS = 9;
const FRAG_DAMAGE = 98;
const FLASH_RANGE = 34;
export const SMOKE_RADIUS = 3.9;
export const SMOKE_TIME = 17;

const hit = { nx: 0, ny: 0, nz: 0 };
const aim = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
const volume = { x: 0, z: 0, y0: 0, y1: 0, radius: 0, headX: 0, headY: 0, headZ: 0, headRadius: 0, height: 0 };

export function createGrenades(sim) {
  const list = [];
  for (let i = 0; i < POOL; i += 1) list.push({ active: false, kind: 'frag', owner: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, spin: 0 });
  const smokes = [];
  for (let i = 0; i < SMOKES; i += 1) smokes.push({ active: false, x: 0, y: 0, z: 0, age: 0 });

  function throwFrom(actor) {
    const kind = actor.nade;
    if (actor.nades[kind] <= 0) return;
    const g = list.find((item) => !item.active);
    if (!g) return;
    actor.nades[kind] -= 1;
    actor.cooldown = 0.6;
    aimDirection(actor, aim, 0, 0.08);
    const b = actor.body;
    Object.assign(g, {
      active: true, kind, owner: actor, fuse: GRENADES[kind].fuse, spin: 0,
      x: aim.ox + aim.dx * 0.4, y: aim.oy - 0.1, z: aim.oz + aim.dz * 0.4,
      vx: aim.dx * THROW_SPEED + b.vx * 0.6, vy: aim.dy * THROW_SPEED + 1.6 + b.vy * 0.4, vz: aim.dz * THROW_SPEED + b.vz * 0.6,
    });
    const e = sim.events.emit(EV.THROW, actor, g.x, g.y, g.z);
    e.weapon = kind;
    equipBest(actor);
  }

  function frag(g) {
    for (const actor of sim.actors) {
      if (!actor.alive) continue;
      hitVolumes(actor, volume);
      const cy = (volume.y0 + volume.headY) / 2;
      const d = Math.hypot(volume.x - g.x, cy - g.y, volume.z - g.z);
      if (d > FRAG_RADIUS || !clearLine(g.x, g.y + 0.2, g.z, volume.x, cy, volume.z)) continue;
      const falloff = 1 - d / FRAG_RADIUS;
      applyDamage(sim, actor, g.owner, FRAG_DAMAGE * falloff * falloff + 4, 'chest', 'frag', 0.6);
    }
  }

  function flash(g) {
    for (const actor of sim.actors) {
      if (!actor.alive) continue;
      const b = actor.body;
      const ey = b.y + eyeHeight(b);
      const dx = g.x - b.x;
      const dy = g.y - ey;
      const dz = g.z - b.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > FLASH_RANGE || !clearLine(b.x, ey, b.z, g.x, g.y + 0.1, g.z) || blocked(b.x, ey, b.z, g.x, g.y, g.z)) continue;
      aimDirection(actor, aim);
      const facing = (aim.dx * dx + aim.dy * dy + aim.dz * dz) / Math.max(d, 0.01);
      const strength = (facing > 0.35 ? 1 : facing > -0.2 ? 0.45 : 0.15) * (1 - (d / FLASH_RANGE) ** 2);
      actor.blind = Math.max(actor.blind, strength * 4.6);
    }
  }

  function pop(g) {
    g.active = false;
    const e = sim.events.emit(EV.BLAST, g.owner, g.x, g.y, g.z);
    e.weapon = g.kind;
    if (g.kind === 'frag') frag(g);
    else if (g.kind === 'flash') flash(g);
    else {
      const cloud = smokes.find((s) => !s.active) ?? smokes[0];
      Object.assign(cloud, { active: true, x: g.x, y: g.y + 1.2, z: g.z, age: 0 });
    }
    if (g.owner) {
      g.owner.noise = 30;
      g.owner.noiseAge = 0;
    }
  }

  function move(g, dt) {
    g.vy -= GRAVITY * dt;
    const speed = Math.hypot(g.vx, g.vy, g.vz);
    if (speed < 1e-4) return;
    const dist = speed * dt;
    const dx = g.vx / speed;
    const dy = g.vy / speed;
    const dz = g.vz / speed;
    const t = raycast(g.x, g.y, g.z, dx, dy, dz, dist + RADIUS, hit);
    if (t >= dist + RADIUS) {
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;
      return;
    }
    const travel = Math.max(0, t - RADIUS);
    g.x += dx * travel;
    g.y += dy * travel;
    g.z += dz * travel;
    const into = g.vx * hit.nx + g.vy * hit.ny + g.vz * hit.nz;
    g.vx = (g.vx - 2 * into * hit.nx) * RESTITUTION;
    g.vy = (g.vy - 2 * into * hit.ny) * RESTITUTION;
    g.vz = (g.vz - 2 * into * hit.nz) * RESTITUTION;
    if (hit.ny > 0.5 && Math.abs(g.vy) < 1.2) {
      g.vy = 0;
      g.vx *= 0.8;
      g.vz *= 0.8;
    }
    if (speed > 2.5) sim.events.emit(EV.BOUNCE, g.owner, g.x, g.y, g.z);
  }

  // Does any live smoke cloud cut the segment between two points?
  function blocked(ax, ay, az, bx, by, bz) {
    const sx = bx - ax;
    const sy = by - ay;
    const sz = bz - az;
    const length2 = sx * sx + sy * sy + sz * sz;
    for (const s of smokes) {
      if (!s.active || s.age < 0.8) continue;
      const t = length2 > 0 ? Math.max(0, Math.min(1, ((s.x - ax) * sx + (s.y - ay) * sy + (s.z - az) * sz) / length2)) : 0;
      const px = ax + sx * t - s.x;
      const py = ay + sy * t - s.y;
      const pz = az + sz * t - s.z;
      const r = SMOKE_RADIUS * Math.min(1, s.age / 2.5);
      if (px * px + py * py * 0.6 + pz * pz < r * r) return true;
    }
    return false;
  }

  return {
    list,
    smokes,
    throw: throwFrom,
    blocked,
    step(dt) {
      for (const g of list) {
        if (!g.active) continue;
        move(g, dt);
        g.spin += dt * 12;
        g.fuse -= dt;
        const resting = g.vx * g.vx + g.vy * g.vy + g.vz * g.vz < 0.3;
        if (g.fuse <= 0 && (g.kind !== 'smoke' || resting || g.fuse < -2)) pop(g);
      }
      for (const s of smokes) {
        if (!s.active) continue;
        s.age += dt;
        if (s.age > SMOKE_TIME) s.active = false;
      }
    },
    clear() {
      for (const g of list) g.active = false;
      for (const s of smokes) s.active = false;
    },
  };
}
