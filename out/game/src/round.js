// The match rules: freeze time and the buy window, the round clock, the charge (carried,
// dropped, planted, defused or detonated), the win conditions, the money each round pays
// and the score that ends the match. Raiders attack with the charge; Wardens defend.
import { SPAWNS, SITES, RAIDERS, WARDENS, CELL } from './level.js';
import { cellX, cellZ, cellIndex, tileAt } from './world.js';
import { EV } from './events.js';
import { respawn, earn, equipBest } from './actors.js';
import { SLOT_BOMB } from './weapons.js';

export const PHASE = { FREEZE: 0, LIVE: 1, PLANTED: 2, OVER: 3, MATCH: 4 };
export const REASON = { ELIMINATION: 0, DETONATED: 1, DEFUSED: 2, TIME: 3 };
export const FREEZE_TIME = 8;
export const ROUND_TIME = 105;
export const BOMB_TIME = 40;
export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 7;
export const KIT_DEFUSE_TIME = 3.6;
export const ROUNDS_TO_WIN = 7;
const OVER_TIME = 6;
const BUY_WINDOW = 22;
const BUY_ZONE = 14;
const PICKUP_RANGE = 1.2;
const DEFUSE_RANGE = 1.7;
const BLAST_RADIUS = 22;
const WIN_PAY = [3250, 3500, 3500, 3250];
const LOSS_PAY = 1400;
const LOSS_STEP = 500;
const LOSS_MAX = 3400;
const PLANT_PAY = 300;
const PLANT_TEAM_PAY = 800;

