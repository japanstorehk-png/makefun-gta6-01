// Solara Keys — central tuning, palette and small shared helpers.
// Everything is drawn on a fixed 1280x720 logical canvas that is scaled to the window,
// so every number below is in logical pixels or seconds and never depends on the screen.
// Touching a cap here (cop counts, speeds, wanted level) retunes the whole game at once.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Costa Luna's extents, in world pixels. */
export const WORLD = { width: 3600, height: 2640 };

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives (this browser only). */
export const SAVE_KEY = 'solara-keys.save.v1';

export const START_MONEY = 250;

export const PLAYER = {
  walk: 172,
  sprint: 278,
  radius: 12,
  health: 100,
  meleeRange: 54,
  meleeDamage: 40,
  meleeCooldown: 0.45,
  fireCooldown: 0.17,
  bulletSpeed: 980,
  bulletDamage: 9,
};

export const CAR = {
  accel: 320,
  brake: 640,
  maxSpeed: 430,
  maxReverse: 140,
  grip: 8.5,
  driftGrip: 2.0,
  steerRate: 2.5,
};

/** Per-kind car specs: top speed and acceleration, in world px/s. */
export const CAR_SPECS = {
  civil:   { max: 300, accel: 250 },
  taxi:    { max: 320, accel: 265 },
  sports:  { max: 470, accel: 350 },
  special: { max: 520, accel: 385 },
  police:  { max: 480, accel: 365 },
};

export const TRAFFIC = { count: 20, speedMin: 150, speedMax: 235 };
export const PEDS = { count: 30, walkMin: 34, walkMax: 62 };

export const POLICE = {
  // Cop cars wanted on the road, by wanted level 0..5.
  maxCops: [0, 2, 3, 4, 6, 8],
  shootAt: 3,
  bulletDamage: 7,
  fireInterval: 0.9,
  sightRange: 640,
  ramDamage: 11,
  coolTime: 9,
};

export const WANTED_MAX = 5;

export const PALETTE = {
  water: '#1e5d86', waterDeep: '#164a70', foam: '#7fc4dd',
  sand: '#e6d19b', sandDark: '#d4b878',
  road: '#3a3e48', roadLine: '#cdbd8a', kerb: '#5a5f6a',
  sidewalk: '#9aa0aa', block: '#77808c', lot: '#555b66',
  grass: '#57a35e', grassDark: '#3f8a49', pond: '#3fa8c4',
  concrete: '#8d939e',
  text: '#f2f4f8', muted: '#a7aebc',
  gold: '#f2c14e', red: '#e2574c', green: '#5cbf6a', blue: '#4fa3dd',
  panel: 'rgba(13, 16, 26, 0.82)', panelLight: 'rgba(24, 28, 42, 0.9)',
};

export const CAR_COLORS = [
  '#d9564b', '#e88f3c', '#ecc95f', '#7fae5a', '#4f9ec4',
  '#5e6fae', '#9a5ea8', '#c4c8d0', '#3c414c', '#e0e4ea',
  '#b8623f', '#69a89e',
];

export const PED_COLORS = [
  '#e8b64c', '#d97742', '#c95a6b', '#6aa4d9', '#67b07a',
  '#9a6cc2', '#d8d3c5', '#5d6b80', '#b2543f', '#e0e4ea',
];

export const SKIN = ['#f0c8a0', '#d9a877', '#a8744c', '#7a5236', '#5c3a26'];

// ---------------------------------------------------------------------------
// Small math helpers shared across modules.
// ---------------------------------------------------------------------------

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angDiff(target, from) {
  let d = (target - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Deterministic little PRNG (mulberry32) — same seed, same city, same traffic. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

export function between(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

/** Scale and letterbox offsets that fit the fixed logical view into a window of w x h px. */
export function computeView(w, h) {
  const s = Math.min(w / VIEW.width, h / VIEW.height);
  return { s, ox: (w - VIEW.width * s) / 2, oy: (h - VIEW.height * s) / 2 };
}
