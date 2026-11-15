// The armoury as data: every gun's damage, armour penetration, fire rate, magazine, spread
// and recoil, the grenades and the gear, with the prices the buy menu shows. Inventory and
// combat read these numbers; nothing here changes at run time.
//   spread: radians of cone half-angle. base when still and grounded, plus move at full run
//   speed, plus air when airborne, plus bloom per shot fired (capped at bloomMax, recovering at
//   recover per second). Recoil: kick is pitch per shot, sway the yaw amplitude of the pattern.
export const SLOT_PRIMARY = 1;
export const SLOT_SECONDARY = 2;
export const SLOT_KNIFE = 3;
export const SLOT_GRENADE = 4;
export const SLOT_BOMB = 5;

export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Kerf Blade', slot: SLOT_KNIFE, kind: 'melee', price: 0, reward: 1500,
    damage: 55, pen: 0.85, rate: 0.55, reach: 1.7, speed: 1.04,
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel P9', slot: SLOT_SECONDARY, kind: 'gun', price: 200, reward: 300,
    damage: 29, pen: 0.5, falloff: 0.88, rate: 0.15, auto: false, mag: 13, reserve: 52, reload: 2.1,
    base: 0.004, move: 0.034, air: 0.12, bloom: 0.011, bloomMax: 0.045, recover: 0.09,
    kick: 0.016, sway: 0.004, speed: 1.0, pellets: 1, pitch: 1.35, model: 'pistol',
  },
  hammer: {
    id: 'hammer', name: 'Hammer .50', slot: SLOT_SECONDARY, kind: 'gun', price: 700, reward: 300,
    damage: 58, pen: 0.92, falloff: 0.82, rate: 0.27, auto: false, mag: 7, reserve: 35, reload: 2.2,
    base: 0.005, move: 0.06, air: 0.2, bloom: 0.035, bloomMax: 0.07, recover: 0.12,
    kick: 0.05, sway: 0.01, speed: 0.98, pellets: 1, pitch: 0.75, model: 'pistol',
  },
  wasp: {
    id: 'wasp', name: 'Wasp SMG', slot: SLOT_PRIMARY, kind: 'gun', price: 1250, reward: 600,
    damage: 25, pen: 0.6, falloff: 0.8, rate: 0.072, auto: true, mag: 30, reserve: 120, reload: 2.3,
    base: 0.008, move: 0.018, air: 0.1, bloom: 0.0045, bloomMax: 0.035, recover: 0.11,
    kick: 0.0075, sway: 0.004, speed: 0.97, pellets: 1, pitch: 1.5, model: 'smg',
  },
  mule: {
    id: 'mule', name: 'Mule 12', slot: SLOT_PRIMARY, kind: 'gun', price: 1100, reward: 900,
    damage: 21, pen: 0.5, falloff: 0.45, rate: 0.85, auto: false, mag: 6, reserve: 30, reload: 2.8,
    base: 0.045, move: 0.03, air: 0.08, bloom: 0.01, bloomMax: 0.02, recover: 0.1,
    kick: 0.07, sway: 0.01, speed: 0.92, pellets: 8, pitch: 0.6, model: 'shotgun',
  },
  ridgeback: {
    id: 'ridgeback', name: 'Ridgeback AR', slot: SLOT_PRIMARY, kind: 'gun', price: 2700, reward: 300,
    damage: 36, pen: 0.78, falloff: 0.97, rate: 0.1, auto: true, mag: 30, reserve: 90, reload: 2.5,
    base: 0.0018, move: 0.075, air: 0.25, bloom: 0.0055, bloomMax: 0.05, recover: 0.14,
    kick: 0.0125, sway: 0.0065, speed: 0.86, pellets: 1, pitch: 1.0, model: 'rifle',
  },
  longbow: {
    id: 'longbow', name: 'Longbow .338', slot: SLOT_PRIMARY, kind: 'gun', price: 4500, reward: 100,
    damage: 112, pen: 0.97, falloff: 0.99, rate: 1.45, auto: false, mag: 5, reserve: 30, reload: 3.4,
    base: 0.0004, move: 0.16, air: 0.4, bloom: 0.0, bloomMax: 0.0, recover: 0.1,
    kick: 0.035, sway: 0.004, speed: 0.8, pellets: 1, pitch: 0.55, model: 'sniper', scope: 0.105, unscoped: 0.075,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, fuse: 1.6, max: 1 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, fuse: 1.7, max: 1 },
  flash: { id: 'flash', name: 'Flashbang', price: 200, fuse: 1.4, max: 2 },
};
export const GRENADE_ORDER = ['frag', 'flash', 'smoke'];

export const GEAR = {
  vest: { id: 'vest', name: 'Kevlar Vest', price: 650 },
  helmet: { id: 'helmet', name: 'Vest + Helmet', price: 1000 },
  kit: { id: 'kit', name: 'Defuse Kit', price: 400 },
};

// The buy menu's columns, in the order the number keys pick them.
export const SHOP = [
  { title: 'Pistols', items: ['kestrel', 'hammer'] },
  { title: 'Heavy & SMG', items: ['wasp', 'mule'] },
  { title: 'Rifles', items: ['ridgeback', 'longbow'] },
  { title: 'Gear', items: ['vest', 'helmet', 'kit'] },
  { title: 'Grenades', items: ['frag', 'flash', 'smoke'] },
];

export const priceOf = (id) => (WEAPONS[id] ?? GRENADES[id] ?? GEAR[id]).price;
export const nameOf = (id) => (WEAPONS[id] ?? GRENADES[id] ?? GEAR[id] ?? { name: 'Charge' }).name;

export function createGun(id) {
  const def = WEAPONS[id];
  return { def, mag: def.mag ?? 0, reserve: def.reserve ?? 0 };
}