export function createRound(sim) {
  const state = {
    phase: PHASE.FREEZE,
    timer: FREEZE_TIME,
    elapsed: 0,
    number: 0,
    score: [0, 0],
    lossStreak: [0, 0],
    winner: -1,
    reason: 0,
    bomb: { state: 'carried', carrier: null, x: 0, y: 0, z: 0, site: -1, timer: 0, plant: 0, defuse: 0, defuser: null, beep: 0, planter: null },
    matchWinner: -1,
  };
  const bomb = state.bomb;

  const siteAt = (x, z) => SITES.findIndex((s) => s.tile === tileAt(cellIndex(x, z)));
  const alive = (team) => {
    let n = 0;
    for (const a of sim.actors) if (a.alive && a.team === team) n += 1;
    return n;
  };

  function start() {
    state.number += 1;
    state.phase = PHASE.FREEZE;
    state.timer = FREEZE_TIME;
    state.elapsed = 0;
    state.winner = -1;
    sim.grenades.clear();
    const slots = [0, 0];
    for (const actor of sim.actors) {
      const spawn = SPAWNS[actor.team][slots[actor.team] % SPAWNS[actor.team].length];
      slots[actor.team] += 1;
      respawn(actor, cellX(spawn[0]), cellZ(spawn[1]), actor.team === RAIDERS ? 0 : Math.PI);
    }
    // The charge starts with a bot when there is one, so a new player is never the bottleneck.
    const raiders = sim.actors.filter((a) => a.team === RAIDERS && a.isBot);
    const carrier = raiders.length ? raiders[sim.rng.int(raiders.length)] : sim.actors.find((a) => a.team === RAIDERS);
    carrier.hasBomb = true;
    Object.assign(bomb, { state: 'carried', carrier, site: -1, timer: 0, plant: 0, defuse: 0, defuser: null, planter: null });
    sim.events.emit(EV.ROUND_START);
  }

  function finish(winner, reason) {
    state.phase = PHASE.OVER;
    state.timer = OVER_TIME;
    state.winner = winner;
    state.reason = reason;
    state.score[winner] += 1;
    const loser = 1 - winner;
    state.lossStreak[winner] = 0;
    const lossPay = Math.min(LOSS_MAX, LOSS_PAY + LOSS_STEP * state.lossStreak[loser]);
    state.lossStreak[loser] += 1;
    for (const actor of sim.actors) {
      if (actor.team === winner) earn(actor, WIN_PAY[reason]);
      else earn(actor, lossPay + (loser === RAIDERS && bomb.state !== 'carried' && bomb.state !== 'dropped' ? PLANT_TEAM_PAY : 0));
    }
    sim.events.emit(EV.ROUND_END, null, 0, 0, 0, winner, reason);
    if (state.score[winner] >= ROUNDS_TO_WIN) state.matchWinner = winner;
  }

  // Drop the charge at the carrier's feet, or tossed a step ahead when dropped on purpose.
  function dropBomb(actor, toss = 0) {
    if (bomb.carrier !== actor) return;
    const b = actor.body;
    Object.assign(bomb, { state: 'dropped', carrier: null, x: b.x - Math.sin(b.yaw) * toss, y: b.y, z: b.z - Math.cos(b.yaw) * toss, plant: 0 });
    actor.hasBomb = false;
    actor.using = 0;
    equipBest(actor);
  }

  function stepPlanting(dt) {
    const actor = bomb.carrier;
    if (!actor || !actor.alive) return;
    const b = actor.body;
    const site = siteAt(b.x, b.z);
    const trying = (actor.cmd.use || (actor.slot === SLOT_BOMB && actor.cmd.fire)) && site >= 0 && b.onGround;
    if (!trying) {
      bomb.plant = 0;
      actor.using = 0;
      return;
    }
    bomb.plant += dt;
    actor.using = bomb.plant / PLANT_TIME;
    if (bomb.plant < PLANT_TIME) return;
    actor.hasBomb = false;
    actor.using = 0;
    Object.assign(bomb, { state: 'planted', carrier: null, x: b.x, y: b.y, z: b.z, site, timer: BOMB_TIME, beep: 0, planter: actor });
    earn(actor, PLANT_PAY);
    equipBest(actor);
    state.phase = PHASE.PLANTED;
    state.timer = BOMB_TIME;
    sim.events.emit(EV.PLANTED, actor, b.x, b.y, b.z, site);
  }

  function stepDefusing(dt) {
    let defuser = null;
    for (const actor of sim.actors) {
      if (!actor.alive || actor.team !== WARDENS || !actor.cmd.use) continue;
      if (Math.hypot(actor.body.x - bomb.x, actor.body.z - bomb.z) < DEFUSE_RANGE) defuser = defuser ?? actor;
    }
    if (bomb.defuser && bomb.defuser !== defuser) {
      bomb.defuser.using = 0;
      bomb.defuse = 0;
    }
    bomb.defuser = defuser;
    if (!defuser) return;
    const need = defuser.kit ? KIT_DEFUSE_TIME : DEFUSE_TIME;
    bomb.defuse += dt;
    defuser.using = bomb.defuse / need;
    if (bomb.defuse < need) return;
    defuser.using = 0;
    bomb.state = 'defused';
    earn(defuser, PLANT_PAY);
    sim.events.emit(EV.DEFUSED, defuser, bomb.x, bomb.y, bomb.z);
    finish(WARDENS, REASON.DEFUSED);
  }

  function detonate() {
    bomb.state = 'exploded';
    sim.events.emit(EV.EXPLODED, null, bomb.x, bomb.y + 0.3, bomb.z);
    for (const actor of sim.actors) {
      if (!actor.alive) continue;
      const d = Math.hypot(actor.body.x - bomb.x, actor.body.z - bomb.z);
      if (d < BLAST_RADIUS) sim.damage(actor, bomb.planter, 520 * (1 - d / BLAST_RADIUS) ** 2, 'bomb');
    }
    finish(RAIDERS, REASON.DETONATED);
  }

  function step(dt) {
    state.timer -= dt;
    state.elapsed += dt;
    if (state.phase === PHASE.FREEZE) {
      if (state.timer <= 0) {
        state.phase = PHASE.LIVE;
        state.timer = ROUND_TIME;
        sim.events.emit(EV.ROUND_LIVE);
      }
      return;
    }
    if (state.phase === PHASE.OVER) {
      if (state.timer > 0) return;
      if (state.matchWinner >= 0) {
        state.phase = PHASE.MATCH;
        sim.events.emit(EV.MATCH_END, null, 0, 0, 0, state.matchWinner);
      } else start();
      return;
    }
    if (state.phase === PHASE.MATCH) return;

    if (bomb.state === 'dropped') {
      for (const actor of sim.actors) {
        if (!actor.alive || actor.team !== RAIDERS) continue;
        if (Math.hypot(actor.body.x - bomb.x, actor.body.z - bomb.z) < PICKUP_RANGE) {
          bomb.state = 'carried';
          bomb.carrier = actor;
          actor.hasBomb = true;
          sim.events.emit(EV.PICKUP, actor);
          break;
        }
      }
    }
    if (state.phase === PHASE.LIVE) {
      stepPlanting(dt);
      if (state.phase !== PHASE.LIVE) return;
      if (alive(RAIDERS) === 0) finish(WARDENS, REASON.ELIMINATION);
      else if (alive(WARDENS) === 0) finish(RAIDERS, REASON.ELIMINATION);
      else if (state.timer <= 0) finish(WARDENS, REASON.TIME);
      return;
    }
    // Planted: the Wardens must defuse; wiping them out wins it for the Raiders at once.
    bomb.timer = state.timer;
    bomb.beep -= dt;
    if (bomb.beep <= 0) {
      const urgency = 1 - Math.max(0, bomb.timer) / BOMB_TIME;
      bomb.beep = 0.12 + 1.0 * (1 - urgency) ** 1.6;
      sim.events.emit(EV.BEEP, null, bomb.x, bomb.y, bomb.z, urgency);
    }
    stepDefusing(dt);
    if (state.phase !== PHASE.PLANTED) return;
    if (state.timer <= 0) detonate();
    else if (alive(WARDENS) === 0) finish(RAIDERS, REASON.ELIMINATION);
  }

  // Buying is open through freeze time and the first seconds of the round, in one's own spawn.
  function buyOpen(actor) {
    if (!actor.alive) return false;
    if (state.phase === PHASE.FREEZE) return true;
    if (state.phase !== PHASE.LIVE || state.elapsed > BUY_WINDOW) return false;
    const spawn = SPAWNS[actor.team][0];
    return Math.hypot(actor.body.x - cellX(spawn[0]), actor.body.z - cellZ(spawn[1])) < BUY_ZONE + CELL;
  }

  return { state, start, step, dropBomb, buyOpen, siteAt, alive };
}
