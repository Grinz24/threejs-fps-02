import { createSim } from '../game/src/sim.js';
import { EV } from '../game/src/events.js';
const tally = {win:[0,0], reason:[0,0,0,0], kills:0, hs:0, rounds:0, len:0, nades:0, weapons:{}};
for (let seed=1; seed<=12; seed++) {
  const sim = createSim(seed, -1); sim.startMatch(); let start=0;
  while (sim.round.state.phase !== 4 && sim.time < 3000) { sim.step(1/60); sim.events.drain(e=>{
    if(e.type===EV.KILL){tally.kills++; if(e.a) tally.hs++; tally.weapons[e.weapon]=(tally.weapons[e.weapon]||0)+1;}
    if(e.type===EV.THROW) tally.nades++;
    if(e.type===EV.ROUND_LIVE) start=sim.time;
    if(e.type===EV.ROUND_END){tally.win[e.a]++; tally.reason[e.b]++; tally.rounds++; tally.len+=sim.time-start;}
  }); }
}
tally.len = (tally.len/tally.rounds).toFixed(1); tally.hsRate=(tally.hs/tally.kills).toFixed(2);
console.log(JSON.stringify(tally));
