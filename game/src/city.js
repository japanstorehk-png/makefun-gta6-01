// Costa Luna: the static city. Roads run on a loose grid; blocks between them hold
// procedural buildings (from a fixed seed, so the city is identical every run), parks,
// parking lots and three named landmarks the story pivots on — the Hotel Azure, the
// Costa Marina warehouse and Quill's Garage. Also the road graph that traffic and
// pedestrians follow, and the collision shapes for everything solid.
// Solara Keys note: the layout is authored for the shots — the coupe always parks at
// COUPE_SPOT outside the Hotel Azure, so both the title scene and mission 1 land there.

import { WORLD, makeRng, pick, between } from './config.js';

export const ROADS_X = [520, 1040, 1560, 2080, 2600, 3120];
export const ROADS_Y = [420, 940, 1460, 1980, 2340];
export const ROAD_HALF = 48;
export const LANE = 24;          // traffic drives this far right of a road's centreline
export const WALK_OFFSET = 62;   // peds walk this far right of it, on the kerb

// The ocean is west of Ocean Drive; the marina inlet cuts into the south-east dock apron.
// (The inlet starts south of the y=2340 road so traffic never drives into it.)
export const WATER = [
  { x: -400, y: -400, w: 760, h: WORLD.height + 800 },
  { x: 2600, y: 2430, w: 1200, h: 320 },
];
export const SAND = [{ x: 360, y: -400, w: 110, h: WORLD.height + 800 }];
export const DOCK_APRON = { x: 470, y: 2388, w: 2090, h: 252 };
export const NORTH_SCRUB = { x: 0, y: 0, w: WORLD.width, h: 372 };

// Named places the story and the minimap use.
export const HOTEL = { x: 770, y: 640, name: 'Hotel Azure' };
export const GARAGE = { x: 770, y: 2280, name: "Quill's Garage" };
export const WAREHOUSE = { x: 1660, y: 2410, name: 'Costa Marina warehouse' };
export const PARK_DROP = { x: 1820, y: 1200, name: 'Mirador Park' };
export const SPAWN = { x: 700, y: 2320 };
export const COUPE_SPOT = { x: 556, y: 700, angle: -Math.PI / 2 };

export const GIG_SPOTS = [
  { x: 1820, y: 1250, name: 'Mirador Park' },
  { x: 960, y: 900, name: 'Palm Strand' },
  { x: 2300, y: 700, name: 'Solara Heights' },
  { x: 2100, y: 2250, name: 'Costa Marina' },
  { x: 850, y: 1700, name: 'El Mercado' },
  { x: 3230, y: 1000, name: 'Solara Heights' },
];

const BUILDING_COLORS = [
  '#d8b46a', '#c96f5a', '#7fb3a6', '#c9c1b2', '#a8b8d0',
  '#d98f6b', '#8fae8b', '#b76a8b', '#c2a97a', '#94a0b5',
];

const DISTRICTS = [
  // [ixMin, ixMax, iyMin, iyMax, name]
  [0, 0, 0, 2, 'Palm Strand'],
  [0, 0, 3, 3, 'The Rustyard'],
  [1, 2, 0, 2, 'El Mercado'],
  [3, 5, 0, 1, 'Solara Heights'],
  [3, 5, 2, 2, 'El Mercado'],
  [1, 5, 3, 3, 'Costa Marina'],
];

export function districtAt(x, y) {
  if (y > 2360) return 'Costa Marina';
  if (x < 470) return 'Palm Strand';
  if (y < 372) return 'Solara Ridge';
  for (const [x0, x1, y0, y1, name] of DISTRICTS) {
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iy = y0; iy <= y1; iy += 1) {
        const b = blockRect(ix, iy);
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return name;
      }
    }
  }
  return 'Costa Luna';
}

export function blockRect(ix, iy) {
  const x0 = ix < ROADS_X.length - 1 ? ROADS_X[ix] + ROAD_HALF : 3168;
  const x1 = ix < ROADS_X.length - 1 ? ROADS_X[ix + 1] - ROAD_HALF : 3552;
  return { x0, y0: ROADS_Y[iy] + ROAD_HALF, x1, y1: ROADS_Y[iy + 1] - ROAD_HALF };
}

// ---------------------------------------------------------------------------
// City construction
// ---------------------------------------------------------------------------

