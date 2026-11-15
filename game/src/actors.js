// Everyone in the match, the player and the bots alike: a body, a command the controller fills
// each step, health and armour, money, and the inventory (two guns, the blade, grenades and
// maybe the charge). The player and a bot differ only in who writes `cmd`.
import { createBody, placeBody, STAND_HEIGHT, CROUCH_HEIGHT } from './movement.js';
import {
  WEAPONS, GRENADES, GEAR, GRENADE_ORDER, createGun,
  SLOT_PRIMARY, SLOT_SECONDARY, SLOT_KNIFE, SLOT_GRENADE, SLOT_BOMB,
} from './weapons.js';

export const START_MONEY = 800;
export const MAX_MONEY = 16000;
const SWITCH_TIME = 0.45;

export function createCmd() {
  return { forward: 0, strafe: 0, walk: false, crouch: false, jump: false, fire: false, firePressed: false, scope: false, reload: false, use: false, select: 0 };
}

export function clearCmd(cmd) {
  cmd.forward = 0;
  cmd.strafe = 0;
  cmd.walk = false;
  cmd.crouch = false;
  cmd.jump = false;
  cmd.fire = false;
  cmd.firePressed = false;
  cmd.scope = false;
  cmd.reload = false;
  cmd.use = false;
  cmd.select = 0;
}

export function createActor(id, team, name, isBot) {
  return {
    id, team, name, isBot,
    body: createBody(),
    cmd: createCmd(),
    alive: false,
    hp: 100,
    armor: 0,
    helmet: false,
    kit: false,
    money: START_MONEY,
    primary: null,
    secondary: null,
    knife: createGun('knife'),
    nades: { frag: 0, smoke: 0, flash: 0 },
    hasBomb: false,
    slot: SLOT_SECONDARY,
    lastSlot: SLOT_KNIFE,
    nade: 'frag',
    // Weapon handling state.
    cooldown: 0,
    reloading: 0,
    switching: 0,
    bloom: 0,
    shots: 0,
    sinceShot: 1,
    punchPitch: 0,
    punchYaw: 0,
    scoped: false,
    // Status and bookkeeping.
    blind: 0,
    noise: 0,
    noiseAge: 9,
    stride: 0,
    hurtFrom: 0,
    hurtAge: 9,
    using: 0,
    kills: 0,
    deaths: 0,
    roundKills: 0,
    brain: null,
  };
}

// Back to a spawn for a new round. The survivors of the last round keep their kit.
export function respawn(actor, x, z, yaw) {
  if (!actor.alive) {
    actor.primary = null;
    actor.secondary = createGun('kestrel');
    actor.armor = 0;
    actor.helmet = false;
    actor.kit = false;
    actor.nades.frag = 0;
    actor.nades.smoke = 0;
    actor.nades.flash = 0;
  }
  for (const gun of [actor.primary, actor.secondary]) {
    if (gun) {
      gun.mag = gun.def.mag;
      gun.reserve = gun.def.reserve;
    }
  }
  placeBody(actor.body, x, z, yaw);
  actor.alive = true;
  actor.hp = 100;
  actor.hasBomb = false;
  actor.cooldown = 0;
  actor.reloading = 0;
  actor.switching = 0;
  actor.bloom = 0;
  actor.shots = 0;
  actor.punchPitch = 0;
  actor.punchYaw = 0;
  actor.scoped = false;
  actor.blind = 0;
  actor.noise = 0;
  actor.hurtAge = 9;
  actor.using = 0;
  actor.roundKills = 0;
  actor.slot = actor.primary ? SLOT_PRIMARY : SLOT_SECONDARY;
  actor.lastSlot = SLOT_KNIFE;
}

export function gunInSlot(actor, slot) {
  if (slot === SLOT_PRIMARY) return actor.primary;
  if (slot === SLOT_SECONDARY) return actor.secondary;
  if (slot === SLOT_KNIFE) return actor.knife;
  return null;
}

export const heldGun = (actor) => gunInSlot(actor, actor.slot);

export function grenadeCount(actor) {
  return actor.nades.frag + actor.nades.smoke + actor.nades.flash;
}

function hasSlot(actor, slot) {
  if (slot === SLOT_GRENADE) return grenadeCount(actor) > 0;
  if (slot === SLOT_BOMB) return actor.hasBomb;
  return gunInSlot(actor, slot) !== null;
}

