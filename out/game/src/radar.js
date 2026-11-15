// The radar: Kiln Yard drawn once from the grid to an offscreen canvas, then each tick the
// teammates, the enemies someone on the team can see or just heard fire, the watcher's view
// cone and the charge where the watcher's team would know of it.
import { GRID, SITES, CELL, RAIDERS } from './level.js';
import { COLS, ROWS, cellX, cellZ, worldWidth, worldDepth } from './world.js';
import { PALETTE } from './palette.js';

const TICK = 1 / 15;
const TILE_COLOURS = {
  '#': 'rgba(20,22,26,0.95)',
  '.': PALETTE.sandDark,
  ',': PALETTE.concreteDark,
  a: PALETTE.stoneShade,
  b: PALETTE.stoneShade,
  c: PALETTE.wood,
  C: PALETTE.tealDark,
  h: PALETTE.concrete,
};

export function createRadar(canvas, sim) {
  const g = canvas.getContext('2d');
  const scale = Math.min(canvas.width / worldWidth, canvas.height / worldDepth);
  const offX = (canvas.width - worldWidth * scale) / 2;
  const offY = (canvas.height - worldDepth * scale) / 2;
  const px = (x) => offX + (x + worldWidth / 2) * scale;
  const py = (z) => offY + (z + worldDepth / 2) * scale;

  const base = document.createElement('canvas');
  base.width = canvas.width;
  base.height = canvas.height;
  const b = base.getContext('2d');
  const size = CELL * scale;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      b.fillStyle = TILE_COLOURS[GRID[row][col]];
      b.fillRect(Math.floor(px(cellX(col) - CELL / 2)), Math.floor(py(cellZ(row) - CELL / 2)), Math.ceil(size), Math.ceil(size));
    }
  }
  b.font = `700 ${Math.round(size * 2.4)}px system-ui, sans-serif`;
  b.textAlign = 'center';
  b.textBaseline = 'middle';
  b.fillStyle = PALETTE.terracotta;
  for (const site of SITES) b.fillText(site.name, px(cellX(site.plant[0])), py(cellZ(site.plant[1])));
  let tick = 0;

  function dot(x, z, colour, radius) {
    g.fillStyle = colour;
    g.beginPath();
    g.arc(px(x), py(z), radius, 0, Math.PI * 2);
    g.fill();
  }

  // An enemy shows when a living teammate's bot is looking right at it, or it has just fired.
  function spotted(enemy, team) {
    if (enemy.noiseAge < 0.6 && enemy.noise > 40) return true;
    for (const a of sim.actors) {
      if (a.alive && a.team === team && a.brain && a.brain.target === enemy && a.brain.visible) return true;
    }
    return false;
  }

  return {
    update(viewer, dt, playerSees) {
      tick -= dt;
      if (tick > 0) return;
      tick = TICK;
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(base, 0, 0);
      const team = viewer ? viewer.team : RAIDERS;
      for (const a of sim.actors) {
        if (!a.alive || a === viewer) continue;
        if (a.team === team) dot(a.body.x, a.body.z, a.team === RAIDERS ? PALETTE.raider : PALETTE.warden, 6);
        else if (spotted(a, team) || playerSees(a)) dot(a.body.x, a.body.z, PALETTE.blood, 6.5);
      }
      const bomb = sim.round.state.bomb;
      const known = bomb.state === 'planted' || team === RAIDERS;
      if (known && bomb.state !== 'defused' && bomb.state !== 'exploded') {
        const at = bomb.carrier ? bomb.carrier.body : bomb;
        g.fillStyle = bomb.state === 'planted' ? '#ff3b2f' : PALETTE.lamp;
        g.fillRect(px(at.x) - 5, py(at.z) - 12, 10, 7);
      }
      if (!viewer) return;
      const x = px(viewer.body.x);
      const y = py(viewer.body.z);
      const yaw = viewer.body.yaw;
      // Screen angle of the view direction (-sin yaw, -cos yaw) on a north-up map.
      const angle = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
      g.fillStyle = 'rgba(241,236,226,0.16)';
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, 44, angle - 0.6, angle + 0.6);
      g.closePath();
      g.fill();
      dot(viewer.body.x, viewer.body.z, PALETTE.stoneCap, 7);
      g.strokeStyle = PALETTE.gear;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(angle) * 11, y + Math.sin(angle) * 11);
      g.stroke();
    },
  };
}
