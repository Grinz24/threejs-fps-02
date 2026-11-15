// Using weapons: switching, reloading, scoping, the trigger, spread and recoil, and the
// hitscan that settles a shot against the map and every body's hit volumes. Damage reads the
// zone it lands in (a head is worth four times a chest) and is softened by armour.
import { raycast } from './world.js';
import { RUN_SPEED, eyeHeight, groundSpeed } from './movement.js';
import { EV } from './events.js';
import { WEAPONS, SLOT_GRENADE, SLOT_BOMB, SLOT_KNIFE } from './weapons.js';
import { heldGun, equip, hitVolumes } from './actors.js';

const RANGE = 160;
const HEAD = 1;
const ZONE_MULTIPLIER = { legs: 0.75, stomach: 1.25, chest: 1, head: 4 };
const ARMOR_RATIO = 0.5;
const SHOT_NOISE = 46;
const PUNCH_RECOVER = 7.5;
const MAX_PUNCH = 0.22;

const worldHit = { nx: 0, ny: 0, nz: 0 };
const volume = { x: 0, z: 0, y0: 0, y1: 0, radius: 0, headX: 0, headY: 0, headZ: 0, headRadius: 0, height: 0 };
const trace = { actor: null, t: 0, head: false, y: 0 };
const ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };

// Where an actor is looking, recoil punch included: the camera and the bullets agree.
export function aimDirection(actor, out, yawOffset = 0, pitchOffset = 0) {
  const b = actor.body;
  const yaw = b.yaw + actor.punchYaw + yawOffset;
  const pitch = Math.max(-1.5, Math.min(1.5, b.pitch + actor.punchPitch + pitchOffset));
  out.ox = b.x;
  out.oy = b.y + eyeHeight(b);
  out.oz = b.z;
  out.dx = -Math.sin(yaw) * Math.cos(pitch);
  out.dy = Math.sin(pitch);
  out.dz = -Math.cos(yaw) * Math.cos(pitch);
  return out;
}

// The cone half-angle a shot leaves in, from the stance, the speed and the spray so far.
export function inaccuracy(actor) {
  const gun = heldGun(actor);
  if (!gun || gun.def.kind !== 'gun') return 0;
  const def = gun.def;
  const b = actor.body;
  const moving = Math.min(1, groundSpeed(b) / RUN_SPEED);
  let spread = def.scope && !actor.scoped ? def.unscoped : def.base;
  spread += def.move * moving * moving + actor.bloom;
  if (!b.onGround) spread += def.air;
  if (b.crouched && b.onGround) spread *= 0.78;
  return spread;
}

function rayCylinder(r, cx, cz, radius, y0, y1) {
  const ox = r.ox - cx;
  const oz = r.oz - cz;
  const a = r.dx * r.dx + r.dz * r.dz;
  if (a < 1e-9) return -1;
  const bb = ox * r.dx + oz * r.dz;
  const c = ox * ox + oz * oz - radius * radius;
  if (c < 0) return -1;
  const disc = bb * bb - a * c;
  if (disc < 0) return -1;
  const t = (-bb - Math.sqrt(disc)) / a;
  if (t < 0) return -1;
  const y = r.oy + r.dy * t;
  return y >= y0 && y <= y1 ? t : -1;
}

function raySphere(r, cx, cy, cz, radius) {
  const ox = r.ox - cx;
  const oy = r.oy - cy;
  const oz = r.oz - cz;
  const bb = ox * r.dx + oy * r.dy + oz * r.dz;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = bb * bb - c;
  if (disc < 0) return -1;
  const t = -bb - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}

