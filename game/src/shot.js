// The shot director for ?shot=: a bot-only match is run headless to find a moment worth a
// picture and whose eyes to see it through, then the same seed is replayed with the camera in
// that actor so every effect, banner and kill feed line is the real one. Deterministic: the
// same seed always stages the same frame.
//   start: a Raider in the open with teammates ahead, rifles bought, nobody in sight yet
//   play:  the instant of a rifle kill at fighting range
//   end:   the next round's buy time with the buy menu open
import { EV } from './events.js';
import { PHASE, FREEZE_TIME } from './round.js';
import { RAIDERS } from './level.js';
import { clearLine, tileAt, cellIndex } from './world.js';
import { eyeHeight } from './movement.js';

const LIMIT = 60 * 60 * 20;

function inView(viewer, other, near, far) {
  const a = viewer.body;
  const b = other.body;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d < near || d > far) return false;
  if ((dx * -Math.sin(a.yaw) + dz * -Math.cos(a.yaw)) / d < 0.82) return false;
  return clearLine(a.x, a.y + eyeHeight(a), a.z, b.x, b.y + 1.2, b.z);
}

const count = (sim, viewer, team, near, far) => sim.actors.filter((o) => o !== viewer && o.alive && o.team === team && inView(viewer, o, near, far)).length;

// Step a fresh match until the shot's moment; returns how many steps and whose view.
function find(name, sim, step) {
  let found = null;
  let roundEnded = false;
  for (let n = 1; n <= LIMIT && !found; n += 1) {
    sim.step(step);
    const round = sim.round.state;
    sim.events.drain((e) => {
      if (found) return;
      if (name === 'play' && e.type === EV.KILL && round.number >= 2 && e.actor && e.actor.alive && e.weapon === 'ridgeback') {
        const d = Math.hypot(e.actor.body.x - e.target.body.x, e.actor.body.z - e.target.body.z);
        if (d > 6 && d < 15) found = { steps: n, viewer: e.actor.id };
      }
      if (name === 'end' && e.type === EV.ROUND_END && round.number >= 3) roundEnded = true;
    });
    if (found) break;
    if (name === 'start' && round.number >= 2 && round.phase === PHASE.LIVE && round.elapsed > FREEZE_TIME + 3.5) {
      for (const a of sim.actors) {
        if (!a.alive || a.team !== RAIDERS || !a.primary || tileAt(cellIndex(a.body.x, a.body.z)) === ',') continue;
        const clear = sim.grenades.smokes.every((c) => !c.active || Math.hypot(c.x - a.body.x, c.z - a.body.z) > 30);
        if (clear && count(sim, a, RAIDERS, 3, 22) >= 2 && count(sim, a, 1 - RAIDERS, 0, 80) === 0) {
          found = { steps: n, viewer: a.id };
          break;
        }
      }
    }
    if (name === 'end' && roundEnded && round.phase === PHASE.FREEZE && round.timer < FREEZE_TIME - 2.5) {
      const viewer = sim.actors.find((a) => a.team === RAIDERS && a.money > 2500) ?? sim.actors[0];
      found = { steps: n, viewer: viewer.id, buy: true };
    }
  }
  return found ?? { steps: LIMIT, viewer: 0 };
}

// makeMatch() builds a fresh match; advance(dt) steps it and its presentation once.
export function stage(name, makeMatch, advance, step, openBuy) {
  const plan = find(name, makeMatch().sim, step);
  const match = makeMatch();
  const viewer = match.sim.actors[plan.viewer];
  match.sim.player = viewer;
  match.viewer = viewer;
  for (let n = 0; n < plan.steps; n += 1) advance(step);
  if (plan.buy) openBuy(viewer);
  return match;
}
