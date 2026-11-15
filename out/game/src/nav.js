// Routes for the bots: A* over the walkable cells (eight neighbours, no corner cutting), then
// string-pulled so a bot walks straight lines between the corners it really has to turn at.
// All search state is preallocated; a query writes x,z pairs into the caller's Float32Array.
import { COLS, ROWS, cellX, cellZ, cellIndex, walkable, footprintTop } from './world.js';

const COUNT = COLS * ROWS;
const cost = new Float32Array(COUNT);
const from = new Int32Array(COUNT);
const seen = new Uint32Array(COUNT);
const closed = new Uint32Array(COUNT);
const heap = new Int32Array(COUNT * 4);
const heapKey = new Float32Array(COUNT * 4);
const chain = new Int32Array(COUNT);
// dc, dr, cost for the eight neighbours.
const STEPS = [1, 0, 1, -1, 0, 1, 0, 1, 1, 0, -1, 1, 1, 1, 1.4142, 1, -1, 1.4142, -1, 1, 1.4142, -1, -1, 1.4142];
let stamp = 0;
let heapSize = 0;

function push(index, key) {
  let i = heapSize;
  heapSize += 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heapKey[parent] <= key) break;
    heap[i] = heap[parent];
    heapKey[i] = heapKey[parent];
    i = parent;
  }
  heap[i] = index;
  heapKey[i] = key;
}

function pop() {
  const result = heap[0];
  heapSize -= 1;
  const index = heap[heapSize];
  const key = heapKey[heapSize];
  let i = 0;
  for (;;) {
    let child = i * 2 + 1;
    if (child >= heapSize) break;
    if (child + 1 < heapSize && heapKey[child + 1] < heapKey[child]) child += 1;
    if (heapKey[child] >= key) break;
    heap[i] = heap[child];
    heapKey[i] = heapKey[child];
    i = child;
  }
  heap[i] = index;
  heapKey[i] = key;
  return result;
}

function heuristic(index, goal) {
  const dx = Math.abs((index % COLS) - (goal % COLS));
  const dz = Math.abs(Math.floor(index / COLS) - Math.floor(goal / COLS));
  return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
}

// Can a body of this radius walk the straight segment? Sampled every 0.4 m.
export function clearWalk(ax, az, bx, bz, radius) {
  const length = Math.hypot(bx - ax, bz - az);
  const samples = Math.ceil(length / 0.4);
  for (let i = 1; i <= samples; i += 1) {
    const f = i / samples;
    if (footprintTop(ax + (bx - ax) * f, az + (bz - az) * f, radius, 1.8, 0.01) !== 0) return false;
  }
  return true;
}

// The nearest walkable cell to a point, searching outward ring by ring.
export function nearestWalkable(x, z) {
  const start = cellIndex(x, z);
  if (walkable(start)) return start;
  const col = start % COLS;
  const row = Math.floor(start / COLS);
  for (let ring = 1; ring < 6; ring += 1) {
    for (let dr = -ring; dr <= ring; dr += 1) {
      for (let dc = -ring; dc <= ring; dc += 1) {
        const c = col + dc;
        const r = row + dr;
        if (c >= 0 && r >= 0 && c < COLS && r < ROWS && walkable(r * COLS + c)) return r * COLS + c;
      }
    }
  }
  return start;
}

// Find a route from (sx,sz) to (gx,gz). Writes corner points into out (x,z pairs, the goal
// last) and returns how many points it wrote, 0 when there is no route.
export function findPath(sx, sz, gx, gz, out, radius) {
  const start = nearestWalkable(sx, sz);
  const goal = nearestWalkable(gx, gz);
  stamp += 1;
  heapSize = 0;
  cost[start] = 0;
  from[start] = -1;
  seen[start] = stamp;
  push(start, heuristic(start, goal));
  let found = start === goal;
  while (heapSize > 0 && !found) {
    const current = pop();
    if (closed[current] === stamp) continue;
    closed[current] = stamp;
    if (current === goal) {
      found = true;
      break;
    }
    const col = current % COLS;
    const row = Math.floor(current / COLS);
    for (let s = 0; s < STEPS.length; s += 3) {
      const dc = STEPS[s];
      const dr = STEPS[s + 1];
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const next = r * COLS + c;
      if (!walkable(next) || closed[next] === stamp) continue;
      if (dc !== 0 && dr !== 0 && (!walkable(row * COLS + c) || !walkable(r * COLS + col))) continue;
      const g = cost[current] + STEPS[s + 2];
      if (seen[next] === stamp && g >= cost[next]) continue;
      seen[next] = stamp;
      cost[next] = g;
      from[next] = current;
      push(next, g + heuristic(next, goal));
    }
  }
  if (!found) return 0;

  let length = 0;
  for (let at = goal; at !== -1; at = from[at]) chain[length++] = at;
  // chain runs goal..start; pull the string from the start end.
  let count = 0;
  let ax = sx;
  let az = sz;
  let i = length - 1;
  const max = out.length / 2 - 1;
  while (i > 0 && count < max) {
    let j = i - 1;
    while (j > 0 && clearWalk(ax, az, cellX(chain[j - 1] % COLS), cellZ(Math.floor(chain[j - 1] / COLS)), radius)) j -= 1;
    ax = cellX(chain[j] % COLS);
    az = cellZ(Math.floor(chain[j] / COLS));
    if (j === 0) break;
    out[count * 2] = ax;
    out[count * 2 + 1] = az;
    count += 1;
    i = j;
  }
  // A goal inside a wall is replaced by the centre of the walkable cell nearest to it.
  const snapped = goal !== cellIndex(gx, gz);
  out[count * 2] = snapped ? cellX(goal % COLS) : gx;
  out[count * 2 + 1] = snapped ? cellZ(Math.floor(goal / COLS)) : gz;
  return count + 1;
}
