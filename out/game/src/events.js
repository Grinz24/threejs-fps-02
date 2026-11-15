// What the simulation tells the presentation: shots, hits, kills, grenades, the bomb and the
// round. A fixed pool of event records is filled during simulation steps and drained once per
// rendered frame, so emitting never allocates. Every event about a place carries it in x y z.
export const EV = {
  SHOT: 1, // actor, x y z muzzle, a b c end point
  IMPACT: 2, // x y z, a b c surface normal
  HIT: 3, // actor = attacker, target = victim, a = damage, b = zone (0 body, 1 head), x y z
  KILL: 4, // actor = killer (may be null), target = victim, a = headshot, weapon
  RELOAD: 5,
  THROW: 6, // actor, weapon = grenade kind
  BOUNCE: 7, // x y z
  BLAST: 8, // x y z, weapon = grenade kind
  STEP: 9, // actor
  PLANTED: 10, // actor, x y z
  DEFUSED: 11, // actor
  EXPLODED: 12, // x y z
  BEEP: 13, // x y z, a = urgency 0..1
  ROUND_START: 14,
  ROUND_LIVE: 15,
  ROUND_END: 16, // a = winning team, b = reason
  BUY: 17, // actor, weapon = item id
  SWING: 18,
  EQUIP: 19,
  PICKUP: 20, // actor
  DRY: 21,
  MATCH_END: 22, // a = winning team
};

const CAPACITY = 512;

export function createEvents() {
  const pool = [];
  for (let i = 0; i < CAPACITY; i += 1) {
    pool.push({ type: 0, actor: null, target: null, weapon: '', x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 });
  }
  let count = 0;
  return {
    emit(type, actor = null, x = 0, y = 0, z = 0, a = 0, b = 0, c = 0) {
      if (count === CAPACITY) return pool[CAPACITY - 1];
      const e = pool[count];
      count += 1;
      e.type = type;
      e.actor = actor;
      e.target = null;
      e.weapon = '';
      e.x = x;
      e.y = y;
      e.z = z;
      e.a = a;
      e.b = b;
      e.c = c;
      return e;
    },
    drain(handler) {
      for (let i = 0; i < count; i += 1) handler(pool[i]);
      count = 0;
    },
  };
}
