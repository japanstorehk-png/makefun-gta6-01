// Costa Luna city layout: seeded road graph, places, and navigation helpers.
import { WORLD, PLACES, ROAD_HALF } from './config.js';
import { createRng, choice, randRange } from './random.js';

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function addNode(nodes, x, y) {
  const nx = clamp(Math.round(x), 80, WORLD.width - 80);
  const ny = clamp(Math.round(y), 80, WORLD.height - 80);
  for (const n of nodes) {
    if (Math.hypot(n.x - nx, n.y - ny) < 30) return n.id;
  }
  const id = nodes.length;
  nodes.push({ id, x: nx, y: ny, edges: [] });
  return id;
}

function addEdge(nodes, edges, a, b) {
  if (a === b) return;
  if (edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return;
  edges.push({ a, b });
  if (!nodes[a].edges.includes(b)) nodes[a].edges.push(b);
  if (!nodes[b].edges.includes(a)) nodes[b].edges.push(a);
}

function connectPath(nodes, edges, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = addNode(nodes, pts[i].x, pts[i].y);
    const b = addNode(nodes, pts[i + 1].x, pts[i + 1].y);
    addEdge(nodes, edges, a, b);
  }
}

export function createCity(seed = 1) {
  const rng = createRng(seed * 9973 + 17);
  const nodes = [];
  const edges = [];

  // Primary arterial grid-ish roads spanning the map (open world network).
  const horizontals = [220, 420, 760, 1100, 1420, 1620];
  const verticals = [180, 520, 980, 1480, 1880];
  for (const y of horizontals) {
    const pts = [];
    for (const x of verticals) pts.push({ x: x + randRange(rng, -20, 20), y: y + randRange(rng, -25, 25) });
    connectPath(nodes, edges, pts);
  }
  for (const x of verticals) {
    const pts = [];
    for (const y of horizontals) pts.push({ x: x + randRange(rng, -20, 20), y: y + randRange(rng, -25, 25) });
    connectPath(nodes, edges, pts);
  }

  // Diagonal/connector roads to make loops and variety.
  connectPath(nodes, edges, [{x:180,y:220},{x:520,y:420},{x:980,y:760},{x:1480,y:1100},{x:1880,y:1420}]);
  connectPath(nodes, edges, [{x:1880,y:220},{x:1480,y:420},{x:980,y:760},{x:520,y:1100},{x:180,y:1620}]);
  connectPath(nodes, edges, [{x:520,y:220},{x:520,y:760},{x:520,y:1420}]);
  connectPath(nodes, edges, [{x:1480,y:220},{x:1480,y:760},{x:1480,y:1420}]);

  // Ensure each named place is connected to the road network.
  for (const p of PLACES) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h + 40;
    const near = nearestNode({ nodes }, cx, cy);
    const pid = addNode(nodes, cx, cy);
    if (near) addEdge(nodes, edges, pid, near.id);
    // extra spur
    const sx = clamp(cx + randRange(rng, -120, 120), 80, WORLD.width - 80);
    const sy = clamp(cy + randRange(rng, 60, 140), 80, WORLD.height - 80);
    const sid = addNode(nodes, sx, sy);
    addEdge(nodes, edges, pid, sid);
    const near2 = nearestNode({ nodes }, sx, sy, sid);
    if (near2) addEdge(nodes, edges, sid, near2.id);
  }

  // Add some local streets for density.
  for (let i = 0; i < 18; i++) {
    const x = randRange(rng, 200, WORLD.width - 200);
    const y = randRange(rng, 200, WORLD.height - 200);
    const a = addNode(nodes, x, y);
    const b = addNode(nodes, x + randRange(rng, -220, 220), y + randRange(rng, -220, 220));
    addEdge(nodes, edges, a, b);
    const na = nearestNode({ nodes }, nodes[a].x, nodes[a].y, a);
    const nb = nearestNode({ nodes }, nodes[b].x, nodes[b].y, b);
    if (na) addEdge(nodes, edges, a, na.id);
    if (nb) addEdge(nodes, edges, b, nb.id);
  }

  // Decorative city blocks/buildings (not the named places).
  const blocks = [];
  for (let i = 0; i < 26; i++) {
    const w = randRange(rng, 80, 180);
    const h = randRange(rng, 70, 160);
    const x = randRange(rng, 100, WORLD.width - w - 100);
    const y = randRange(rng, 100, WORLD.height - h - 100);
    if (PLACES.some(p => rectsOverlap(x, y, w, h, p.x - 20, p.y - 20, p.w + 40, p.h + 60))) continue;
    blocks.push({ x, y, w, h });
  }

  // Precompute edge geometry.
  const roadSegs = edges.map(e => {
    const a = nodes[e.a], b = nodes[e.b];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { ...e, ax: a.x, ay: a.y, bx: b.x, by: b.y, len, dx: (b.x - a.x)/len, dy: (b.y - a.y)/len };
  });

  return { nodes, edges, roadSegs, blocks, places: PLACES, seed };
}

export function nearestNode(city, x, y, excludeId = -1) {
  let best = null, bd = Infinity;
  for (const n of city.nodes) {
    if (n.id === excludeId) continue;
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

export function randomNode(city, rng) {
  return choice(rng, city.nodes);
}

export function nodeById(city, id) { return city.nodes[id]; }

export function neighbors(city, id) {
  return (city.nodes[id]?.edges || []).map(eid => city.nodes[eid]);
}

export function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function collidesBuilding(city, x, y, radius) {
  for (const p of city.places) {
    if (circleRect(x, y, radius, p.x, p.y, p.w, p.h)) return p;
  }
  for (const b of city.blocks) {
    if (circleRect(x, y, radius, b.x, b.y, b.w, b.h)) return b;
  }
  return null;
}

export function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx*dx + dy*dy < cr*cr;
}

export function constrainToWorld(x, y, r = 0) {
  return { x: clamp(x, r, WORLD.width - r), y: clamp(y, r, WORLD.height - r) };
}

export function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx*abx + aby*aby || 1;
  let t = (apx*abx + apy*aby) / ab2;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t, cy = ay + aby * t;
  return { d: Math.hypot(px - cx, py - cy), t, cx, cy };
}

export function onRoad(city, x, y, margin = 10) {
  for (const s of city.roadSegs) {
    if (distanceToSegment(x, y, s.ax, s.ay, s.bx, s.by).d <= ROAD_HALF + margin) return true;
  }
  return false;
}

export function randomRoadPoint(city, rng) {
  const seg = choice(rng, city.roadSegs);
  const t = randRange(rng, 0.1, 0.9);
  const side = randRange(rng, -ROAD_HALF * 0.4, ROAD_HALF * 0.4);
  // perpendicular offset
  const px = -seg.dy, py = seg.dx;
  return { x: seg.ax + (seg.bx - seg.ax) * t + px * side, y: seg.ay + (seg.by - seg.ay) * t + py * side, seg };
}

export function pickNextNode(city, currentId, prevId, rng) {
  const n = city.nodes[currentId];
  if (!n || n.edges.length === 0) return currentId;
  let opts = n.edges.filter(id => id !== prevId);
  if (opts.length === 0) opts = n.edges.slice();
  return choice(rng, opts);
}

export function placeById(id) {
  return PLACES.find(p => p.id === id);
}

export function nearestPlaceName(x, y) {
  let best = PLACES[0], bd = Infinity;
  for (const p of PLACES) {
    const cx = p.x + p.w/2, cy = p.y + p.h/2;
    const d = (cx - x)**2 + (cy - y)**2;
    if (d < bd) { bd = d; best = p; }
  }
  return best.name;
}