// The nearest body along the ray before `limit`, written into `trace`.
function traceBodies(sim, shooter, r, limit) {
  trace.actor = null;
  trace.t = limit;
  for (const other of sim.actors) {
    if (other === shooter || !other.alive) continue;
    hitVolumes(other, volume);
    const dx = volume.x - r.ox;
    const dz = volume.z - r.oz;
    if (dx * r.dx + dz * r.dz < -1) continue;
    const head = raySphere(r, volume.headX, volume.headY, volume.headZ, volume.headRadius);
    if (head >= 0 && head < trace.t) {
      trace.actor = other;
      trace.t = head;
      trace.head = true;
    }
    const trunk = rayCylinder(r, volume.x, volume.z, volume.radius, volume.y0, volume.y1);
    if (trunk >= 0 && trunk < trace.t) {
      trace.actor = other;
      trace.t = trunk;
      trace.head = false;
      trace.y = (r.oy + r.dy * trunk - volume.y0) / volume.height;
    }
  }
  return trace.actor;
}

function zoneOf(head, frac) {
  if (head) return 'head';
  if (frac < 0.42) return 'legs';
  if (frac < 0.6) return 'stomach';
  return 'chest';
}

// Health damage after armour; armour soaks a share of anything but a leg shot, and a head
// shot only when a helmet is worn. Teammates block shots but take no damage from each other.
export function applyDamage(sim, victim, attacker, amount, zone, weaponId, pen) {
  if (!victim.alive || (attacker && attacker !== victim && attacker.team === victim.team)) return;
  let health = amount;
  const covered = victim.armor > 0 && zone !== 'legs' && (zone !== 'head' || victim.helmet);
  if (covered) {
    health = amount * pen;
    const soaked = (amount - health) * ARMOR_RATIO;
    victim.armor = Math.max(0, victim.armor - soaked);
  }
  health = Math.max(1, Math.round(health));
  victim.hp -= health;
  if (attacker) {
    victim.hurtFrom = Math.atan2(attacker.body.x - victim.body.x, attacker.body.z - victim.body.z);
    victim.hurtAge = 0;
    victim.lastAttacker = attacker;
  }
  const e = sim.events.emit(EV.HIT, attacker, victim.body.x, victim.body.y + 1.2, victim.body.z, health, zone === 'head' ? HEAD : 0);
  e.target = victim;
  e.weapon = weaponId;
  if (victim.hp <= 0) {
    victim.hp = 0;
    sim.kill(victim, attacker, weaponId, zone === 'head');
  }
}

function fireGun(sim, actor, gun) {
  const def = gun.def;
  gun.mag -= 1;
  actor.cooldown = def.rate;
  actor.sinceShot = 0;
  actor.noise = SHOT_NOISE;
  actor.noiseAge = 0;
  const spread = inaccuracy(actor);
  const rng = sim.rng;
  let endX = 0;
  let endY = 0;
  let endZ = 0;
  for (let p = 0; p < def.pellets; p += 1) {
    const angle = rng.next() * Math.PI * 2;
    const radius = spread * (def.pellets > 1 ? Math.sqrt(rng.next()) : rng.next());
    aimDirection(actor, ray, Math.cos(angle) * radius, Math.sin(angle) * radius);
    const wall = raycast(ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz, RANGE, worldHit);
    const victim = traceBodies(sim, actor, ray, wall);
    const t = victim ? trace.t : wall;
    endX = ray.ox + ray.dx * t;
    endY = ray.oy + ray.dy * t;
    endZ = ray.oz + ray.dz * t;
    if (victim) {
      const zone = zoneOf(trace.head, trace.y);
      const amount = def.damage * ZONE_MULTIPLIER[zone] * def.falloff ** (t / 10);
      applyDamage(sim, victim, actor, amount, zone, def.id, def.pen);
    } else if (wall < RANGE) {
      sim.events.emit(EV.IMPACT, actor, endX, endY, endZ, worldHit.nx, worldHit.ny, worldHit.nz);
    }
  }
  const shot = sim.events.emit(EV.SHOT, actor, ray.ox, ray.oy, ray.oz, endX, endY, endZ);
  shot.weapon = def.id;
  // Recoil climbs for the first shots of a spray, then sways side to side.
  actor.shots += 1;
  const climb = actor.shots <= 9 ? 1 : 0.3;
  const stance = actor.body.crouched ? 0.8 : 1;
  actor.punchPitch = Math.min(MAX_PUNCH, actor.punchPitch + def.kick * climb * stance);
  actor.punchYaw += (Math.sin(actor.shots * 0.62) * def.sway + (rng.next() - 0.5) * def.sway * 0.7) * stance;
  actor.bloom = Math.min(def.bloomMax, actor.bloom + def.bloom);
}

