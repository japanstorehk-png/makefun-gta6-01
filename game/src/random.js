// Deterministic seeded RNG for repeatable city generation and shots.

export function createRng(seed = 1) {
  let s = (Number(seed) >>> 0) || 1;
  return function rng() {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

export function randRange(rng, min, max) {
  return min + (max - min) * rng();
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

export function choice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function chance(rng, p) {
  return rng() < p;
}