const FIXED_SEED = 1337; // the city itself never changes between runs

export function buildCity() {
  const rng = makeRng(FIXED_SEED);
  const blocks = [];
  const colliders = [];
  const trees = [];
  const props = [];
  const parkedSpots = [];

  for (let ix = 0; ix < 6; ix += 1) {
    for (let iy = 0; iy < 4; iy += 1) {
      const r = blockRect(ix, iy);
      const block = { ...r, ix, iy, kind: 'built', district: districtAt((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), buildings: [] };

      if (ix === 0 && iy === 0) buildHotel(block, colliders, trees, props);
      else if (ix === 2 && iy === 1) buildPark(block, trees, props);
      else if (ix === 0 && iy === 3) buildGarage(block, colliders, props, parkedSpots);
      else if (iy === 3 && (ix === 3 || ix === 4)) buildWarehouses(block, colliders, props);
      else if ((ix === 1 && iy === 2) || (ix === 3 && iy === 1) || (ix === 2 && iy === 3)) buildLot(block, parkedSpots);
      else if (ix === 5 && iy === 0) buildHeightsPlaza(block, trees);
      else buildBlockBuildings(block, rng, colliders, trees, props);

      blocks.push(block);
    }
  }

  buildDockStrip(colliders, props, trees);
  plantStreetTrees(trees, rng);
  placeCurbParks(parkedSpots);

  return { blocks, colliders, trees, props, parkedSpots };
}

function inset(cell, m) {
  return { x: cell.x + m, y: cell.y + m, w: Math.max(10, cell.w - m * 2), h: Math.max(10, cell.h - m * 2) };
}

function addBuilding(block, b, color, colliders, name) {
  const building = { ...b, color, shade: shadeColor(color, -0.22), name: name ?? null };
  block.buildings.push(building);
  colliders.push(building);
  return building;
}

/** Generic downtown blocks: a loose 2x2 (or 2x3) of buildings with courtyards. */
function buildBlockBuildings(block, rng, colliders, trees, props) {
  const cols = 2, rows = rng() < 0.5 ? 2 : 3;
  const cw = (block.x1 - block.x0) / cols, ch = (block.y1 - block.y0) / rows;
  for (let cx = 0; cx < cols; cx += 1) {
    for (let cy = 0; cy < rows; cy += 1) {
      if (rng() < 0.12) {
        // Courtyard: a couple of trees and market stalls instead of a building.
        const cell = { x: block.x0 + cx * cw, y: block.y0 + cy * ch, w: cw, h: ch };
        trees.push({ x: cell.x + cell.w / 2, y: cell.y + cell.h / 2, r: 26, palm: rng() < 0.4 });
        if (rng() < 0.5) props.push({ type: 'stall', ...inset(cell, ch * 0.3), color: pick(rng, BUILDING_COLORS) });
        continue;
      }
      const cell = inset({ x: block.x0 + cx * cw, y: block.y0 + cy * ch, w: cw, h: ch }, 14);
      const w = between(rng, cell.w * 0.72, cell.w * 0.94);
      const h = between(rng, cell.h * 0.66, cell.h * 0.92);
      const b = {
        x: cell.x + rng() * (cell.w - w), y: cell.y + rng() * (cell.h - h), w, h,
        acs: [{ dx: rng() * w * 0.6 + 8, dy: rng() * h * 0.6 + 8, s: between(rng, 9, 16) }],
      };
      addBuilding(block, b, pick(rng, BUILDING_COLORS), colliders);
    }
  }
}

/** Hotel Azure: the beachfront landmark with its pool and valet forecourt. */
function buildHotel(block, colliders, trees, props) {
  const hotel = addBuilding(block, { x: 596, y: 496, w: 356, h: 218, acs: [{ dx: 40, dy: 30, s: 18 }, { dx: 260, dy: 120, s: 14 }] }, '#3fb0c9', colliders, 'HOTEL AZURE');
  hotel.tower = true;
  props.push({ type: 'pool', x: 620, y: 766, w: 150, h: 88 });
  props.push({ type: 'sign', x: 620, y: 730, w: 0, h: 0, text: 'HOTEL AZURE' });
  for (const [x, y] of [[580, 760], [580, 860], [790, 860], [960, 500], [960, 590], [770, 880]]) {
    trees.push({ x, y, r: 24, palm: true });
  }
}

/** Mirador Park: grass, a pond, paths and the bench the case gets dropped at. */
function buildPark(block, trees, props) {
  block.kind = 'park';
  props.push({ type: 'pond', x: 1690, y: 1130, w: 190, h: 120 });
  props.push({ type: 'path', x: 1608, y: 1190, w: 424, h: 34 });
  props.push({ type: 'bench', x: 1790, y: 1226, w: 44, h: 14 });
  const spots = [[1660, 1030], [1960, 1060], [1650, 1360], [1990, 1340], [1750, 1080], [1900, 1260], [1830, 1380], [1620, 1240]];
  for (const [x, y] of spots) trees.push({ x, y, r: between(makeRng(x * 7 + y), 20, 32), palm: false });
}

/** Quill's Garage: rust-red workshop with a yard of drums and tyres. */
function buildGarage(block, colliders, props, parkedSpots) {
  const g = addBuilding(block, { x: 600, y: 2060, w: 348, h: 196, acs: [{ dx: 30, dy: 24, s: 14 }] }, '#b8543f', colliders, "QUILL'S GARAGE");
  g.door = true;
  for (let i = 0; i < 7; i += 1) {
    props.push({ type: 'drum', x: 960 - i * 0 - 34, y: 2100 + i * 26, w: 18, h: 18 });
  }
  for (let i = 0; i < 5; i += 1) props.push({ type: 'tyre', x: 640 + i * 30, y: 2272, w: 16, h: 16 });
  parkedSpots.push({ x: 700, y: 2210, angle: Math.PI / 2 });
  parkedSpots.push({ x: 770, y: 2210, angle: Math.PI / 2 });
}

/** Dockside blocks: big anonymous warehouses. */
function buildWarehouses(block, colliders, props) {
  const name = block.ix === 3 ? 'COSTA FREIGHT' : 'LUNA COLD STORE';
  addBuilding(block, { x: block.x0 + 30, y: block.y0 + 30, w: 340, h: 170, acs: [{ dx: 60, dy: 40, s: 16 }] }, '#8b939e', colliders, name);
  for (let i = 0; i < 6; i += 1) {
    props.push({ type: 'crate', x: block.x0 + 60 + i * 62, y: block.y1 - 58, w: 30, h: 30 });
  }
}

/** The Marina warehouse itself, on the south dock apron by the inlet. */
function buildDockStrip(colliders, props, trees) {
  const w = { x: 1450, y: 2430, w: 430, h: 180, color: '#9aa3ad', shade: '#6f7884', name: 'COSTA MARINA WAREHOUSE', acs: [{ dx: 80, dy: 40, s: 18 }] };
  colliders.push(w);
  const w2 = { x: 520, y: 2440, w: 330, h: 150, color: '#8b939e', shade: '#67707c', name: 'FISH CO.', acs: [{ dx: 40, dy: 30, s: 12 }] };
  colliders.push(w2);
  for (let i = 0; i < 8; i += 1) props.push({ type: 'crate', x: 1930 + (i % 4) * 46, y: 2440 + Math.floor(i / 4) * 46, w: 32, h: 32 });
  for (let i = 0; i < 4; i += 1) props.push({ type: 'crate', x: 1100 + i * 50, y: 2560, w: 32, h: 32 });
  // Piers over the inlet, and moored boats.
  props.push({ type: 'pier', x: 2620, y: 2440, w: 330, h: 26 });
  props.push({ type: 'pier', x: 3080, y: 2520, w: 280, h: 26 });
  props.push({ type: 'boat', x: 2870, y: 2520, w: 90, h: 26 });
  props.push({ type: 'boat', x: 3260, y: 2450, w: 70, h: 22 });
  props.push({ type: 'boat', x: 3400, y: 2560, w: 96, h: 28 });
  for (let i = 0; i < 5; i += 1) trees.push({ x: 900 + i * 380, y: 2404, r: 22, palm: true });
}

/** Solara Heights plaza: towers around a palm court. */
function buildHeightsPlaza(block, trees) {
  trees.push({ x: 1850, y: 660, r: 28, palm: true });
  trees.push({ x: 3360, y: 620, r: 28, palm: true });
  trees.push({ x: 3360, y: 760, r: 28, palm: true });
}

/** Parking lots: painted stalls, each with a steal-able car. */
function buildLot(block, parkedSpots) {
  block.kind = 'lot';
  const x0 = block.x0 + 40, y0 = block.y0 + 60;
  for (let i = 0; i < 6; i += 1) {
    parkedSpots.push({ x: x0 + i * 60, y: y0, angle: Math.PI / 2 });
    parkedSpots.push({ x: x0 + i * 60, y: y0 + 150, angle: -Math.PI / 2 });
  }
}

function plantStreetTrees(trees, rng) {
  // Palms line Ocean Drive; stragglers on the north scrub ridge.
  for (let y = 480; y < 2360; y += 260) trees.push({ x: 500, y: y + rng() * 40, r: 22, palm: true });
  for (let i = 0; i < 14; i += 1) trees.push({ x: 120 + rng() * 3200, y: 140 + rng() * 160, r: between(rng, 18, 30), palm: false });
}

function placeCurbParks(parkedSpots) {
  parkedSpots.push({ x: 1092, y: 700, angle: -Math.PI / 2 });   // outside the hotel, east kerb
  parkedSpots.push({ x: 1092, y: 780, angle: -Math.PI / 2 });
  parkedSpots.push({ x: 1620, y: 906, angle: 0 });              // by Mirador Park
  parkedSpots.push({ x: 2652, y: 1908, angle: 0 });             // Costa Marina kerb
}

export function shadeColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = clampByte(((n >> 16) & 255) + 255 * amount);
  const g = clampByte(((n >> 8) & 255) + 255 * amount);
  const b = clampByte((n & 255) + 255 * amount);
  return `rgb(${r},${g},${b})`;
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ---------------------------------------------------------------------------
// Road graph: nodes at every intersection, edges along each road segment.
// Traffic and pedestrians both walk this graph, offset to their right so cars
// keep to a lane and peds keep to the kerb.
// ---------------------------------------------------------------------------

export function buildGraph() {
  const nodes = [];
  const idOf = (ix, iy) => iy * ROADS_X.length + ix;
  for (let iy = 0; iy < ROADS_Y.length; iy += 1) {
    for (let ix = 0; ix < ROADS_X.length; ix += 1) {
      nodes[idOf(ix, iy)] = { id: idOf(ix, iy), x: ROADS_X[ix], y: ROADS_Y[iy], ix, iy };
    }
  }
  const edges = [];
  const adj = nodes.map(() => []);
  function link(a, b) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const edge = { a, b, len, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len, index: edges.length };
    edges.push(edge);
    adj[a.id].push(edge);
    adj[b.id].push(edge);
  }
  for (let iy = 0; iy < ROADS_Y.length; iy += 1) {
    for (let ix = 0; ix < ROADS_X.length - 1; ix += 1) link(nodes[idOf(ix, iy)], nodes[idOf(ix + 1, iy)]);
  }
  for (let ix = 0; ix < ROADS_X.length; ix += 1) {
    for (let iy = 0; iy < ROADS_Y.length - 1; iy += 1) link(nodes[idOf(ix, iy)], nodes[idOf(ix, iy + 1)]);
  }
  return { nodes, edges, adj };
}

/** Closest point on the graph to (x, y): used to re-attach fleeing peds and spawn traffic. */
export function nearestEdgePoint(graph, x, y) {
  let best = null, bestD = Infinity;
  for (const edge of graph.edges) {
    const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y;
    const t = clampT(((x - edge.a.x) * dx + (y - edge.a.y) * dy) / (edge.len * edge.len));
    const px = edge.a.x + dx * t, py = edge.a.y + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < bestD) { bestD = d; best = { edge, t, px, py }; }
  }
  return best;
}

function clampT(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** A point on a random edge whose distance to (x, y) lands in [lo, hi]. */
export function edgePointNear(graph, rng, x, y, lo, hi) {
  for (let i = 0; i < 40; i += 1) {
    const edge = graph.edges[Math.floor(rng() * graph.edges.length) % graph.edges.length];
    const t = rng();
    const px = edge.a.x + (edge.b.x - edge.a.x) * t;
    const py = edge.a.y + (edge.b.y - edge.a.y) * t;
    const d = Math.hypot(px - x, py - y);
    if (d >= lo && d <= hi) return { edge, t, px, py };
  }
  const edge = graph.edges[0];
  return { edge, t: 0.5, px: edge.a.x, py: edge.a.y };
}