// The id the view model and the HUD show for what is in hand.
export function heldId(actor) {
  if (actor.slot === SLOT_GRENADE) return actor.nade;
  if (actor.slot === SLOT_BOMB) return 'bomb';
  return heldGun(actor).def.id;
}

// Take out a slot; pressing the grenade slot again cycles through the grenades carried.
export function equip(actor, slot) {
  if (!hasSlot(actor, slot)) return false;
  if (slot === actor.slot && slot !== SLOT_GRENADE) return false;
  if (slot === SLOT_GRENADE) {
    const start = actor.slot === SLOT_GRENADE ? GRENADE_ORDER.indexOf(actor.nade) + 1 : 0;
    for (let k = 0; k < GRENADE_ORDER.length; k += 1) {
      const kind = GRENADE_ORDER[(start + k) % GRENADE_ORDER.length];
      if (actor.nades[kind] > 0) {
        actor.nade = kind;
        break;
      }
    }
  }
  if (slot !== actor.slot) actor.lastSlot = actor.slot;
  actor.slot = slot;
  actor.switching = SWITCH_TIME;
  actor.reloading = 0;
  actor.scoped = false;
  actor.shots = 0;
  return true;
}

// Take out one particular grenade; true while that needs a switch.
export function equipGrenade(actor, kind) {
  if (actor.nades[kind] === 0 || (actor.slot === SLOT_GRENADE && actor.nade === kind)) return false;
  if (actor.slot !== SLOT_GRENADE) equip(actor, SLOT_GRENADE);
  actor.nade = kind;
  return true;
}

// After a grenade leaves the hand or the charge is planted, fall back to the best gun.
export function equipBest(actor) {
  if (actor.slot === SLOT_GRENADE && actor.nades[actor.nade] > 0) return;
  actor.slot = 0;
  if (!equip(actor, SLOT_PRIMARY) && !equip(actor, SLOT_SECONDARY)) equip(actor, SLOT_KNIFE);
}

// Whether a purchase is possible right now, and why not.
export function canBuy(actor, id) {
  const price = (WEAPONS[id] ?? GRENADES[id] ?? GEAR[id]).price;
  if (actor.money < price) return 'money';
  if (WEAPONS[id]) {
    const held = WEAPONS[id].slot === SLOT_PRIMARY ? actor.primary : actor.secondary;
    if (held && held.def.id === id) return 'owned';
  } else if (GRENADES[id]) {
    if (actor.nades[id] >= GRENADES[id].max || grenadeCount(actor) >= 4) return 'full';
  } else if (id === 'vest') {
    if (actor.armor >= 100) return 'owned';
  } else if (id === 'helmet') {
    if (actor.armor >= 100 && actor.helmet) return 'owned';
  } else if (id === 'kit') {
    if (actor.team !== 1) return 'team';
    if (actor.kit) return 'owned';
  }
  return '';
}

export function buy(actor, id) {
  if (canBuy(actor, id) !== '') return false;
  let price = (WEAPONS[id] ?? GRENADES[id] ?? GEAR[id]).price;
  if (WEAPONS[id]) {
    const gun = createGun(id);
    if (gun.def.slot === SLOT_PRIMARY) actor.primary = gun;
    else actor.secondary = gun;
    actor.slot = 0;
    equip(actor, gun.def.slot);
  } else if (GRENADES[id]) {
    actor.nades[id] += 1;
  } else if (id === 'vest') {
    actor.armor = 100;
  } else if (id === 'helmet') {
    if (actor.armor >= 100) price = 350;
    actor.armor = 100;
    actor.helmet = true;
  } else if (id === 'kit') {
    actor.kit = true;
  }
  actor.money -= price;
  return true;
}

export function earn(actor, amount) {
  actor.money = Math.max(0, Math.min(MAX_MONEY, actor.money + amount));
}

// The hit volumes for a body: a vertical cylinder for the trunk and legs and a sphere for the
// head. Writes into `box` so a trace never allocates.
export function hitVolumes(actor, box) {
  const b = actor.body;
  const height = STAND_HEIGHT + (CROUCH_HEIGHT - STAND_HEIGHT) * b.crouch;
  box.x = b.x;
  box.z = b.z;
  box.y0 = b.y;
  box.y1 = b.y + height - 0.3;
  box.radius = 0.27;
  box.headX = b.x - Math.sin(b.yaw) * 0.04;
  box.headY = b.y + height - 0.17;
  box.headZ = b.z - Math.cos(b.yaw) * 0.04;
  box.headRadius = 0.15;
  box.height = height;
  return box;
}

