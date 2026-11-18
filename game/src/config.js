// Solara Keys - configuration and tuning for Costa Luna.
// All gameplay numbers, names, colors, and layout constants live here.

export const TITLE = 'Solara Keys';
export const CITY_NAME = 'Costa Luna';
export const FIXER_NAME = 'Mara Quill';
export const POLICE_NAME = 'Luna PD';

export const PLACES = [
  { id: 'hotel_azure', name: 'Hotel Azure', x: 520, y: 420, w: 220, h: 140, color: '#4aa3ff' },
  { id: 'costa_marina', name: 'Costa Marina', x: 140, y: 980, w: 260, h: 160, color: '#2ec4b6' },
  { id: 'mirador_park', name: 'Mirador Park', x: 980, y: 180, w: 240, h: 200, color: '#55c271' },
  { id: 'solara_heights', name: 'Solara Heights', x: 1480, y: 360, w: 260, h: 180, color: '#f4a261' },
  { id: 'warehouse', name: 'Warehouse', x: 1500, y: 980, w: 240, h: 160, color: '#8d99ae' },
  { id: 'dock', name: 'Dock', x: 420, y: 1420, w: 280, h: 160, color: '#6c757d' },
  { id: 'plaza', name: 'Plaza', x: 980, y: 760, w: 220, h: 180, color: '#e9c46a' },
];

// World and rendering
export const WORLD = { width: 2200, height: 1800 };
export const VIEW = { width: 1280, height: 720 };
export const TILE = 40;
export const STEP = 1 / 60;
export const ROAD_HALF = 44;

// Player
export const PLAYER = {
  radius: 12,
  walkSpeed: 140,
  sprintSpeed: 230,
  maxHealth: 100,
  meleeRange: 34,
  meleeDamage: 34,
  meleeCooldown: 0.45,
  shootCooldown: 0.28,
  bulletSpeed: 720,
  bulletDamage: 28,
  bulletRange: 520,
};

// Vehicles
export const VEHICLE = {
  w: 44,
  h: 22,
  accel: 320,
  brake: 420,
  friction: 140,
  maxSpeed: 360,
  reverseSpeed: 160,
  turnRate: 2.6,
  handbrakeTurn: 4.4,
  handbrakeFriction: 360,
  hitDamageSpeed: 120,
  enterRadius: 52,
};

// NPCs
export const PED = {
  radius: 11,
  speed: 55,
  fleeSpeed: 120,
  count: 28,
};

export const TRAFFIC = {
  count: 18,
  speed: 120,
  maxSpeed: 170,
};

export const COP = {
  radius: 12,
  speed: 150,
  carSpeed: 330,
  shootRange: 420,
  shootCooldown: 0.9,
  bulletSpeed: 650,
  bulletDamage: 12,
  vision: 520,
  spawnCooldown: 4.5,
};

export const WANTED = {
  max: 5,
  decayTime: 14, // seconds out of sight per star step
  crimeSeenRadius: 260,
  carjackHeat: 1,
  shootHeat: 2,
  killHeat: 2,
};

export const ECONOMY = {
  startMoney: 120,
  mission1Reward: 350,
  mission2Reward: 500,
  sideJobReward: 180,
};

export const SAVE_KEY = 'solara-keys-save-v1';

// Palette
export const COLORS = {
  bg: '#1a2433',
  grass: '#223247',
  road: '#3a4657',
  roadLine: '#6b778c',
  sidewalk: '#46536a',
  water: '#1f5f78',
  building: '#2b3648',
  buildingStroke: '#4a5972',
  player: '#f7f7f2',
  playerStroke: '#111',
  ped: '#cdd6e3',
  pedFlee: '#ffd166',
  traffic: ['#7bdff2', '#b2f7ef', '#eff7f6', '#f7d6e0', '#cdb4db'],
  playerCar: '#ff6b6b',
  targetCar: '#ffd166',
  cop: '#4dabf7',
  copCar: '#1c7ed6',
  bullet: '#fff3bf',
  enemyBullet: '#ff8787',
  text: '#eef3fb',
  muted: '#a9b4c7',
  hudBg: 'rgba(10,16,24,0.55)',
  minimapBg: 'rgba(8,12,18,0.7)',
  accent: '#ffd166',
  danger: '#ff6b6b',
  success: '#51cf66',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Missions/objectives identifiers
export const MISSIONS = {
  INTRO: 'intro',
  DELIVER: 'deliver',
  LOSE_COPS: 'lose_cops',
  FREE_ROAM: 'free_roam',
};
