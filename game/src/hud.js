// The DOM HUD: score bar and clock, vitals and money, ammo and slots, a crosshair whose gap is
// the real spread, hit and damage markers, charge prompts, banners, the kill feed, the team
// radio's contact calls and the scoreboard. It reads the simulation, writes only the DOM, and
// touches an element only when the value it shows has changed.
import { TEAMS, SITES, CALLOUTS, RAIDERS, WARDENS } from './level.js';
import { calloutAt, cellIndex } from './world.js';
import { EV } from './events.js';
import { PHASE, ROUNDS_TO_WIN, BOMB_TIME } from './round.js';
import { heldGun, heldId, grenadeCount } from './actors.js';
import { inaccuracy } from './combat.js';
import { nameOf, SLOT_GRENADE, SLOT_BOMB } from './weapons.js';
import { TEAM_SIZE } from './sim.js';

const $ = (id) => document.getElementById(id);
const FEED_TIME = 7;
const RADIO_TIME = 3;
const REASONS = ['All {loser} eliminated', 'The charge detonated', 'The charge was defused', 'Time ran out'];
const teamClass = (team) => (team === RAIDERS ? 'raider' : 'warden');
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const hundredths = (v) => String(v / 100);
const carries = (a, slot) => (slot === 0 ? a.primary !== null : slot === 1 ? a.secondary !== null
  : slot === 3 ? grenadeCount(a) > 0 : slot === 4 ? a.hasBomb : true);

// A setter that applies a value only when it differs from the last one, so a steady HUD is free.
function cached(apply) {
  let last = null;
  return (value) => {
    if (value === last) return;
    last = value;
    apply(value);
  };
}
const text = (el, format = String) => cached((v) => { el.textContent = format(v); });
const toggle = (el, name) => cached((on) => el.classList.toggle(name, on));
const style = (el, prop, format) => cached((v) => { el.style[prop] = format(v); });
const shown = (el) => cached((on) => { el.hidden = !on; });

