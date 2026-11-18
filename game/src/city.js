// Costa Luna's layout: a seeded road graph, named places and helpers for spawning
// traffic and pedestrians. The city is a small open grid of avenues and streets
// (not a single corridor) with landmarks placed around it.

import { PLACES, WORLD } from './config.js';
import { randRange, choice } from './random.js';

const MARGIN = 140;
const ROAD_HALF = 26;

export function createCity(rng) {
  // Build a grid of intersection nodes over the world bounds.
  const xs = [];
  const ys = [];
  const stepX = 360;
  const stepY = 320;
  for (let x = MARGIN; x <= WORLD.width - MARGIN; x += stepX) xs.push(x);
  for (let y = MARGIN; y <= WORLD.height - MARGIN; y += stepY) ys.push(y);

  const nodes = [];
  const nodeIndex = new Map();
  for (let iy = 0; iy < ys.length; iy++) {
    for (let ix = 0; ix < xs.length; ix++) {
      // Jitter slightly for variety but keep grid connectivity.
      const jx = (rng() - 0.5) * 40;
      const jy = (rng() - 0.5) * 40;
      const id = nodes.length;
      const node = { id, ix, iy, x: xs[ix] + jx, y: ys[iy] + jy, edges: [] };
      nodes.push(node);
      nodeIndex.set(`${ix},${iy}`, node);
    }
  }

  const edges = [];
  function connect(a, b) {
    if (!a || !b) return;
    // Avoid duplicate edges.
    if (a.edges.some((e) => e.to === b.id)) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const edgeAB = { from: a.id, to: b.id, len, dx: dx / len, dy: dy / len };
    const edgeBA = { from: b.id, to: a.id, len, dx: -dx / len, dy: -dy / len };
    edges.push(edgeAB, edgeBA);
    a.edges.push(edgeAB);
    b.edges.push(edgeBA);
  }

  // Connect grid neighbors to form an open road network.
  for (let iy = 0; iy < ys.length; iy++) {
    for (let ix = 0; ix < xs.length; ix++) {
      const n = nodeIndex.get(`${ix},${iy}`);
      if (ix < xs.length - 1) connect(n, nodeIndex.get(`${ix + 1},${iy}`));
      if (iy < ys.length - 1) connect(n, nodeIndex.get(`${ix},${iy + 1}`));
    }
  }
  // Add a few diagonal-ish shortcuts by connecting some non-adjacent-aligned nodes via nearest in row/col offsets.
  for (let i = 0; i < 6; i++) {
    const ix = Math.floor(rng() * (xs.length - 2));
    const iy = Math.floor(rng() * (ys.length - 2));
    const a = nodeIndex.get(`${ix},${iy}`);
    const b = nodeIndex.get(`${ix + 2},${iy}`);
    const c = nodeIndex.get(`${ix},${iy + 2}`);
    // occasionally skip to create slight variation but keep connectivity dense
    if (a && b && rng() < 0.5) connect(a, b);
    if (a && c && rng() < 0.5) connect(a, c);
  }

  // Derive road segments for rendering/collision hints (unique undirected).
  const segments = [];
  const seenSeg = new Set();
  for (const e of edges) {
    const key = e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`;
    if (seenSeg.has(key)) continue;
    seenSeg.add(key);
    const a = nodes[e.from];
    const b = nodes[e.to];
    segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
  }

  // Decorative blocks/water patches (non-road obstacles kept simple).
  const blocks = [
    { x: 820, y: 260, w: 120, h: 90 },
    { x: 260, y: 860, w: 100, h: 120 },
    { x: 1860, y: 860, w: 120, h: 120 },
    { x: 920, y: 1500, w: 140, h: 90 },
  ];
  const water = [
    { x: 1500, y: 1320, w: 520, h: 260 },
  ];

  function nearestNode(x, y) {
    let best = nodes[0];
    let bestD = Infinity;
    for (const n of nodes) {
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function randomNode(exceptId = -1) {
    let n = choice(rng, nodes);
    for (let i = 0; i < 8 && n.id === exceptId; i++) n = choice(rng, nodes);
    return n;
  }

  function pickNextEdge(node, prevNodeId) {
    if (!node.edges.length) return null;
    // Prefer not to immediately reverse, but allow if dead end.
    const options = node.edges.filter((e) => e.to !== prevNodeId);
    const pool = options.length ? options : node.edges;
    return choice(rng, pool);
  }

  function pointOnRoads() {
    // Pick a random segment and a point along it.
    const s = choice(rng, segments);
    const t = randRange(rng, 0.1, 0.9);
    return { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t };
  }

  function pointNear(x, y, radius) {
    const a = randRange(rng, 0, Math.PI * 2);
    const r = randRange(rng, 0, radius);
    return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
  }

  function placeById(id) {
    return PLACES.find((p) => p.id === id) || PLACES[0];
  }

  function clampToWorld(x, y, pad = 20) {
    return {
      x: Math.max(pad, Math.min(WORLD.width - pad, x)),
      y: Math.max(pad, Math.min(WORLD.height - pad, y)),
    };
  }

  return {
    nodes,
    edges,
    segments,
    blocks,
    water,
    roadHalf: ROAD_HALF,
    places: PLACES,
    nearestNode,
    randomNode,
    pickNextEdge,
    pointOnRoads,
    pointNear,
    placeById,
    clampToWorld,
  };
}
