// The DOM HUD: score bar and clock, vitals and money, ammo and slots, a crosshair whose gap is
// the real spread, hit and damage markers, prompts and progress for the charge, banners, the
// kill feed, the scoreboard and the menus. It reads the simulation and writes only the DOM, and
// touches an element only when the value it shows has changed.
import { TEAMS, SITES, CALLOUTS, RAIDERS, WARDENS } from './level.js';
import { calloutAt, cellIndex } from './world.js';
import { EV } from './events.js';
import { PHASE, ROUNDS_TO_WIN, BOMB_TIME } from './round.js';
import { heldGun, heldId } from './actors.js';
import { inaccuracy } from './combat.js';
import { nameOf, SLOT_GRENADE, SLOT_PRIMARY, SLOT_SECONDARY, SLOT_BOMB } from './weapons.js';
import { TEAM_SIZE } from './sim.js';

const $ = (id) => document.getElementById(id);
const FEED_TIME = 7;
const REASONS = ['All {loser} eliminated', 'The charge detonated', 'The charge was defused', 'Time ran out'];

function clock(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Writes that are skipped when the raw value has not changed, so a steady HUD costs nothing.
function cachedText(el, format = String) {
  let last = null;
  return (value) => {
    if (value === last) return;
    last = value;
    el.textContent = format(value);
  };
}
function cachedStyle(el, prop, format) {
  let last = null;
  return (value) => {
    if (value === last) return;
    last = value;
    el.style[prop] = format(value);
  };
}
function cachedToggle(el, name) {
  let last = null;
  return (on) => {
    if (on === last) return;
    last = on;
    el.classList.toggle(name, on);
  };
}

export function createHud(sim) {
  const hud = $('hud');
  const ui = {
    score: [cachedText($('score-0')), cachedText($('score-1'))],
    timer: cachedText($('timer'), clock),
    timerLow: cachedToggle($('timer'), 'low'),
    planted: cachedToggle($('clock'), 'planted'),
    roundLabel: cachedText($('round-label'), (phase) => {
      const round = sim.round.state;
      if (phase === PHASE.FREEZE) return 'Buy time';
      if (phase === PHASE.PLANTED) return `Charge · ${SITES[round.bomb.site].name}`;
      return `Round ${round.number}`;
    }),
    hp: cachedText($('hp')),
    hpLow: cachedToggle($('health'), 'low'),
    ap: cachedText($('ap')),
    kit: cachedText($('kit')),
    cash: cachedText($('cash'), (v) => `$${v}`),
    weapon: cachedText($('weapon-name')),
    mag: cachedText($('ammo-mag')),
    magEmpty: cachedToggle($('ammo-mag'), 'empty'),
    reserve: cachedText($('ammo-reserve'), (v) => (v < 0 ? '' : `/ ${v}`)),
    prompt: cachedText($('prompt-text')),
    callout: cachedText($('callout')),
    spectate: cachedText($('spectate'), (id) => `Spectating ${sim.actors[id].name} · click to cycle`),
    scope: cachedToggle($('scope'), 'on'),
    damage: cachedStyle($('damage'), 'opacity', (v) => String(v / 100)),
    damageTurn: cachedStyle($('damage'), 'transform', (v) => `rotate(${v / 100}rad)`),
    hurt: cachedStyle($('hurt'), 'opacity', (v) => String(v / 100)),
    flash: cachedStyle($('flash'), 'opacity', (v) => String(v / 100)),
    progress: cachedStyle($('progress').firstElementChild, 'width', (v) => `${v}%`),
    crosshair: cachedStyle($('crosshair'), 'display', (v) => (v ? '' : 'none')),
  };
  const pips = [$('pips-0'), $('pips-1')].map((el) => {
    el.replaceChildren();
    const list = [];
    for (let k = 0; k < TEAM_SIZE; k += 1) list.push(el.appendChild(document.createElement('i')));
    return list;
  });
  const pipDead = pips.map((list) => list.map((el) => cachedToggle(el, 'dead')));
  const slots = [...document.querySelectorAll('#slots span')];
  const slotOn = slots.map((el) => cachedToggle(el, 'on'));
  const slotHidden = slots.map(() => null);
  const crosshair = $('crosshair').children;
  const hitmarker = $('hitmarker');
  const progress = $('progress');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerCopy = $('banner-copy');
  const spectate = $('spectate');
  const feed = $('feed');
  const board = $('board');
  const moneyGain = $('money-gain');
  let hitTime = 0;
  let hurtFlash = 0;
  let bannerTime = 0;
  let gainTime = 0;
  let lastGap = -1;
  let boardTimer = 0;
  let lastMoney = -1;
  let lastViewer = null;
  const feedItems = [];

  function showBanner(title, copy, seconds, tone = '') {
    bannerTitle.textContent = title;
    bannerTitle.className = tone;
    bannerCopy.textContent = copy;
    banner.hidden = false;
    bannerTime = seconds;
  }

  function addFeed(e, viewer) {
    const row = document.createElement('div');
    row.className = 'chip';
    if (viewer && (e.actor === viewer || e.target === viewer)) row.classList.add('mine');
    const killer = e.actor ? `<b class="${e.actor.team === RAIDERS ? 'raider' : 'warden'}">${e.actor.name}</b>` : '';
    const victim = `<b class="${e.target.team === RAIDERS ? 'raider' : 'warden'}">${e.target.name}</b>`;
    row.innerHTML = `${killer}<span class="gun">${e.weapon === 'bomb' ? 'charge' : nameOf(e.weapon).split(' ')[0]}</span>${e.a ? '<span class="hs">HEAD</span>' : ''}${victim}`;
    feed.appendChild(row);
    feedItems.push({ row, age: 0 });
    if (feedItems.length > 6) feedItems.shift().row.remove();
  }

  function renderBoard(viewer) {
    const rows = (team) => sim.actors
      .filter((a) => a.team === team)
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map((a) => {
        const money = viewer && a.team === viewer.team ? `$${a.money}` : '';
        const tag = a.hasBomb ? ' ◆' : a.kit ? ' ✚' : '';
        return `<tr class="${a.alive ? '' : 'dead'} ${a === sim.player ? 'me' : ''}"><td>${a.name}${tag}</td><td class="num">${a.kills}</td><td class="num">${a.deaths}</td><td class="num">${money}</td></tr>`;
      })
      .join('');
    const table = (team) => `<table><thead><tr><th class="${team === RAIDERS ? 'raider' : 'warden'}">${TEAMS[team]} · ${sim.round.state.score[team]}</th><th class="num">K</th><th class="num">D</th><th class="num">Money</th></tr></thead><tbody>${rows(team)}</tbody></table>`;
    board.innerHTML = `<h2><span>Kiln Yard · Round ${sim.round.state.number}</span><span>First to ${ROUNDS_TO_WIN}</span></h2>${table(RAIDERS)}${table(WARDENS)}`;
  }

  function prompt(viewer) {
    const round = sim.round.state;
    if (!viewer || !viewer.alive || viewer !== sim.player) return '';
    if (viewer.using > 0) return viewer.team === RAIDERS ? 'Planting the charge…' : 'Defusing…';
    if (viewer.hasBomb && round.phase === PHASE.LIVE && sim.round.siteAt(viewer.body.x, viewer.body.z) >= 0) return 'Hold E to plant the charge';
    const bomb = round.bomb;
    if (viewer.team === WARDENS && bomb.state === 'planted' && Math.hypot(bomb.x - viewer.body.x, bomb.z - viewer.body.z) < 1.7) return viewer.kit ? 'Hold E to defuse (kit)' : 'Hold E to defuse';
    if (sim.round.buyOpen(viewer) && round.phase === PHASE.FREEZE) return 'Press B to buy';
    return '';
  }

  return {
    show(on) {
      hud.hidden = !on;
    },
    toggleBoard(on, viewer) {
      board.hidden = !on;
      if (on) renderBoard(viewer);
    },

    onEvent(e, viewer) {
      const round = sim.round.state;
      switch (e.type) {
        case EV.HIT:
          if (viewer && e.actor === viewer) {
            hitTime = 0.12;
            hitmarker.classList.add('on');
            hitmarker.classList.toggle('kill', e.target.hp <= 0);
          }
          if (viewer && e.target === viewer) hurtFlash = 0.5;
          break;
        case EV.KILL:
          addFeed(e, viewer);
          break;
        case EV.ROUND_START:
          showBanner(`Round ${round.number}`, round.number === 1 ? 'Pistols only money. Press B to buy, then go.' : 'Buy time. Press B to open the buy menu.', 99);
          for (const item of feedItems) item.row.remove();
          feedItems.length = 0;
          break;
        case EV.ROUND_LIVE:
          showBanner('Go', viewer && viewer.team === RAIDERS ? 'Take the charge to site A or B.' : 'Hold the sites. Stop the plant.', 1.6);
          break;
        case EV.PLANTED:
          showBanner(`Charge planted at ${SITES[e.a].name}`, `${BOMB_TIME} seconds to detonation.`, 2.6, 'raider');
          break;
        case EV.ROUND_END: {
          const loser = TEAMS[1 - e.a];
          const reason = REASONS[e.b].replace('{loser}', loser);
          const mvp = sim.actors.filter((a) => a.team === e.a).sort((a, b) => b.roundKills - a.roundKills)[0];
          const extra = mvp && mvp.roundKills > 0 ? ` · MVP ${mvp.name} (${mvp.roundKills} kill${mvp.roundKills > 1 ? 's' : ''})` : '';
          showBanner(`${TEAMS[e.a]} win the round`, reason + extra, 99, e.a === RAIDERS ? 'raider' : 'warden');
          break;
        }
        default:
      }
    },

    // Once a frame, for the actor the camera is in; fov in degrees for the crosshair.
    update(viewer, dt, fov) {
      const round = sim.round.state;
      ui.score[0](String(round.score[0]));
      ui.score[1](String(round.score[1]));
      for (let team = 0; team < 2; team += 1) {
        let k = 0;
        for (const a of sim.actors) {
          if (a.team !== team) continue;
          pipDead[team][k](!a.alive);
          k += 1;
        }
      }
      const planted = round.phase === PHASE.PLANTED;
      ui.planted(planted);
      ui.timer(Math.max(0, Math.ceil(round.timer)));
      ui.timerLow(!planted && round.phase === PHASE.LIVE && round.timer < 15);
      ui.roundLabel(round.phase + round.number * 8);

      bannerTime -= dt;
      if (bannerTime <= 0) banner.hidden = true;
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
      if (!board.hidden) {
        boardTimer -= dt;
        if (boardTimer <= 0) {
          boardTimer = 0.25;
          renderBoard(viewer);
        }
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
      const id = heldId(viewer);
      const gun = heldGun(viewer);
      if (viewer.slot === SLOT_GRENADE) {
        ui.weapon(nameOf(id));
        ui.mag(viewer.nades[id]);
        ui.reserve(-1);
      } else if (viewer.slot === SLOT_BOMB) {
        ui.weapon('Demolition charge');
        ui.mag(1);
        ui.reserve(-1);
      } else if (gun.def.kind === 'melee') {
        ui.weapon(gun.def.name);
        ui.mag('–');
        ui.reserve(-1);
      } else {
        ui.weapon(viewer.reloading > 0 ? 'Reloading…' : gun.def.name);
        ui.mag(gun.mag);
        ui.reserve(gun.reserve);
      }
      ui.magEmpty(gun !== null && gun.def.kind === 'gun' && gun.mag === 0);
      for (let s = 0; s < slots.length; s += 1) {
        const slot = s + 1;
        const has = slot === SLOT_PRIMARY ? viewer.primary !== null
          : slot === SLOT_SECONDARY ? viewer.secondary !== null
            : slot === SLOT_GRENADE ? viewer.nades.frag + viewer.nades.smoke + viewer.nades.flash > 0
              : slot === SLOT_BOMB ? viewer.hasBomb : true;
        if (slotHidden[s] !== !has) {
          slotHidden[s] = !has;
          slots[s].hidden = !has;
        }
        slotOn[s](viewer.slot === slot);
      }
      ui.callout(CALLOUTS[calloutAt(cellIndex(viewer.body.x, viewer.body.z))]?.[0] ?? '');

      // The crosshair opens with the actual spread cone.
      const sniper = gun && gun.def.scope;
      ui.scope(viewer.scoped && viewer.alive);
      const spread = inaccuracy(viewer);
      const gap = Math.round(4 + (Math.tan(spread) * window.innerHeight * 0.5) / Math.tan((fov * Math.PI) / 360));
      ui.crosshair(viewer.alive && !sniper && viewer.slot !== SLOT_BOMB);
      if (gap !== lastGap) {
        lastGap = gap;
        crosshair[0].style.transform = `translateY(${-gap - 8}px)`;
        crosshair[1].style.transform = `translateY(${gap}px)`;
        crosshair[2].style.transform = `translateX(${-gap - 8}px)`;
        crosshair[3].style.transform = `translateX(${gap}px)`;
      }
      // Opacities and angles go through as hundredths so equal frames compare equal.
      const hurtLeft = viewer.alive ? Math.max(0, 1 - viewer.hurtAge / 1.2) : 0;
      ui.damage(Math.round(hurtLeft * 100));
      if (hurtLeft > 0) ui.damageTurn(Math.round(-(viewer.hurtFrom - viewer.body.yaw - Math.PI) * 100));
      hurtFlash = Math.max(0, hurtFlash - dt);
      ui.hurt(viewer.alive ? Math.round(Math.min(1, hurtFlash * 1.6) * 100) : 60);
      ui.flash(Math.round(Math.min(1, viewer.blind / 2.2) * 100));

      ui.prompt(prompt(viewer));
      progress.hidden = !(viewer.using > 0);
      if (viewer.using > 0) ui.progress(Math.round(viewer.using * 100));
      const watching = viewer !== sim.player;
      spectate.hidden = !watching;
      if (watching) ui.spectate(viewer.id);
    },
  };
}
