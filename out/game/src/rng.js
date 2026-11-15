// The one seeded random stream (mulberry32). The simulation draws only from it, so a seed and
// the same inputs replay the same match; rendering and audio never touch it.
export function createRng(seed) {
  let a = seed | 0;
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (count) => Math.floor(next() * count),
    chance: (p) => next() < p,
  };
}
