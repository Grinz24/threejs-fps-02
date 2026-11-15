// The match as one deterministic simulation: ten actors, the round rules, grenades and the
// bots, advanced by fixed steps. It draws randomness only from its seeded stream and reports
// to the presentation only through events, so a seed and a command stream replay exactly.
import { createRng } from './rng.js';
import { createEvents, EV } from './events.js';
import { TEAMS } from './level.js';
import { stepBody, groundSpeed, RUN_SPEED } from './movement.js';
import { createActor, earn, heldGun, buy } from './actors.js';
import { applyDamage, stepArms } from './combat.js';
import { createGrenades } from './grenades.js';
import { createRound, PHASE } from './round.js';
import { createBots } from './bots.js';
import { WEAPONS } from './weapons.js';

export const TEAM_SIZE = 5;
const NAMES = [
  ['Cinder', 'Moth', 'Vex', 'Rook', 'Ash'],
  ['Pike', 'Juno', 'Bastion', 'Orrin', 'Sable'],
];
const STRIDE = 2.3;
const STEP_NOISE = 15;
const SEPARATION = 0.72;
const TEAMKILL_PENALTY = 300;

export function createSim(seed, playerTeam) {
  const sim = {
    rng: createRng(seed),
    events: createEvents(),
    actors: [],
    player: null,
    time: 0,
  };
  for (let team = 0; team < TEAMS.length; team += 1) {
    for (let k = 0; k < TEAM_SIZE; k += 1) {
      const isPlayer = team === playerTeam && k === 0;
      const actor = createActor(sim.actors.length, team, isPlayer ? 'You' : NAMES[team][k], !isPlayer);
      if (isPlayer) sim.player = actor;
      sim.actors.push(actor);
    }
  }
  sim.grenades = createGrenades(sim);
  sim.round = createRound(sim);
  sim.bots = createBots(sim);

  sim.kill = (victim, killer, weaponId, headshot) => {
    victim.alive = false;
    victim.deaths += 1;
    victim.using = 0;
    sim.round.dropBomb(victim);
    if (killer && killer !== victim) {
      if (killer.team !== victim.team) {
        killer.kills += 1;
        killer.roundKills += 1;
        earn(killer, WEAPONS[weaponId]?.reward ?? 300);
      } else earn(killer, -TEAMKILL_PENALTY);
    }
    const e = sim.events.emit(EV.KILL, killer, victim.body.x, victim.body.y, victim.body.z, headshot ? 1 : 0);
    e.target = victim;
    e.weapon = weaponId;
  };
  sim.damage = (victim, attacker, amount, weaponId) => applyDamage(sim, victim, attacker, amount, 'chest', weaponId, 0.95);

  sim.startMatch = () => {
    sim.round.start();
    sim.bots.planRound();
  };

  // Bodies do not walk through one another: overlapping pairs are eased apart.
  function separate(dt) {
    const actors = sim.actors;
    for (let i = 0; i < actors.length; i += 1) {
      const a = actors[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < actors.length; j += 1) {
        const b = actors[j];
        if (!b.alive) continue;
        const dx = b.body.x - a.body.x;
        const dz = b.body.z - a.body.z;
        const d = Math.hypot(dx, dz);
        if (d >= SEPARATION || d < 1e-4 || Math.abs(a.body.y - b.body.y) > 1.4) continue;
        const push = ((SEPARATION - d) / d) * 6 * dt;
        a.body.vx -= dx * push;
        a.body.vz -= dz * push;
        b.body.vx += dx * push;
        b.body.vz += dz * push;
      }
    }
  }

  function stepActor(actor, dt, frozen) {
    const b = actor.body;
    const cmd = actor.cmd;
    const busy = actor.using > 0;
    const forward = frozen || busy ? 0 : cmd.forward;
    const strafe = frozen || busy ? 0 : cmd.strafe;
    const sin = Math.sin(b.yaw);
    const cos = Math.cos(b.yaw);
    const gun = heldGun(actor);
    const weight = (gun ? gun.def.speed : 1) * (actor.scoped ? 0.55 : 1);
    stepBody(b, -sin * forward + cos * strafe, -cos * forward - sin * strafe, cmd.walk, cmd.crouch, cmd.jump && !frozen && !busy, weight, dt);
    // Running feet are heard; walking and crouching are silent.
    const speed = groundSpeed(b);
    if (b.onGround && !cmd.walk && !b.crouched && speed > RUN_SPEED * 0.6) {
      actor.stride += speed * dt;
      if (actor.stride > STRIDE) {
        actor.stride = 0;
        actor.noise = Math.max(actor.noiseAge < 0.3 ? actor.noise : 0, STEP_NOISE);
        actor.noiseAge = 0;
        sim.events.emit(EV.STEP, actor, b.x, b.y, b.z);
      }
    }
    if (b.landed > 6) {
      actor.noise = STEP_NOISE;
      actor.noiseAge = 0;
      sim.events.emit(EV.STEP, actor, b.x, b.y, b.z);
    }
    b.landed = 0;
    stepArms(sim, actor, dt, !frozen && !busy);
  }

  sim.step = (dt) => {
    sim.time += dt;
    const round = sim.round;
    const before = round.state.number;
    round.step(dt);
    if (round.state.number !== before) sim.bots.planRound();
    const phase = round.state.phase;
    const frozen = phase === PHASE.FREEZE || phase === PHASE.MATCH;
    sim.bots.step(dt);
    for (const actor of sim.actors) {
      if (actor.cmd.buy && round.buyOpen(actor) && buy(actor, actor.cmd.buy)) {
        sim.events.emit(EV.BUY, actor).weapon = actor.cmd.buy;
      }
      actor.noiseAge += dt;
      actor.hurtAge += dt;
      actor.blind = Math.max(0, actor.blind - dt);
      if (actor.alive) stepActor(actor, dt, frozen);
      // One-shot presses are consumed by the step that saw them.
      actor.cmd.firePressed = false;
      actor.cmd.select = 0;
      actor.cmd.scope = false;
      actor.cmd.reload = false;
      actor.cmd.buy = '';
    }
    separate(dt);
    sim.grenades.step(dt);
  };

  return sim;
}