function swing(sim, actor) {
  const def = WEAPONS.knife;
  actor.cooldown = def.rate;
  actor.sinceShot = 0;
  aimDirection(actor, ray);
  const wall = raycast(ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz, def.reach, worldHit);
  sim.events.emit(EV.SWING, actor);
  // A blade is forgiving: test a little below the eye line as well.
  let victim = traceBodies(sim, actor, ray, wall);
  if (!victim) {
    ray.oy -= 0.35;
    victim = traceBodies(sim, actor, ray, wall);
  }
  if (!victim) return;
  const facing = Math.cos(victim.body.yaw - actor.body.yaw);
  const amount = facing > 0.55 ? def.damage * 3 : def.damage;
  applyDamage(sim, victim, actor, amount, 'chest', def.id, def.pen);
}

function startReload(sim, actor, gun) {
  if (gun.def.kind !== 'gun' || gun.mag >= gun.def.mag || gun.reserve <= 0 || actor.reloading > 0) return;
  actor.reloading = gun.def.reload;
  actor.scoped = false;
  sim.events.emit(EV.RELOAD, actor);
}

// One step of weapon handling for one actor, driven by its command.
export function stepArms(sim, actor, dt, canFire) {
  const cmd = actor.cmd;
  actor.cooldown = Math.max(0, actor.cooldown - dt);
  actor.switching = Math.max(0, actor.switching - dt);
  actor.sinceShot += dt;
  const recover = actor.sinceShot > 0.12 ? PUNCH_RECOVER : 1.2;
  const decay = Math.exp(-recover * dt);
  actor.punchPitch *= decay;
  actor.punchYaw *= decay;
  if (actor.sinceShot > 0.4) actor.shots = 0;

  if (cmd.select && equip(actor, cmd.select)) sim.events.emit(EV.EQUIP, actor);
  const gun = heldGun(actor);
  if (gun && gun.def.kind === 'gun') actor.bloom = Math.max(0, actor.bloom - gun.def.recover * dt);

  if (actor.reloading > 0) {
    actor.reloading = Math.max(0, actor.reloading - dt);
    if (actor.reloading === 0 && gun) {
      const take = Math.min(gun.def.mag - gun.mag, gun.reserve);
      gun.mag += take;
      gun.reserve -= take;
    }
    return;
  }
  if (actor.switching > 0) return;
  if (gun && cmd.reload) startReload(sim, actor, gun);
  if (gun && gun.def.scope && cmd.scope) actor.scoped = !actor.scoped;
  if (!canFire || actor.cooldown > 0 || actor.reloading > 0) return;

  if (actor.slot === SLOT_GRENADE) {
    if (cmd.firePressed) sim.grenades.throw(actor);
    return;
  }
  if (actor.slot === SLOT_BOMB || !gun) return;
  if (gun.def.kind === 'melee') {
    if (cmd.fire) swing(sim, actor);
    return;
  }
  const wants = gun.def.auto ? cmd.fire : cmd.firePressed;
  if (!wants) return;
  if (gun.mag > 0) fireGun(sim, actor, gun);
  else if (gun.reserve > 0) startReload(sim, actor, gun);
  else if (cmd.firePressed) {
    sim.events.emit(EV.DRY, actor);
    actor.cooldown = 0.25;
    if (actor.slot !== SLOT_KNIFE && actor.isBot) equip(actor, SLOT_KNIFE);
  }
}
