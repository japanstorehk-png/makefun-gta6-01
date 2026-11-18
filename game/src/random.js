// A small seeded random number generator (mulberry32): the same seed gives the same
// city, traffic pattern and screenshot scenes, making runs repeatable.

export function createRandom(seed) {
  let a = (seed >>> 0) || 1;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

export function choice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
