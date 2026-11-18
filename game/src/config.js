// Solara Keys configuration: names, places, tuning, colours and key labels in one place.
// The city is a fixed logical world drawn in 2D; the camera follows the player.

export const TITLE = 'Solara Keys';
export const CITY_NAME = 'Costa Luna';
export const FIXER_NAME = 'Mara Quill';
export const POLICE_NAME = 'Luna PD';

export const PLACES = [
  { id: 'hotel', name: 'Hotel Azure', x: 520, y: 520, w: 220, h: 140, color: '#2b6cb0' },
  { id: 'marina', name: 'Costa Marina', x: 1560, y: 1180, w: 260, h: 160, color: '#0f766e' },
  { id: 'park', name: 'Mirador Park', x: 980, y: 860, w: 240, h: 180, color: '#2f855a' },
  { id: 'heights', name: 'Solara Heights', x: 1640, y: 360, w: 240, h: 180, color: '#805ad5' },
  { id: 'warehouse', name: 'Warehouse', x: 360, y: 1320, w: 220, h: 150, color: '#744210' },
  { id: 'dock', name: 'Dock', x: 1180, y: 1480, w: 260, h: 140, color: '#1e3a5f' },
  { id: 'plaza', name: 'Plaza', x: 1180, y: 520, w: 200, h: 160, color: '#b7791f' },
];

export const WORLD = { width: 2200, height: 1900 };

export const VIEW = { width: 1280, height: 720 };

export const STEP = 1 / 60;
export const MAX_FRAME = 0.25;

export const SAVE_KEY = 'solara-keys.save.v1';
export const BEST_KEY = 'solara-keys.best.v1';

export const PLAYER = {
  radius: 10,
  walkSpeed: 150,
  sprintSpeed: 240,
  maxHealth: 100,
  meleeRange: 34,
  meleeDamage: 28,
  meleeCooldown: 0.45,
  shootCooldown: 0.28,
  bulletSpeed: 760,
  bulletDamage: 34,
  bulletRange: 520,
};

export const VEHICLE = {
  width: 42,
  height: 22,
  maxSpeed: 320,
  accel: 220,
  brake: 300,
  friction: 90,
  turnRate: 2.6,
  handbrakeTurn: 4.2,
  handbrakeFriction: 260,
  enterRadius: 46,
};

export const TRAFFIC = {
  count: 14,
  speed: 120,
  maxSpeed: 150,
  stopDist: 42,
};

export const PED = { count: 18, speed: 38, radius: 9 };

export const WANTED = {
  max: 5,
  crimeHeat: 18, // heat needed per star step
  decayHidden: 6, // heat decay per second when hidden
  decayVisible: 1.5, // slower decay while police can see you
  sightRange: 420,
  loseTime: 8, // seconds hidden at low pressure to cool down a star
  policePerStar: 1,
  policeShootStar: 3,
  policeShotCooldown: 1.2,
};

export const MONEY = { start: 120, deliveryReward: 900, sideJobReward: 350, stealBonus: 150 };

export const PALETTE = {
  bg: '#0c1018',
  road: '#2b3340',
  roadLine: '#556070',
  grass: '#16241b',
  block: '#1f2937',
  blockEdge: '#334155',
  water: '#14324a',
  player: '#f7fafc',
  ped: '#cbd5e1',
  pedHit: '#f87171',
  car: '#60a5fa',
  carPlayer: '#f2c94c',
  carPolice: '#3b82f6',
  carTarget: '#f97316',
  text: '#eef1f5',
  muted: '#9fb0c8',
  accent: '#4fc3f7',
  danger: '#ef4444',
  money: '#86efac',
  star: '#facc15',
  panel: 'rgba(15, 23, 42, 0.82)',
  panelSolid: '#111827',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SCREENS = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSE: 'pause',
  WASTED: 'wasted',
  COMPLETE: 'complete',
};

export const CONTROLS_TEXT = [
  'WASD — move / drive',
  'Shift — sprint (on foot)',
  'E — enter / exit / steal car',
  'Space — handbrake (driving)',
  'F — melee attack',
  'Mouse — aim & shoot pistol',
  'Esc / P — pause',
  'Enter or Click — start / continue',
  'N — new game (title)',
];

export const HUD = { minimapSize: 170, minimapPad: 16 };