export function createHud(sim) {
  const round = sim.round.state;
  const hitmarker = $('hitmarker');
  const banner = $('banner');
  const feed = $('feed');
  const board = $('board');
  const moneyGain = $('money-gain');
  const ticks = $('crosshair').children;
  // The team radio sits under the radar's location line.
  const radio = $('radar-box').appendChild(document.createElement('div'));
  radio.id = 'radio';
  Object.assign(radio.style, { padding: '4px 2px 0', fontSize: '13px', fontWeight: '600', color: 'var(--accent)' });
  const radioShown = shown(radio);
  const ui = {
    score: [text($('score-0')), text($('score-1'))],
    timer: text($('timer'), clock),
    timerLow: toggle($('timer'), 'low'),
    planted: toggle($('clock'), 'planted'),
    roundLabel: text($('round-label'), (phase) => (phase === PHASE.FREEZE ? 'Buy time' : phase === PHASE.PLANTED ? `Charge · ${SITES[round.bomb.site].name}` : `Round ${round.number}`)),
    hp: text($('hp')),
    hpLow: toggle($('health'), 'low'),
    ap: text($('ap')),
    kit: text($('kit')),
    cash: text($('cash'), (v) => `$${v}`),
    weapon: text($('weapon-name')),
    mag: text($('ammo-mag')),
    magEmpty: toggle($('ammo-mag'), 'empty'),
    reserve: text($('ammo-reserve'), (v) => (v < 0 ? '' : `/ ${v}`)),
    prompt: text($('prompt-text')),
    callout: text($('callout')),
    spectating: shown($('spectate')),
    spectate: text($('spectate'), (id) => `Spectating ${sim.actors[id].name} · click to cycle`),
    scope: toggle($('scope'), 'on'),
    damage: style($('damage'), 'opacity', hundredths),
    damageTurn: style($('damage'), 'transform', (v) => `rotate(${v / 100}rad)`),
    hurt: style($('hurt'), 'opacity', hundredths),
    flash: style($('flash'), 'opacity', hundredths),
    using: shown($('progress')),
    progress: style($('progress').firstElementChild, 'width', (v) => `${v}%`),
    crosshair: shown($('crosshair')),
    gap: cached((gap) => {
      ticks[0].style.transform = `translateY(${-gap - 8}px)`;
      ticks[1].style.transform = `translateY(${gap}px)`;
      ticks[2].style.transform = `translateX(${-gap - 8}px)`;
      ticks[3].style.transform = `translateX(${gap}px)`;
    }),
  };
  const pips = [0, 1].map((team) => {
    const el = $(`pips-${team}`);
    el.replaceChildren();
    return sim.actors.filter((a) => a.team === team).map((a) => ({ a, dead: toggle(el.appendChild(document.createElement('i')), 'dead') }));
  });
  const slots = [...document.querySelectorAll('#slots span')].map((el) => ({ on: toggle(el, 'on'), has: shown(el) }));
  const feedItems = [];
  let hitTime = 0;
  let hurtFlash = 0;
  let bannerTime = 0;
  let gainTime = 0;
  let boardTimer = 0;
  let lastMoney = -1;
  let lastViewer = null;
  let radioTime = 0;
  let radioPlace = '';
  let radioCount = 0;

  function showBanner(title, copy, seconds, tone = '') {
    $('banner-title').textContent = title;
    $('banner-title').className = tone;
    $('banner-copy').textContent = copy;
    banner.hidden = false;
    bannerTime = seconds;
  }

  function addFeed(e, viewer) {
    const row = document.createElement('div');
    row.className = viewer && (e.actor === viewer || e.target === viewer) ? 'chip mine' : 'chip';
    const name = (a) => `<b class="${teamClass(a.team)}">${a.name}</b>`;
    const gun = e.weapon === 'bomb' ? 'charge' : nameOf(e.weapon).split(' ')[0];
    row.innerHTML = `${e.actor ? name(e.actor) : ''}<span class="gun">${gun}</span>${e.a ? '<span class="hs">HEAD</span>' : ''}${name(e.target)}`;
    feed.appendChild(row);
    feedItems.push({ row, age: 0 });
    if (feedItems.length > 6) feedItems.shift().row.remove();
  }

  // A teammate bot just saw an enemy nobody on the team had eyes on: name the spot. Calls that
  // land on the same spot while one is still up stack into a count instead of replacing it.
  function contact(e) {
    const place = CALLOUTS[calloutAt(cellIndex(e.x, e.z))]?.[0] ?? '';
    radioCount = radioTime > 0 && place === radioPlace ? radioCount + 1 : 1;
    radioPlace = place;
    radioTime = RADIO_TIME;
    const where = place ? `Contact at ${place}` : 'Contact';
    radio.textContent = `${e.actor.name} · ${where}${radioCount > 1 ? ` ×${radioCount}` : ''}`;
  }

  function renderBoard(viewer) {
    const rows = (team) => sim.actors
      .filter((a) => a.team === team)
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map((a) => `<tr class="${a.alive ? '' : 'dead'} ${a === sim.player ? 'me' : ''}"><td>${a.name}${a.hasBomb ? ' ◆' : a.kit ? ' ✚' : ''}</td><td class="num">${a.kills}</td><td class="num">${a.deaths}</td><td class="num">${viewer && a.team === viewer.team ? `$${a.money}` : ''}</td></tr>`)
      .join('');
    const table = (team) => `<table><thead><tr><th class="${teamClass(team)}">${TEAMS[team]} · ${round.score[team]}</th><th class="num">K</th><th class="num">D</th><th class="num">Money</th></tr></thead><tbody>${rows(team)}</tbody></table>`;
    board.innerHTML = `<h2><span>Kiln Yard · Round ${round.number}</span><span>First to ${ROUNDS_TO_WIN}</span></h2>${table(RAIDERS)}${table(WARDENS)}`;
  }

  function prompt(viewer) {
    if (!viewer.alive || viewer !== sim.player) return '';
    if (viewer.using > 0) return viewer.team === RAIDERS ? 'Planting the charge…' : 'Defusing…';
    if (viewer.hasBomb && round.phase === PHASE.LIVE && sim.round.siteAt(viewer.body.x, viewer.body.z) >= 0) return 'Hold E to plant the charge';
    const bomb = round.bomb;
    if (viewer.team === WARDENS && bomb.state === 'planted' && Math.hypot(bomb.x - viewer.body.x, bomb.z - viewer.body.z) < 1.7) return viewer.kit ? 'Hold E to defuse (kit)' : 'Hold E to defuse';
    return sim.round.buyOpen(viewer) && round.phase === PHASE.FREEZE ? 'Press B to buy' : '';
  }

  // What is in hand: its name, the big number and the reserve (-1 for none).
  function arms(viewer, gun) {
    if (viewer.slot === SLOT_GRENADE) {
      ui.weapon(nameOf(viewer.nade));
      ui.mag(viewer.nades[viewer.nade]);
    } else if (viewer.slot === SLOT_BOMB) {
      ui.weapon('Demolition charge');
      ui.mag(1);
    } else if (gun.def.kind === 'melee') {
      ui.weapon(gun.def.name);
      ui.mag('–');
    } else {
      ui.weapon(viewer.reloading > 0 ? 'Reloading…' : gun.def.name);
      ui.mag(gun.mag);
      ui.reserve(gun.reserve);
      return;
    }
    ui.reserve(-1);
  }

  return {
    show(on) {
      $('hud').hidden = !on;
    },
    toggleBoard(on, viewer) {
      board.hidden = !on;
      if (on) renderBoard(viewer);
    },

    onEvent(e, viewer) {
      if (e.type === EV.HIT) {
        if (viewer && e.actor === viewer) {
          hitTime = 0.12;
          hitmarker.classList.add('on');
          hitmarker.classList.toggle('kill', e.target.hp <= 0);
        }
        if (viewer && e.target === viewer) hurtFlash = 0.5;
      } else if (e.type === EV.KILL) {
        addFeed(e, viewer);
      } else if (e.type === EV.CONTACT) {
        if (viewer && e.actor.team === viewer.team) contact(e);
      } else if (e.type === EV.ROUND_START) {
        radioTime = 0;
        showBanner(`Round ${round.number}`, round.number === 1 ? 'Pistol round. Press B to buy, then go.' : 'Buy time. Press B to open the buy menu.', 99);
        for (const item of feedItems) item.row.remove();
        feedItems.length = 0;
      } else if (e.type === EV.ROUND_LIVE) {
        showBanner('Go', viewer && viewer.team === RAIDERS ? 'Take the charge to site A or B.' : 'Hold the sites. Stop the plant.', 1.6);
      } else if (e.type === EV.PLANTED) {
        showBanner(`Charge planted at ${SITES[e.a].name}`, `${BOMB_TIME} seconds to detonation.`, 2.6, 'raider');
      } else if (e.type === EV.ROUND_END) {
        const mvp = sim.actors.filter((a) => a.team === e.a).sort((a, b) => b.roundKills - a.roundKills)[0];
        const extra = mvp.roundKills > 0 ? ` · MVP ${mvp.name} (${mvp.roundKills} kill${mvp.roundKills > 1 ? 's' : ''})` : '';
        showBanner(`${TEAMS[e.a]} win the round`, REASONS[e.b].replace('{loser}', TEAMS[1 - e.a]) + extra, 99, teamClass(e.a));
      }
    },

    // Once a frame, for the actor the camera is in; fov in degrees for the crosshair.
    update(viewer, dt, fov) {
      ui.score[0](round.score[0]);
      ui.score[1](round.score[1]);
      for (const team of pips) for (const pip of team) pip.dead(!pip.a.alive);
      const planted = round.phase === PHASE.PLANTED;
      ui.planted(planted);
      ui.timer(Math.max(0, Math.ceil(round.timer)));
      ui.timerLow(!planted && round.phase === PHASE.LIVE && round.timer < 15);
      ui.roundLabel(round.phase + round.number * 8);
      bannerTime -= dt;
      if (bannerTime <= 0) banner.hidden = true;
      radioTime -= dt;
      radioShown(radioTime > 0);
      gainTime -= dt;
      if (gainTime <= 0) moneyGain.classList.remove('on');
      hitTime -= dt;
      if (hitTime <= 0) hitmarker.classList.remove('on');
      for (let i = feedItems.length - 1; i >= 0; i -= 1) {
        const item = feedItems[i];
        item.age += dt;
        if (item.age > FEED_TIME) {
          item.row.remove();
          feedItems.splice(i, 1);
        } else if (item.age > FEED_TIME - 0.5) item.row.style.opacity = '0';
      }
      boardTimer -= dt;
      if (!board.hidden && boardTimer <= 0) {
        boardTimer = 0.25;
        renderBoard(viewer);
      }
      if (!viewer) return;

      ui.hp(Math.ceil(viewer.hp));
      ui.hpLow(viewer.hp <= 25);
      ui.ap(Math.ceil(viewer.armor));
      ui.kit(viewer.helmet ? 'helm' : '');
      ui.cash(viewer.money);
      // Money earned since the last frame floats beside the balance.
      if (viewer === lastViewer && viewer.money > lastMoney) {
        moneyGain.textContent = `+$${viewer.money - lastMoney}`;
        moneyGain.classList.add('on');
        gainTime = 2.2;
      }
      lastViewer = viewer;
      lastMoney = viewer.money;
      const gun = heldGun(viewer);
      arms(viewer, gun);
      ui.magEmpty(gun !== null && gun.def.kind === 'gun' && gun.mag === 0);
      for (let s = 0; s < slots.length; s += 1) {
        slots[s].has(carries(viewer, s));
        slots[s].on(viewer.slot === s + 1);
      }
      ui.callout(CALLOUTS[calloutAt(cellIndex(viewer.body.x, viewer.body.z))]?.[0] ?? '');

      // The crosshair opens with the actual spread cone. Fractions go through as hundredths so
      // equal frames compare equal.
      ui.scope(viewer.scoped && viewer.alive);
      ui.crosshair(viewer.alive && !(gun && gun.def.scope) && heldId(viewer) !== 'bomb');
      ui.gap(Math.round(4 + (Math.tan(inaccuracy(viewer)) * window.innerHeight * 0.5) / Math.tan((fov * Math.PI) / 360)));
      const hurtLeft = viewer.alive ? Math.max(0, 1 - viewer.hurtAge / 1.2) : 0;
      ui.damage(Math.round(hurtLeft * 100));
      if (hurtLeft > 0) ui.damageTurn(Math.round(-(viewer.hurtFrom - viewer.body.yaw - Math.PI) * 100));
      hurtFlash = Math.max(0, hurtFlash - dt);
      ui.hurt(viewer.alive ? Math.round(Math.min(1, hurtFlash * 1.6) * 100) : 60);
      ui.flash(Math.round(Math.min(1, viewer.blind / 2.2) * 100));
      ui.prompt(prompt(viewer));
      ui.using(viewer.using > 0);
      if (viewer.using > 0) ui.progress(Math.round(viewer.using * 100));
      ui.spectating(viewer !== sim.player);
      ui.spectate(viewer.id);
    },
  };
}
