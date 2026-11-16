// The map as solid columns on a grid: every cell is a floor, or a column of stone, crate or
// container up to some height, and tunnel cells carry a roof. Bodies collide against columns,
// bullets and sight lines march the grid (DDA), and the merged rectangles feed the renderer.
import { GRID, CELL, ROOF_HEIGHT, TILE_TOP, CALLOUTS } from './level.js';

export const COLS = GRID[0].length;
export const ROWS = GRID.length;
const HALF_X = (COLS * CELL) / 2;
const HALF_Z = (ROWS * CELL) / 2;
const OPEN_SKY = 1e6;

const tile = new Uint8Array(COLS * ROWS);
const top = new Float32Array(COLS * ROWS);
const ceiling = new Float32Array(COLS * ROWS);
const callout = new Int8Array(COLS * ROWS).fill(-1);

// Greedy merge of same-tile cells into rectangles: the renderer draws one box per rectangle and
// each building rectangle gets one wall height.
export const rects = [];
const used = new Uint8Array(COLS * ROWS);
for (let row = 0; row < ROWS; row += 1) {
  for (let col = 0; col < COLS; col += 1) {
    if (used[row * COLS + col]) continue;
    const ch = GRID[row][col];
    let width = 1;
    while (col + width < COLS && !used[row * COLS + col + width] && GRID[row][col + width] === ch) width += 1;
    let depth = 1;
    grow: while (row + depth < ROWS) {
      for (let k = 0; k < width; k += 1) {
        if (used[(row + depth) * COLS + col + k] || GRID[row + depth][col + k] !== ch) break grow;
      }
      depth += 1;
    }
    const height = ch === '#' ? 4.6 + ((col * 7 + row * 13) % 5) * 0.8 : TILE_TOP[ch] ?? 0;
    rects.push({ ch, col, row, width, depth, height });
    for (let r = row; r < row + depth; r += 1) {
      for (let c = col; c < col + width; c += 1) {
        const index = r * COLS + c;
        used[index] = 1;
        tile[index] = ch.charCodeAt(0);
        top[index] = height;
        ceiling[index] = ch === ',' ? ROOF_HEIGHT : OPEN_SKY;
      }
    }
  }
}
for (let i = CALLOUTS.length - 1; i >= 0; i -= 1) {
  const [, c0, r0, c1, r1] = CALLOUTS[i];
  for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) callout[r * COLS + c] = i;
}

export const cellX = (col) => col * CELL - HALF_X + CELL / 2;
export const cellZ = (row) => row * CELL - HALF_Z + CELL / 2;
export const colOf = (x) => Math.floor((x + HALF_X) / CELL);
export const rowOf = (z) => Math.floor((z + HALF_Z) / CELL);
export const worldWidth = COLS * CELL;
export const worldDepth = ROWS * CELL;

export function cellIndex(x, z) {
  const col = colOf(x);
  const row = rowOf(z);
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return -1;
  return row * COLS + col;
}

export const walkable = (index) => index >= 0 && top[index] === 0;
export const tileAt = (index) => (index >= 0 ? String.fromCharCode(tile[index]) : '#');
export const calloutAt = (index) => (index >= 0 ? callout[index] : -1);

// The tallest column under a footprint; with `skipAbove` set, columns taller than that are left
// out (they are walls, not floor). Returns -1 when the footprint touches a roof below `head`.
export function footprintTop(x, z, radius, head, skipAbove) {
  const c0 = colOf(x - radius);
  const c1 = colOf(x + radius - 1e-6);
  const r0 = rowOf(z - radius);
  const r1 = rowOf(z + radius - 1e-6);
  let best = 0;
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return OPEN_SKY;
      const index = r * COLS + c;
      if (ceiling[index] < head) return -1;
      const h = top[index];
      if (h > best && h <= skipAbove) best = h;
      if (h > skipAbove) return OPEN_SKY;
    }
  }
  return best;
}

// March a ray through the grid. Returns the distance to the first solid surface (or maxDist)
// and leaves the surface normal in hit.nx/ny/nz.
export function raycast(ox, oy, oz, dx, dy, dz, maxDist, hit) {
  let col = colOf(ox);
  let row = rowOf(oz);
  const stepC = dx > 0 ? 1 : -1;
  const stepR = dz > 0 ? 1 : -1;
  const deltaX = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
  const deltaZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  let nextX = dx !== 0 ? ((dx > 0 ? cellX(col) + CELL / 2 : cellX(col) - CELL / 2) - ox) / dx : Infinity;
  let nextZ = dz !== 0 ? ((dz > 0 ? cellZ(row) + CELL / 2 : cellZ(row) - CELL / 2) - oz) / dz : Infinity;
  let t = 0;
  hit.nx = 0;
  hit.ny = 1;
  hit.nz = 0;
  let sideX = 0;
  let sideZ = 0;
  while (t < maxDist) {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return t;
    const index = row * COLS + col;
    const exit = Math.min(nextX, nextZ, maxDist);
    const yIn = oy + dy * t;
    const yOut = oy + dy * exit;
    const h = top[index];
    if (yIn < h - 1e-4) {
      hit.nx = sideX;
      hit.ny = 0;
      hit.nz = sideZ;
      return t;
    }
    if (yOut < h) {
      hit.nx = 0;
      hit.ny = 1;
      hit.nz = 0;
      return (h - oy) / dy;
    }
    const roof = ceiling[index];
    if (yIn > roof) {
      hit.nx = sideX;
      hit.ny = 0;
      hit.nz = sideZ;
      return t;
    }
    if (yOut > roof) {
      hit.nx = 0;
      hit.ny = -1;
      hit.nz = 0;
      return (roof - oy) / dy;
    }
    if (exit >= maxDist) return maxDist;
    t = exit;
    if (nextX < nextZ) {
      col += stepC;
      nextX += deltaX;
      sideX = -stepC;
      sideZ = 0;
    } else {
      row += stepR;
      nextZ += deltaZ;
      sideX = 0;
      sideZ = -stepR;
    }
  }
  return maxDist;
}

// What a surface is made of, from where a ray met it and the normal it left: the column behind
// a wall face, the floor of the cell under an upward face, the tunnel roof for a downward one.
const TILE_SURFACE = { '#': 'plaster', c: 'wood', C: 'metal', h: 'concrete', ',': 'concrete', a: 'stone', b: 'stone', '.': 'sand' };
export function surfaceAt(x, y, z, nx, ny, nz) {
  if (ny < -0.5) return 'concrete';
  const ch = tileAt(cellIndex(x - nx * 0.05, z - nz * 0.05));
  // Buildings stand on a stone plinth and wear stone caps; the plaster is in between.
  if (ch === '#' && (y < 0.55 || ny > 0.5)) return 'stone';
  return TILE_SURFACE[ch] ?? 'sand';
}

const sightHit = { nx: 0, ny: 0, nz: 0 };
export function clearLine(ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-6) return true;
  return raycast(ax, ay, az, dx / length, dy / length, dz / length, length, sightHit) >= length - 1e-3;
}
