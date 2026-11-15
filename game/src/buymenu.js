// The buy menu: the SHOP's columns as buttons with price and a line of stats, greyed when
// unaffordable or already owned. A number picks a column and a second number an item, or
// the mouse clicks one. Purchases go back through onBuy; the menu holds no game state.
import { SHOP, WEAPONS, GRENADES, GEAR, priceOf } from './weapons.js';
import { canBuy } from './actors.js';

function blurb(id) {
  const w = WEAPONS[id];
  if (w) return `${w.damage}${w.pellets > 1 ? `×${w.pellets}` : ''} dmg · ${Math.round(60 / w.rate)} rpm · ${w.mag} rds${w.scope ? ' · scope' : ''}`;
  if (GRENADES[id]) return { frag: 'Blast damage in a radius', flash: 'Blinds anyone looking', smoke: 'Blocks sight for 17 s' }[id];
  return { vest: 'Armor 100', helmet: 'Armor 100 + head cover', kit: 'Halves defuse time' }[id];
}

export function createBuyMenu(onBuy) {
  const root = document.getElementById('buy');
  const cols = document.getElementById('buy-cols');
  const money = document.getElementById('buy-money');
  const buttons = [];
  let column = -1;
  let actor = null;

  SHOP.forEach((group, c) => {
    const col = document.createElement('div');
    const title = document.createElement('h3');
    title.innerHTML = `<kbd>${c + 1}</kbd> ${group.title}`;
    col.appendChild(title);
    group.items.forEach((id, k) => {
      const button = document.createElement('button');
      button.type = 'button';
      const def = WEAPONS[id] ?? GRENADES[id] ?? GEAR[id];
      button.innerHTML = `<b>${def.name}</b><small>$${priceOf(id)}</small><em>${blurb(id)}</em><kbd>${c + 1}·${k + 1}</kbd>`;
      button.addEventListener('click', () => onBuy(id));
      col.appendChild(button);
      buttons.push({ id, button, column: c });
    });
    cols.appendChild(col);
  });

  function refresh() {
    if (!actor) return;
    money.textContent = `$${actor.money}`;
    for (const { id, button, column: c } of buttons) {
      const why = canBuy(actor, id);
      button.disabled = why !== '';
      button.classList.toggle('owned', why === 'owned');
      button.style.outline = c === column ? '1px solid rgba(240,168,48,0.35)' : '';
    }
  }

  return {
    get isOpen() {
      return !root.hidden;
    },
    open(buyer) {
      actor = buyer;
      column = -1;
      root.hidden = false;
      refresh();
    },
    close() {
      root.hidden = true;
      actor = null;
    },
    refresh,
    // Number-key navigation: the first digit picks a column, the second an item in it.
    digit(n) {
      if (column < 0) {
        if (n >= 1 && n <= SHOP.length) column = n - 1;
      } else {
        const id = SHOP[column].items[n - 1];
        column = -1;
        if (id) onBuy(id);
      }
      refresh();
    },
  };
}
