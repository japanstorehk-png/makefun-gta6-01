// The world: everything that moves and every rule that moves it. Fixed 1/60 s steps
// advance the player, traffic and pedestrians on the road graph, police that answer to
// the wanted level, bullets, particles, pickups — and the mission line Mara Quill runs
// you through. Deterministic given a seed, so screenshots can stage a scene and replay it.
// Solara Keys note: the wanted level only cools after `coolTime` seconds out of sight,
// and every spawn — coupe, cops, gigs — flows from the one seed via makeRng.

import {
  STEP, WORLD, START_MONEY, PLAYER, CAR, CAR_SPECS, TRAFFIC, PEDS, POLICE, WANTED_MAX,
  CAR_COLORS, PED_COLORS, SKIN, clamp, lerp, dist, angDiff, makeRng, pick, between,
} from './config.js';
import {
  buildCity, buildGraph, WATER, GARAGE, WAREHOUSE, PARK_DROP, SPAWN, COUPE_SPOT,
  GIG_SPOTS, nearestEdgePoint, edgePointNear, districtAt, LANE, WALK_OFFSET,
} from './city.js';

const CAR_HP = { civil: 55, taxi: 55, sports: 65, special: 110, police: 85 };

export function createWorld(seed) {
  const world = {
    seed,
    time: 0,
    city: buildCity(),
    graph: buildGraph(),
    player: null,
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    pickups: [],
    coupe: null,
    wanted: 0,
    coolT: 0,
    shotHeat: 0,
    money: START_MONEY,
    mission: 0,
    stage: 0,
    dialogue: null,
    afterDialogue: null,
    banner: null,
    toast: null,
    marker: null,
    prompt: '',
    wasted: false,
    wastedT: 0,
    gig: null,
    gigCooldown: 8,
    cam: { x: SPAWN.x, y: SPAWN.y },
    shake: 0,
    district: '',
    spawnT: 0,
    copSpawnT: 0,
    sfx: [],
    rng: makeRng(seed),
    nextId: 1,
    freeRoamToastDone: false,
  };

  // -- lifecycle ------------------------------------------------------------

  world.reset = function reset(s) {
    world.seed = s;
    world.rng = makeRng(s);
    world.time = 0;
    world.cars.length = 0;
    world.peds.length = 0;
    world.bullets.length = 0;
    world.particles.length = 0;
    world.pickups.length = 0;
    world.coupe = null;
    world.wanted = 0;
    world.coolT = 0;
    world.shotHeat = 0;
    world.money = START_MONEY;
    world.mission = 0;
    world.stage = 0;
    world.dialogue = null;
    world.afterDialogue = null;
    world.banner = null;
    world.toast = null;
    world.marker = null;
    world.prompt = '';
    world.wasted = false;
    world.wastedT = 0;
    world.gig = null;
    world.gigCooldown = 8;
    world.shake = 0;
    world.district = districtAt(SPAWN.x, SPAWN.y);
    world.spawnT = 0;
    world.copSpawnT = 0;
    world.sfx.length = 0;
    world.freeRoamToastDone = false;
    world.player = {
      x: SPAWN.x, y: SPAWN.y, angle: -Math.PI / 2, vx: 0, vy: 0,
      health: PLAYER.health, inCar: null, meleeCd: 0, fireCd: 0, swing: 0,
      aimA: -Math.PI / 2, walkPhase: 0, lastHurt: -99, moving: false,
    };
    for (let i = 0; i < world.city.parkedSpots.length; i += 1) spawnParked(world, world.city.parkedSpots[i]);
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTraffic(world, true);
    for (let i = 0; i < PEDS.count; i += 1) spawnPed(world, true);
    scatterPickups(world);
    world.cam.x = SPAWN.x;
    world.cam.y = SPAWN.y;
  };

  world.newGame = function newGame() {
    world.reset((Math.random() * 4294967296) >>> 0);
  };

  world.saveState = function saveState() {
    return {
      v: 1,
      money: world.money,
      mission: world.mission,
      stage: world.stage,
      health: world.player.health,
      x: Math.round(world.player.x),
      y: Math.round(world.player.y),
      savedAt: Date.now(),
    };
  };

  world.applySave = function applySave(save) {
    world.reset((Math.random() * 4294967296) >>> 0);
    world.money = Number.isFinite(save.money) ? save.money : START_MONEY;
    world.mission = save.mission ?? 0;
    world.stage = save.stage ?? 0;
    world.player.health = save.health ?? PLAYER.health;
    world.player.x = save.x ?? SPAWN.x;
    world.player.y = save.y ?? SPAWN.y;
    world.district = districtAt(world.player.x, world.player.y);
    world.cam.x = clamp(world.player.x, 640, WORLD.width - 640);
    world.cam.y = clamp(world.player.y, 360, WORLD.height - 360);
    if (world.mission === 1 && !world.coupe) spawnCoupe(world);
    // Rebuild anything a mid-mission save implies; gigs are never persisted.
    world.gig = null;
    world.gigCooldown = 6;
  };

  // -- one simulation step ---------------------------------------------------

  world.step = function step(dt, input) {
    world.time += dt;
    updateFx(world, dt);
    if (world.wasted) return;
    updatePlayer(world, dt, input);
    updateCars(world, dt);
    updatePeds(world, dt);
    updateBullets(world, dt);
    updatePickups(world, dt);
    maintainSpawns(world, dt);
    updateWanted(world, dt);
    checkMissions(world);
    updateCamera(world, dt);
    updateDistrict(world);
    updateHud(world);
  };

  /** Frozen-world tick: only particles and the wasted fade keep moving. */
  world.stepFx = function stepFx(dt) {
    updateFx(world, dt);
  };

  world.advanceDialogue = function advanceDialogue() {
    if (!world.dialogue) return;
    world.sfx.push('blip');
    world.dialogue.index += 1;
    world.dialogue.t = 0;
    if (world.dialogue.index >= world.dialogue.lines.length) {
      world.dialogue = null;
      const after = world.afterDialogue;
      world.afterDialogue = null;
      if (after) after();
    }
  };

  world.respawn = function respawn() {
    const p = world.player;
    world.wasted = false;
    world.wastedT = 0;
    if (p.inCar) { p.inCar.driver = null; p.inCar = null; }
    p.x = SPAWN.x; p.y = SPAWN.y; p.vx = 0; p.vy = 0;
    p.health = PLAYER.health;
    world.wanted = 0;
    world.coolT = 0;
    world.money = Math.max(0, world.money - 100);
    for (const car of world.cars) if (car.kind === 'police') car.remove = true;
    world.toast = { text: 'Patched up at Quill\'s Garage — $100 lighter', t: 0, max: 3.4 };
  };

  world.reset(world.seed);
  return world;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

function makeCar(world, kind, x, y, angle, color) {
  const specs = CAR_SPECS[kind];
  return {
    id: world.nextId++, kind, x, y, angle,
    vx: Math.cos(angle) * 10, vy: Math.sin(angle) * 10,
    color, w: kind === 'special' ? 54 : 50,
    hp: CAR_HP[kind], maxHp: CAR_HP[kind],
    driver: null, wreck: false, stun: 0, siren: false, honkT: 0,
    from: null, to: null, t: 0, cruise: between(world.rng, TRAFFIC.speedMin, TRAFFIC.speedMax),
    ai: { mode: 'idle', fireCd: between(world.rng, 0.6, 1.4), stuckT: 0, revT: 0, leaveT: 0 },
    ramCd: 0, smokeT: 0, bumpT: 0, missionCar: false, delivered: false,
  };
}

function spawnParked(world, spot) {
  const kind = world.rng() < 0.14 ? 'sports' : world.rng() < 0.12 ? 'taxi' : 'civil';
  const car = makeCar(world, kind, spot.x, spot.y, spot.angle, kind === 'taxi' ? '#e8b83a' : pick(world.rng, CAR_COLORS));
  world.cars.push(car);
}

function spawnTraffic(world, anywhere) {
  const spot = anywhere
    ? edgePointNear(world.graph, world.rng, SPAWN.x, SPAWN.y, 150, 2600)
    : edgePointNear(world.graph, world.rng, world.player.x, world.player.y, 900, 1800);
  const car = makeCar(world, world.rng() < 0.1 ? 'taxi' : 'civil', spot.px, spot.py, 0, pick(world.rng, CAR_COLORS));
  attachToEdge(car, spot.edge, spot.t);
  car.driver = 'ai';
  car.ai.mode = 'drive';
  world.cars.push(car);
}

function attachToEdge(car, edge, t) {
  car.from = edge.a;
  car.to = edge.b;
  car.t = t;
  const ux = edge.b.x - edge.a.x, uy = edge.b.y - edge.a.y;
  car.angle = Math.atan2(uy, ux);
}

function spawnPed(world, anywhere) {
  const spot = anywhere
    ? edgePointNear(world.graph, world.rng, SPAWN.x, SPAWN.y, 100, 2400)
    : edgePointNear(world.graph, world.rng, world.player.x, world.player.y, 700, 1400);
  world.peds.push({
    id: world.nextId++,
    x: spot.px, y: spot.py, angle: 0,
    speed: between(world.rng, PEDS.walkMin, PEDS.walkMax),
    from: spot.edge.a, to: spot.edge.b, t: spot.t,
    state: 'walk', panic: 0, deadT: 0,
    shirt: pick(world.rng, PED_COLORS), skin: pick(world.rng, SKIN),
    phase: world.rng() * 10,
  });
}

function spawnCop(world) {
  const spot = edgePointNear(world.graph, world.rng, world.player.x, world.player.y, 720, 1300);
  const car = makeCar(world, 'police', spot.px, spot.py, 0, '#e8eaee');
  car.driver = 'ai';
  car.ai.mode = 'chase';
  car.siren = true;
  world.cars.push(car);
}

function spawnCoupe(world) {
  const car = makeCar(world, 'special', COUPE_SPOT.x, COUPE_SPOT.y, COUPE_SPOT.angle, '#f2d492');
  car.missionCar = true;
  world.coupe = car;
  world.cars.push(car);
}

function scatterPickups(world) {
  for (let i = 0; i < 14; i += 1) {
    const spot = edgePointNear(world.graph, world.rng, SPAWN.x, SPAWN.y, 200, 3200);
    const rx = -spot.edge.uy, ry = spot.edge.ux;
    world.pickups.push({
      x: spot.px + rx * WALK_OFFSET, y: spot.py + ry * WALK_OFFSET,
      amount: Math.floor(between(world.rng, 40, 160)), active: true, respawnT: 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------

function pushOutCircle(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  let dx = x - cx, dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }
  // Centre inside the rect: push along the shortest exit axis.
  const l = x - rect.x, rt = rect.x + rect.w - x, t = y - rect.y, b = rect.y + rect.h - y;
  const m = Math.min(l, rt, t, b);
  if (m === l) return { nx: -1, ny: 0, depth: l + r };
  if (m === rt) return { nx: 1, ny: 0, depth: rt + r };
  if (m === t) return { nx: 0, ny: -1, depth: t + r };
  return { nx: 0, ny: 1, depth: b + r };
}

const WALLS = [...WATER, { x: -60, y: -60, w: WORLD.width + 120, h: 420 }, { x: -60, y: 2400, w: 200, h: 400 }];

/** Resolve a circle against buildings, water and the world edge. Returns the corrected position. */
function resolveCircle(world, x, y, r) {
  let hit = null;
  for (const rect of world.city.colliders) {
    const p = pushOutCircle(x, y, r, rect);
    if (p) { x += p.nx * p.depth; y += p.ny * p.depth; hit = p; }
  }
  for (const rect of WALLS) {
    const p = pushOutCircle(x, y, r, rect);
    if (p) { x += p.nx * p.depth; y += p.ny * p.depth; hit = p; }
  }
  x = clamp(x, r, WORLD.width - r);
  y = clamp(y, r, WORLD.height - r);
  return { x, y, hit };
}

function pointBlocked(world, x, y) {
  for (const rect of world.city.colliders) {
    if (x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h) return true;
  }
  for (const rect of WATER) {
    if (x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function updatePlayer(world, dt, input) {
  const p = world.player;
  p.meleeCd = Math.max(0, p.meleeCd - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.swing = Math.max(0, p.swing - dt);
  p.aimA = Math.atan2(input.aimY - p.y, input.aimX - p.x);

  if (p.health <= 0) { wastePlayer(world); return; }
  if (world.time - p.lastHurt > 8 && p.health < PLAYER.health) p.health = Math.min(PLAYER.health, p.health + 5 * dt);

  if (p.inCar) driveCar(world, p.inCar, dt, input, true);
  else walkFoot(world, p, dt, input);

  if (input.interactPressed) toggleCar(world, p);
  if (!p.inCar && input.meleePressed && p.meleeCd <= 0) melee(world, p);
  if (!p.inCar && input.fireDown && p.fireCd <= 0) shoot(world, p);
}

function walkFoot(world, p, dt, input) {
  let ax = input.ax, ay = input.ay;
  const len = Math.hypot(ax, ay);
  if (len > 1) { ax /= len; ay /= len; }
  const speed = input.sprint ? PLAYER.sprint : PLAYER.walk;
  p.vx = ax * speed; p.vy = ay * speed;
  p.moving = len > 0.1;
  p.walkPhase += (p.moving ? speed : 0) * dt * 0.06;
  let nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  // Cars are obstacles for a pedestrian.
  for (const car of world.cars) {
    if (car.wreck) continue;
    const d = dist(nx, ny, car.x, car.y);
    if (d < 30 && d > 0.01) { const f = (30 - d) / d; nx += (nx - car.x) * f; ny += (ny - car.y) * f; }
  }
  const res = resolveCircle(world, nx, ny, PLAYER.radius);
  p.x = res.x; p.y = res.y;
  if (res.hit && Math.hypot(p.vx, p.vy) > 240) world.shake = Math.max(world.shake, 1);
}

function melee(world, p) {
  p.meleeCd = PLAYER.meleeCooldown;
  p.swing = 0.22;
  world.sfx.push('melee');
  const reach = PLAYER.meleeRange;
  let hitSomething = false;
  for (const ped of world.peds) {
    if (ped.state === 'dead') continue;
    const d = dist(p.x, p.y, ped.x, ped.y);
    if (d < reach && Math.abs(angDiff(Math.atan2(ped.y - p.y, ped.x - p.x), p.aimA)) < 1.25) {
      killPed(world, ped, true);
      hitSomething = true;
    }
  }
  for (const car of world.cars) {
    if (car.wreck) continue;
    if (dist(p.x, p.y, car.x, car.y) < reach + 24) {
      damageCar(world, car, 7, true);
      hitSomething = true;
    }
  }
  if (hitSomething) world.shake = Math.max(world.shake, 1.6);
}

function shoot(world, p) {
  p.fireCd = PLAYER.fireCooldown;
  world.sfx.push('gun');
  world.shake = Math.max(world.shake, 1.2);
  const a = p.aimA + (world.rng() - 0.5) * 0.05;
  world.bullets.push({
    x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
    vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
    life: 0.55, from: 'player',
  });
  addParticles(world, p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, 4, 'spark', a);
  // Loud noise: peds scatter, and witnesses raise heat.
  alertArea(world, p.x, p.y, 460);
  world.shotHeat += 1;
  if (witnessed(world, p.x, p.y)) {
    if (world.shotHeat >= 4) { setWanted(world, world.wanted + 1, 1); world.shotHeat = 0; }
    else setWanted(world, 1, 1);
  }
}

function toggleCar(world, p) {
  if (p.inCar) {
    const car = p.inCar;
    const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    const spots = [[-fy * 40, fx * 40], [fy * 40, -fx * 40], [-fx * 62, -fy * 62]];
    for (const [ox, oy] of spots) {
      const res = resolveCircle(world, car.x + ox, car.y + oy, PLAYER.radius);
      if (!res.hit) { p.x = res.x; p.y = res.y; break; }
      p.x = res.x; p.y = res.y;
    }
    p.inCar = null;
    car.driver = null;
    world.sfx.push('exit');
    return;
  }
  let best = null, bestD = 74;
  for (const car of world.cars) {
    if (car.wreck) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  if (best.driver === 'ai') carjack(world, best);
  p.inCar = best;
  best.driver = 'player';
  best.ai.mode = 'idle';
  world.sfx.push('enter');
  if (best.kind === 'police') {
    setWanted(world, Math.max(world.wanted, 2) + 1, 3);
    showToast(world, 'That is a Luna PD cruiser!');
  } else if (best.driverWasAi && witnessed(world, p.x, p.y)) {
    setWanted(world, world.wanted + 1, 1);
  }
}

function carjack(world, car) {
  const ped = {
    id: world.nextId++, x: car.x - Math.sin(car.angle) * 34, y: car.y + Math.cos(car.angle) * 34,
    angle: car.angle, speed: between(world.rng, 90, 120), from: null, to: null, t: 0,
    state: 'flee', panic: 5, deadT: 0,
    shirt: pick(world.rng, PED_COLORS), skin: pick(world.rng, SKIN), phase: 0,
  };
  world.peds.push(ped);
  car.driverWasAi = true;
}

function wastePlayer(world) {
  if (world.wasted) return;
  world.wasted = true;
  world.wastedT = 0;
  world.sfx.push('wasted');
  if (world.player.inCar) {
    const car = world.player.inCar;
    if (!car.wreck) explodeCar(world, car, false);
    world.player.inCar = null;
  }
}

// ---------------------------------------------------------------------------
// Cars: player physics, traffic on the graph, cop pursuit
// ---------------------------------------------------------------------------

function driveCar(world, car, dt, input) {
  if (car.wreck) return;
  const specs = CAR_SPECS[car.kind === 'taxi' ? 'civil' : car.kind];
  const throttle = -input.ay; // W is forward: ay<0 means throttle up
  const steer = input.ax;
  const handbrake = input.handbrake;

  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  let fwdSpeed = car.vx * fx + car.vy * fy;
  const latx = car.vx - fx * fwdSpeed, laty = car.vy - fy * fwdSpeed;

  if (throttle > 0.1) {
    fwdSpeed += specs.accel * throttle * dt * (fwdSpeed < 0 ? 2.2 : 1);
    if (fwdSpeed > specs.max) fwdSpeed = specs.max;
  } else if (throttle < -0.1) {
    fwdSpeed -= CAR.brake * dt * (fwdSpeed > 0 ? 1 : 0.6);
    if (fwdSpeed < -CAR.maxReverse) fwdSpeed = -CAR.maxReverse;
  } else {
    fwdSpeed *= 1 - 0.9 * dt;
  }
  if (handbrake) fwdSpeed *= 1 - 1.8 * dt;

  const grip = handbrake ? CAR.driftGrip : CAR.grip;
  const latDamp = Math.exp(-grip * dt);
  let nvx = fx * fwdSpeed + latx * latDamp;
  let nvy = fy * fwdSpeed + laty * latDamp;

  const speedFactor = clamp(Math.abs(fwdSpeed) / 140, 0, 1.15);
  const turn = CAR.steerRate * steer * speedFactor * (fwdSpeed < 0 ? -1 : 1) * (handbrake ? 1.5 : 1);
  car.angle += turn * dt;
  car.vx = nvx; car.vy = nvy;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  collideCarWorld(world, car, dt);
  if (handbrake && Math.abs(fwdSpeed) > 180 && world.rng() < 0.45) {
    addParticles(world, car.x - fx * 22, car.y - fy * 22, 1, 'tyre', car.angle);
  }
}

function collideCarWorld(world, car, dt) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  for (const off of [16, -16]) {
    const px = car.x + fx * off, py = car.y + fy * off;
    const res = resolveCircle(world, px, py, 13);
    if (res.hit) {
      const dot = car.vx * res.hit.nx + car.vy * res.hit.ny;
      if (dot < 0) {
        car.vx -= res.hit.nx * dot * 1.6;
        car.vy -= res.hit.ny * dot * 1.6;
      }
      const impact = Math.abs(dot);
      if (impact > 230) {
        damageCar(world, car, (impact - 200) / 14, car.driver === 'player');
        addParticles(world, px, py, 6, 'spark', Math.atan2(res.hit.ny, res.hit.nx));
        if (car.driver === 'player') { world.shake = Math.max(world.shake, impact / 120); world.sfx.push('crash'); }
      }
      car.x = res.x - fx * off;
      car.y = res.y - fy * off;
    }
  }
}

function trafficStep(world, car, dt) {
  if (car.stun > 0) { car.stun -= dt; car.vx *= 1 - 4 * dt; car.vy *= 1 - 4 * dt; return; }
  const speed = car.speed ?? car.cruise;
  const ux = car.to.x - car.from.x, uy = car.to.y - car.from.y;
  const segLen = Math.hypot(ux, uy) || 1;
  car.t += (speed * dt) / segLen;
  if (car.t >= 1) {
    const node = car.to;
    const options = world.graph.adj[node.id].filter((e) => (e.a === node ? e.b : e.a) !== car.from);
    const next = options.length ? options[Math.floor(world.rng() * options.length) % options.length] : world.graph.adj[node.id][0];
    const to = next.a === node ? next.b : next.a;
    const carry = (car.t - 1) * segLen;
    car.from = node; car.to = to; car.t = carry / Math.hypot(to.x - node.x, to.y - node.y);
  }
  const dx = car.to.x - car.from.x, dy = car.to.y - car.from.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = dx / l, ny = dy / l;
  // Keep to the right-hand lane.
  const targetX = car.from.x + dx * car.t - ny * LANE;
  const targetY = car.from.y + dy * car.t + nx * LANE;
  car.x = lerp(car.x, targetX, clamp(8 * dt, 0, 1));
  car.y = lerp(car.y, targetY, clamp(8 * dt, 0, 1));
  const desired = Math.atan2(dy, dx);
  car.angle += angDiff(desired, car.angle) * clamp(10 * dt, 0, 1);
  car.vx = nx * speed; car.vy = ny * speed;

  // Brake for anything directly ahead.
  const aheadX = car.x + nx * (52 + speed * 0.18), aheadY = car.y + ny * (52 + speed * 0.18);
  let blocked = pointBlocked(world, aheadX, aheadY);
  if (!blocked) {
    for (const other of world.cars) {
      if (other === car) continue;
      if (dist(aheadX, aheadY, other.x, other.y) < 44) { blocked = true; break; }
    }
  }
  if (!blocked && world.player && !world.player.inCar && dist(aheadX, aheadY, world.player.x, world.player.y) < 34) blocked = true;
  car.speed = blocked ? 0 : car.cruise;
  if (blocked && world.player && dist(car.x, car.y, world.player.x, world.player.y) < 400) {
    car.honkT += dt;
    if (car.honkT > 2.4) { car.honkT = 0; world.sfx.push('honk'); }
  } else car.honkT = 0;
}

function copStep(world, car, dt) {
  const ai = car.ai;
  if (ai.mode === 'leave') {
    ai.leaveT += dt;
    const farX = car.x + Math.cos(car.angle) * 900, farY = car.y + Math.sin(car.angle) * 900;
    steerTowards(car, farX, farY, 0.8);
    driveCar(world, car, dt, { ay: -0.8, ax: ai.steer ?? 0, handbrake: false });
    if (dist(car.x, car.y, world.player.x, world.player.y) > 1500 || ai.leaveT > 12) car.remove = true;
    return;
  }
  const p = world.player;
  const target = p.inCar ? p.inCar : p;
  const px = target.x + (target.vx ?? 0) * 0.35;
  const py = target.y + (target.vy ?? 0) * 0.35;
  const d = dist(car.x, car.y, px, py);
  steerTowards(car, px, py, 1);

  // Probe ahead: swing wide around buildings instead of grinding into them.
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  if (pointBlocked(world, car.x + fx * 96, car.y + fy * 96)) {
    const leftFree = !pointBlocked(world, car.x + Math.cos(car.angle - 0.9) * 90, car.y + Math.sin(car.angle - 0.9) * 90);
    ai.steer = (leftFree ? -1 : 1) * 0.9;
  }
  if (Math.abs(fwdSpeedOf(car)) < 26) ai.stuckT += dt; else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
  if (ai.stuckT > 1.7) { ai.revT = 1.1; ai.stuckT = 0; }
  let ay;
  if (ai.revT > 0) { ai.revT -= dt; ay = 1; ai.steer = -(ai.steer ?? 0); }
  else if (d > 150) ay = -1;
  else {
    const fs = fwdSpeedOf(car);
    ay = fs > 150 ? 0.5 : -0.45;
  }
  const misaligned = Math.abs(angDiff(Math.atan2(py - car.y, px - car.x), car.angle)) > 1.5;
  driveCar(world, car, dt, { ay, ax: ai.steer ?? 0, handbrake: misaligned && fwdSpeedOf(car) > 200 });

  // Shooting from the window once things get hot.
  ai.fireCd -= dt;
  if (world.wanted >= POLICE.shootAt && d < POLICE.sightRange && ai.fireCd <= 0) {
    ai.fireCd = POLICE.fireInterval + world.rng() * 0.6;
    const a = Math.atan2(py - car.y, px - car.x) + (world.rng() - 0.5) * 0.18;
    world.bullets.push({
      x: car.x + fx * 26, y: car.y + fy * 26,
      vx: Math.cos(a) * 860, vy: Math.sin(a) * 860, life: 0.6, from: 'cop',
    });
    world.sfx.push('gun');
  }
}

function fwdSpeedOf(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

function steerTowards(car, tx, ty, weight) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = angDiff(desired, car.angle);
  car.ai.steer = clamp(diff * 2.2, -1, 1) * weight;
}

function updateCars(world, dt) {
  const p = world.player;
  for (const car of world.cars) {
    car.ramCd = Math.max(0, car.ramCd - dt);
    car.bumpT = Math.max(0, car.bumpT - dt);
    if (car.wreck) { car.vx *= 1 - 5 * dt; car.vy *= 1 - 5 * dt; continue; }
    if (car.hp < car.maxHp * 0.4) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) { car.smokeT = 0.12; addParticles(world, car.x + Math.cos(car.angle) * 18, car.y + Math.sin(car.angle) * 18, 1, 'smoke', 0); }
    }
    if (car.driver === 'player') continue; // already driven this step
    if (car.kind === 'police') copStep(world, car, dt);
    else if (car.driver === 'ai') trafficStep(world, car, dt);
    else { car.vx *= 1 - 3 * dt; car.vy *= 1 - 3 * dt; }
  }
  // Car vs car, car vs ped.
  for (let i = 0; i < world.cars.length; i += 1) {
    const a = world.cars[i];
    if (a.wreck) continue;
    for (let j = i + 1; j < world.cars.length; j += 1) {
      const b = world.cars[j];
      if (a.x === b.x && a.y === b.y) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      const min = 34;
      if (d < min && d > 0.01) {
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        const push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        if (rel > 160 && a.ramCd <= 0 && b.ramCd <= 0) {
          a.ramCd = b.ramCd = 0.3;
          const playerCar = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
          const other = playerCar === a ? b : a;
          const copInvolved = a.kind === 'police' || b.kind === 'police';
          damageCar(world, a, rel / 30, b.driver === 'player');
          damageCar(world, b, rel / 30, a.driver === 'player');
          if (playerCar) {
            world.shake = Math.max(world.shake, rel / 90);
            world.sfx.push('crash');
            if (copInvolved && world.wanted > 0) setWanted(world, Math.min(WANTED_MAX, world.wanted + 1), 3);
            if (other.kind === 'police') hurtPlayer(world, POLICE.ramDamage);
          }
          if (a.driver === 'ai') a.stun = 1.4;
          if (b.driver === 'ai') b.stun = 1.4;
        }
      }
    }
    if (!p.inCar) {
      const d = dist(a.x, a.y, p.x, p.y);
      const speed = Math.hypot(a.vx, a.vy);
      if (d < 26 && speed > 95) hurtPlayer(world, speed / 18);
      else if (d < 30 && d > 0.01) {
        const nx = (p.x - a.x) / d, ny = (p.y - a.y) / d;
        p.x += nx * (30 - d); p.y += ny * (30 - d);
      }
    }
    for (const ped of world.peds) {
      if (ped.state === 'dead') continue;
      if (dist(a.x, a.y, ped.x, ped.y) < 24 && Math.hypot(a.vx, a.vy) > 90) {
        killPed(world, ped, a.driver === 'player');
        if (a.driver === 'player') world.shake = Math.max(world.shake, 2);
      }
    }
  }
  // Remove despawned cars.
  for (let i = world.cars.length - 1; i >= 0; i -= 1) {
    const car = world.cars[i];
    if (car.remove || (!car.missionCar && car.driver === 'ai' && car.kind !== 'police' && dist(car.x, car.y, p.x, p.y) > 2300)
      || (car.kind === 'police' && dist(car.x, car.y, p.x, p.y) > 2400)) {
      if (car === world.coupe) continue;
      world.cars.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Pedestrians
// ---------------------------------------------------------------------------

function updatePeds(world, dt) {
  for (const ped of world.peds) {
    if (ped.state === 'dead') { ped.deadT += dt; continue; }
    if (ped.panic > 0) {
      ped.panic -= dt;
      ped.x += Math.cos(ped.angle) * ped.speed * 2.1 * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * 2.1 * dt;
      const res = resolveCircle(world, ped.x, ped.y, 10);
      ped.x = res.x; ped.y = res.y;
      ped.phase += dt * 12;
      if (ped.panic <= 0) reattachPed(ped, world);
      continue;
    }
    // Walk the graph on the kerb side.
    const dx = ped.to.x - ped.from.x, dy = ped.to.y - ped.from.y;
    const l = Math.hypot(dx, dy) || 1;
    ped.t += (ped.speed * dt) / l;
    if (ped.t >= 1) {
      const node = ped.to;
      const options = world.graph.adj[node.id].filter((e) => (e.a === node ? e.b : e.a) !== ped.from);
      const next = options[Math.floor(world.rng() * options.length) % options.length] ?? options[0] ?? { a: node, b: node };
      ped.from = node;
      ped.to = next.a === node ? next.b : next.a;
      ped.t = 0;
    }
    const ddx = ped.to.x - ped.from.x, ddy = ped.to.y - ped.from.y;
    const dl = Math.hypot(ddx, ddy) || 1;
    const nx = ddx / dl, ny = ddy / dl;
    ped.x = ped.from.x + ddx * ped.t - ny * WALK_OFFSET;
    ped.y = ped.from.y + ddy * ped.t + nx * WALK_OFFSET;
    ped.angle = Math.atan2(ny, nx);
    ped.phase += dt * 6;
  }
  for (let i = world.peds.length - 1; i >= 0; i -= 1) {
    const ped = world.peds[i];
    if ((ped.state === 'dead' && ped.deadT > 22) || dist(ped.x, ped.y, world.player.x, world.player.y) > 1700) {
      world.peds.splice(i, 1);
    }
  }
}

function reattachPed(ped, world) {
  const spot = nearestEdgePoint(world.graph, ped.x, ped.y);
  if (!spot) return;
  ped.from = spot.edge.a;
  ped.to = spot.edge.b;
  ped.t = spot.t;
}

function alertArea(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.state === 'dead') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.panic = between(world.rng, 3.5, 6.5);
      ped.angle = Math.atan2(ped.y - y, ped.x - x) + (world.rng() - 0.5) * 0.8;
      ped.speed = between(world.rng, 80, 115);
    }
  }
}

function killPed(world, ped, byPlayer) {
  if (ped.state === 'dead') return;
  ped.state = 'dead';
  ped.deadT = 0;
  addParticles(world, ped.x, ped.y, 8, 'blood', 0);
  world.sfx.push('thud');
  if (byPlayer) {
    setWanted(world, Math.min(WANTED_MAX, Math.max(world.wanted + 1, 2)), 2);
    alertArea(world, ped.x, ped.y, 420);
  }
}

// ---------------------------------------------------------------------------
// Bullets, damage, explosions
// ---------------------------------------------------------------------------

function updateBullets(world, dt) {
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const b = world.bullets[i];
    b.life -= dt;
    if (b.life <= 0) { world.bullets.splice(i, 1); continue; }
    const steps = 3;
    let dead = false;
    for (let s = 0; s < steps && !dead; s += 1) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      if (pointBlocked(world, b.x, b.y)) {
        addParticles(world, b.x, b.y, 4, 'spark', Math.atan2(-b.vy, -b.vx));
        dead = true; break;
      }
      for (const ped of world.peds) {
        if (ped.state !== 'dead' && dist(b.x, b.y, ped.x, ped.y) < 13) {
          killPed(world, ped, b.from === 'player');
          dead = true; break;
        }
      }
      if (dead) break;
      for (const car of world.cars) {
        if (car.wreck) continue;
        if (b.from === 'cop' && car === world.player.inCar) continue;
        if (dist(b.x, b.y, car.x, car.y) < 20) {
          const byPlayer = b.from === 'player';
          damageCar(world, car, PLAYER.bulletDamage, byPlayer);
          if (byPlayer && car.kind === 'police') setWanted(world, Math.min(WANTED_MAX, world.wanted + 1), 3);
          addParticles(world, b.x, b.y, 5, 'spark', Math.atan2(-b.vy, -b.vx));
          dead = true; break;
        }
      }
      if (dead) break;
      if (b.from === 'cop' && !world.player.inCar && dist(b.x, b.y, world.player.x, world.player.y) < 13) {
        hurtPlayer(world, POLICE.bulletDamage);
        addParticles(world, b.x, b.y, 5, 'blood', 0);
        dead = true;
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }
}

function hurtPlayer(world, amount) {
  const p = world.player;
  if (world.wasted) return;
  p.health -= amount;
  p.lastHurt = world.time;
  world.shake = Math.max(world.shake, Math.min(6, amount / 6));
  if (p.health <= 0) wastePlayer(world);
}

function damageCar(world, car, amount, byPlayer) {
  if (car.wreck) return;
  car.hp -= amount;
  if (byPlayer && car.kind === 'police') world.coolT = 0;
  if (car.hp <= 0) explodeCar(world, car, byPlayer);
}

function explodeCar(world, car, byPlayer) {
  car.wreck = true;
  car.siren = false;
  world.sfx.push('explode');
  world.shake = Math.max(world.shake, 8);
  addParticles(world, car.x, car.y, 26, 'fire', 0);
  addParticles(world, car.x, car.y, 16, 'smoke', 0);
  addParticles(world, car.x, car.y, 2, 'ring', 0);
  for (const other of world.cars) {
    if (other === car || other.wreck) continue;
    if (dist(other.x, other.y, car.x, car.y) < 130) damageCar(world, other, 45, byPlayer);
  }
  for (const ped of world.peds) {
    if (ped.state !== 'dead' && dist(ped.x, ped.y, car.x, car.y) < 110) killPed(world, ped, byPlayer);
  }
  const p = world.player;
  if (!p.inCar && dist(p.x, p.y, car.x, car.y) < 120) hurtPlayer(world, 62);
  if (car.driver === 'player') {
    p.inCar = null;
    hurtPlayer(world, 200);
    car.driver = null;
  }
  if (byPlayer) {
    const bump = car.kind === 'police' ? 2 : 1;
    setWanted(world, Math.min(WANTED_MAX, world.wanted + bump), 2);
    alertArea(world, car.x, car.y, 480);
  }
}

// ---------------------------------------------------------------------------
// Particles and pickups
// ---------------------------------------------------------------------------

function addParticles(world, x, y, count, kind, angle) {
  for (let i = 0; i < count; i += 1) {
    const spread = kind === 'ring' ? 0 : (world.rng() - 0.5) * 2.4;
    const a = angle + spread;
    const sp = kind === 'ring' ? 0 : kind === 'smoke' ? between(world.rng, 8, 30) : between(world.rng, 40, 190);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: kind === 'ring' ? 0.5 : kind === 'smoke' ? between(world.rng, 0.8, 1.6) : between(world.rng, 0.25, 0.6),
      max: 1, kind, size: kind === 'ring' ? 10 : between(world.rng, 2, 5.5),
    });
  }
  if (world.particles.length > 420) world.particles.splice(0, world.particles.length - 420);
}

function updateFx(world, dt) {
  world.shake = Math.max(0, world.shake - dt * 14);
  if (world.toast) { world.toast.t += dt; if (world.toast.t > world.toast.max) world.toast = null; }
  if (world.banner) { world.banner.t += dt; if (world.banner.t > 3.2) world.banner = null; }
  if (world.wasted) world.wastedT += dt;
  if (world.dialogue) world.dialogue.t += dt;
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const p = world.particles[i];
    p.life -= dt;
    if (p.life <= 0) { world.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 1 - 2.4 * dt; p.vy *= 1 - 2.4 * dt;
    if (p.kind === 'smoke') { p.vy -= 12 * dt; p.size += 14 * dt; }
    if (p.kind === 'blood') { p.vy += 60 * dt; }
    if (p.kind === 'ring') p.size += 240 * dt;
  }
}

function updatePickups(world, dt) {
  const p = world.player;
  for (const pk of world.pickups) {
    if (!pk.active) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) { pk.active = true; }
      continue;
    }
    if (!p.inCar && dist(p.x, p.y, pk.x, pk.y) < 26) {
      pk.active = false;
      pk.respawnT = 28 + world.rng() * 20;
      world.money += pk.amount;
      world.sfx.push('pickup');
      addParticles(world, pk.x, pk.y, 6, 'spark', -Math.PI / 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Wanted level and police
// ---------------------------------------------------------------------------

function witnessed(world, x, y) {
  for (const ped of world.peds) {
    if (ped.state !== 'dead' && dist(ped.x, ped.y, x, y) < 460) return true;
  }
  for (const car of world.cars) {
    if (car.kind === 'police' && !car.wreck && dist(car.x, car.y, x, y) < 560) return true;
  }
  return false;
}

function setWanted(world, level, min) {
  const v = clamp(Math.max(level, min ?? world.wanted), 0, WANTED_MAX);
  if (v > world.wanted) {
    world.wanted = v;
    world.coolT = 0;
    world.sfx.push('star');
    if (v === 1) showToast(world, 'Luna PD is looking for you');
  }
}

function updateWanted(world, dt) {
  let nearest = Infinity;
  for (const car of world.cars) {
    if (car.kind !== 'police' || car.wreck) continue;
    nearest = Math.min(nearest, dist(car.x, car.y, world.player.x, world.player.y));
  }
  const active = world.wanted > 0;
  if (active) {
    if (nearest > POLICE.sightRange || !Number.isFinite(nearest)) world.coolT += dt;
    else world.coolT = Math.max(0, world.coolT - dt * 2);
    if (world.coolT > POLICE.coolTime && world.wanted > 0) {
      world.wanted -= 1;
      world.coolT = 0;
      if (world.wanted === 0) showToast(world, 'You lost them');
    }
  }
  // Keep the right number of cruisers on the road.
  let cops = 0;
  for (const car of world.cars) if (car.kind === 'police' && !car.remove && !car.wreck) cops += 1;
  world.copSpawnT -= dt;
  const desired = POLICE.maxCops[world.wanted] ?? 0;
  if (cops < desired && world.copSpawnT <= 0) {
    world.copSpawnT = 1.0;
    spawnCop(world);
  }
}

// ---------------------------------------------------------------------------
// Spawn maintenance, camera, HUD bookkeeping
// ---------------------------------------------------------------------------

function maintainSpawns(world, dt) {
  world.spawnT -= dt;
  let traffic = 0;
  for (const car of world.cars) if (car.driver === 'ai' && car.kind !== 'police' && !car.wreck) traffic += 1;
  let peds = 0;
  for (const ped of world.peds) if (ped.state !== 'dead') peds += 1;
  const p = world.player;
  if (world.spawnT <= 0) {
    if (traffic < TRAFFIC.count) { spawnTraffic(world, false); world.spawnT = 0.4; }
    else if (peds < PEDS.count) { spawnPed(world, false); world.spawnT = 0.4; }
  }
  void p;
}

function updateCamera(world, dt) {
  const p = world.player;
  const target = p.inCar ? p.inCar : p;
  const lead = p.inCar ? 0.32 : 0.12;
  const tx = clamp(target.x + target.vx * lead, VIEW_HALF_W, WORLD.width - VIEW_HALF_W);
  const ty = clamp(target.y + target.vy * lead, VIEW_HALF_H, WORLD.height - VIEW_HALF_H);
  const k = clamp(6.5 * dt, 0, 1);
  world.cam.x = lerp(world.cam.x, tx, k);
  world.cam.y = lerp(world.cam.y, ty, k);
}

const VIEW_HALF_W = 640, VIEW_HALF_H = 360;

function updateDistrict(world) {
  const p = world.player;
  const d = districtAt(p.x, p.y);
  if (d !== world.district) {
    world.district = d;
    world.toast = { text: d.toUpperCase(), t: 0, max: 2.4, district: true };
  }
}

function showToast(world, text) {
  world.toast = { text, t: 0, max: 3.2 };
}

function updateHud(world) {
  const p = world.player;
  if (p.inCar) world.prompt = 'E — exit vehicle';
  else {
    let best = null, bestD = 74;
    for (const car of world.cars) {
      if (car.wreck) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) {
      const name = best.missionCar ? 'the champagne coupe' : best.kind === 'police' ? 'the police cruiser' : 'the car';
      world.prompt = `E — enter ${name}`;
    } else world.prompt = '';
  }
}

// ---------------------------------------------------------------------------
// Missions: the Mara Quill story, then free-roam side jobs
// ---------------------------------------------------------------------------

function bannerJob(world, title, sub) {
  world.banner = { title, sub, t: 0 };
}

function startDialogue(world, lines, after) {
  world.dialogue = { lines, index: 0, t: 0 };
  world.afterDialogue = after;
  world.sfx.push('blip');
}

const MARA = 'MARA QUILL';

const DIALOGUES = {
  intro: [
    { who: MARA, text: 'You made it, kid. Mara Quill — I fix problems around Costa Luna.' },
    { who: MARA, text: 'First job: a collector is paying big for the champagne coupe at the Hotel Azure valet stand.' },
    { who: MARA, text: 'Bring it to my warehouse at Costa Marina. Drive like you mean it — and don\'t collect a police escort.' },
  ],
  deliveredCoupe: [
    { who: MARA, text: 'Clean work. The buyer is thrilled, and the dockhand will look after the coupe.' },
    { who: MARA, text: 'Now — grab the briefcase from the warehouse office. It has my name on it, and I want it back.' },
  ],
  caseTaken: [
    { who: MARA, text: 'That\'s the case. Listen — someone tipped Luna PD. They are crawling all over the marina.' },
    { who: MARA, text: 'Lose them first. Then drop the case in Mirador Park, bench by the pond.' },
  ],
  caseDelivered: [
    { who: MARA, text: 'Smooth. One last errand. Come back to the garage — and make sure nobody follows you in.' },
  ],
  looseEnds: [
    { who: MARA, text: 'You lost them. Good. You drive like the city owes you money.' },
    { who: MARA, text: 'Costa Luna is yours now, kid. Keep your hands clean — or don\'t. I\'ll call when there\'s work.' },
  ],
};

function objective(world) {
  const m = world.mission, s = world.stage;
  if (m === 0) return 'Meet fixer Mara Quill at Quill\'s Garage';
  if (m === 1) return s === 0
    ? 'Steal the champagne coupe at the Hotel Azure'
    : 'Deliver the coupe to the warehouse at Costa Marina';
  if (m === 2) {
    if (s === 0) return 'Pick up Mara\'s case at the warehouse dock';
    return world.wanted > 0 ? 'Lose Luna PD, then deliver the case to Mirador Park' : 'Deliver the case to Mirador Park — bench by the pond';
  }
  if (m === 3) return 'Get back to Quill\'s Garage — don\'t lead them there';
  if (world.gig) return world.gig.stage === 0
    ? `Side job: grab the cash drop in ${world.gig.name}`
    : 'Bring the take to Mara at Quill\'s Garage';
  return 'Free roam — Mara will call when there\'s work';
}

function checkMissions(world) {
  const p = world.player;
  const px = p.x, py = p.y;
  world.objective = objective(world);

  if (world.mission === 0) {
    world.marker = { x: GARAGE.x, y: GARAGE.y + 40, gated: false };
    if (dist(px, py, GARAGE.x, GARAGE.y) < 70) {
      startDialogue(world, DIALOGUES.intro, () => {
        world.mission = 1; world.stage = 0;
        spawnCoupe(world);
        bannerJob(world, 'JOB 1 — HOT PAINT', 'A champagne coupe is waiting at the Hotel Azure');
        world.saveNow = true;
      });
    }
  } else if (world.mission === 1) {
    if (world.stage === 0) {
      const c = world.coupe;
      world.marker = { x: c ? c.x : COUPE_SPOT.x, y: c ? c.y : COUPE_SPOT.y, gated: false };
      if (c && p.inCar === c) {
        world.stage = 1;
        setWanted(world, 2, 2);
        showToast(world, 'The valet called it in — Luna PD is on you!');
      }
    } else {
      world.marker = { x: WAREHOUSE.x, y: WAREHOUSE.y - 20, gated: false };
      const coupeHere = world.coupe && !world.coupe.wreck && dist(world.coupe.x, world.coupe.y, WAREHOUSE.x, WAREHOUSE.y - 20) < 150;
      if (coupeHere && !p.inCar && dist(px, py, WAREHOUSE.x, WAREHOUSE.y - 20) < 70) {
        startDialogue(world, DIALOGUES.deliveredCoupe, () => {
          world.money += 1500;
          if (world.coupe) { world.coupe.missionCar = false; world.coupe.delivered = true; }
          world.coupe = null;
          world.mission = 2; world.stage = 0;
          bannerJob(world, 'JOB 2 — PACKAGE RUN', 'A case at the warehouse has Mara\'s name on it');
          world.saveNow = true;
        });
      }
    }
  } else if (world.mission === 2) {
    if (world.stage === 0) {
      world.marker = { x: WAREHOUSE.x, y: WAREHOUSE.y - 20, gated: false };
      if (!p.inCar && dist(px, py, WAREHOUSE.x, WAREHOUSE.y - 20) < 62) {
        startDialogue(world, DIALOGUES.caseTaken, () => {
          world.stage = 1;
          setWanted(world, 2, 2);
          showToast(world, 'Someone tipped Luna PD!');
          world.saveNow = true;
        });
      }
    } else {
      world.marker = { x: PARK_DROP.x, y: PARK_DROP.y, gated: world.wanted > 0 };
      if (world.wanted === 0 && !p.inCar && dist(px, py, PARK_DROP.x, PARK_DROP.y) < 62) {
        startDialogue(world, DIALOGUES.caseDelivered, () => {
          world.money += 2000;
          world.mission = 3;
          setWanted(world, 2, 2);
          showToast(world, 'You\'ve got a tail — shake them before the garage!');
          world.saveNow = true;
        });
      }
    }
  } else if (world.mission === 3) {
    world.marker = { x: GARAGE.x, y: GARAGE.y + 40, gated: false };
    if (dist(px, py, GARAGE.x, GARAGE.y) < 80) {
      startDialogue(world, DIALOGUES.looseEnds, () => {
        world.money += 2500;
        world.mission = 4;
        world.wanted = 0;
        for (const car of world.cars) if (car.kind === 'police') car.ai.mode = 'leave';
        bannerJob(world, 'FREE ROAM', 'Costa Luna is yours. Cash drops and Mara\'s side jobs pay.');
        world.saveNow = true;
      });
    }
  } else {
    // Free roam: repeatable cash-run gigs.
    if (!world.gig) {
      world.gigCooldown -= STEP;
      if (world.gigCooldown <= 0) {
        const spot = pick(world.rng, GIG_SPOTS);
        world.gig = { stage: 0, x: spot.x, y: spot.y, name: spot.name, reward: 400 + Math.floor(world.rng() * 320) };
        showToast(world, `Mara called: cash drop in ${spot.name}`);
      }
      world.marker = world.freeRoamToastDone ? null : { x: GARAGE.x, y: GARAGE.y + 40, gated: false };
      if (!world.freeRoamToastDone) world.freeRoamToastDone = true;
    } else if (world.gig.stage === 0) {
      world.marker = { x: world.gig.x, y: world.gig.y, gated: false };
      if (dist(px, py, world.gig.x, world.gig.y) < 62) {
        world.gig.stage = 1;
        world.money += Math.floor(world.gig.reward / 2);
        world.sfx.push('pickup');
        showToast(world, 'Half now, half when Mara sees you');
      }
    } else {
      world.marker = { x: GARAGE.x, y: GARAGE.y + 40, gated: false };
      if (dist(px, py, GARAGE.x, GARAGE.y) < 80) {
        world.money += world.gig.reward;
        world.sfx.push('pickup');
        showToast(world, `Mara pays $${world.gig.reward}. She'll call again.`);
        world.gig = null;
        world.gigCooldown = 18;
        world.saveNow = true;
      }
    }
  }
}
