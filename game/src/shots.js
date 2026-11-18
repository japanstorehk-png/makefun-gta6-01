// The screenshot scenes behind ?shot=start|play|drive|wanted. Each one rebuilds the
// world from the seed, stages a real moment of play — parked at the hotel, mid-car-chase —
// and replays it with scripted inputs for a few simulated seconds, so the frame is what a
// short session genuinely looks like and the same seed always gives the same frame.
// Solara Keys note: shots bypass the save (hasSave = false) so a stored save can never
// leak into a staged frame.

import { STEP, CAR_COLORS } from './config.js';
import { COUPE_SPOT, nearestEdgePoint, edgePointNear } from './city.js';

const BLANK = { ax: 0, ay: 0, sprint: false, handbrake: false, fireDown: false, firePressed: false, meleePressed: false, interactPressed: false, aimX: 0, aimY: 0 };

function run(world, seconds, makeInput) {
  for (let i = 0; i < seconds / STEP; i += 1) {
    const t = i * STEP;
    const input = makeInput ? makeInput(t, world) : BLANK;
    world.step(STEP, input);
  }
}

export function stageShot(name, world) {
  world.reset(world.seed);
  world.hasSave = false;
  if (name === 'play') return stagePlay(world);
  if (name === 'drive') return stageDrive(world);
  if (name === 'wanted') return stageWanted(world);
  return stageStart(world);
}

/** Title over a living slice of the city: traffic and pedestrians going about their day. */
function stageStart(world) {
  world.player.x = 1180;
  world.player.y = 980;
  run(world, 5, (t) => ({ ...BLANK, aimX: world.player.x + 60, aimY: world.player.y }));
  return 'title';
}

/** On foot at the Hotel Azure, coupe waiting at the kerb, objective up, strangers about. */
function stagePlay(world) {
  world.mission = 1;
  world.stage = 0;
  world.money = 250;
  spawnCoupe(world);
  world.player.x = 742;
  world.player.y = 908;
  world.district = 'Palm Strand';
  // A few locals outside the hotel so the street reads as lived-in.
  const shirts = ['#e8b64c', '#d97742', '#c95a6b', '#6aa4d9', '#67b07a'];
  const skins = ['#f0c8a0', '#d9a877', '#a8744c'];
  for (const [x, y] of [[820, 900], [900, 916], [660, 880], [1010, 930], [860, 946]]) {
    const spot = nearestEdgePoint(world.graph, x, y);
    world.peds.push({
      id: world.nextId++, x, y, angle: Math.PI, speed: 40,
      from: spot.edge.a, to: spot.edge.b, t: spot.t, state: 'walk', panic: 0, deadT: 0,
      shirt: shirts[world.peds.length % shirts.length],
      skin: skins[world.peds.length % skins.length],
      phase: world.peds.length,
    });
  }
  run(world, 5, (t) => ({
    ...BLANK,
    ax: Math.sin(t * 0.8) * 0.5,
    ay: Math.cos(t * 0.6) * 0.5,
    aimX: COUPE_SPOT.x,
    aimY: COUPE_SPOT.y,
  }));
  return 'play';
}

/** Driving the stolen coupe down a Costa Marina avenue with traffic around. */
function stageDrive(world) {
  world.mission = 1;
  world.stage = 1;
  world.money = 250;
  spawnCoupe(world);
  const coupe = world.coupe;
  coupe.x = 900;
  coupe.y = 1484;
  coupe.angle = 0;
  coupe.vx = 260;
  coupe.driver = 'player';
  world.player.inCar = coupe;
  // Push traffic out of the first stretch so the run opens clean; cars stream back in.
  for (const car of world.cars) {
    if (car === coupe || car.kind === 'police') continue;
    for (let tries = 0; tries < 24 && Math.abs(car.y - 1484) < 420 && car.x > 500 && car.x < 2700; tries += 1) {
      const spot = edgePointNear(world.graph, world.rng, world.player.x, world.player.y, 1000, 2200);
      car.from = spot.edge.a;
      car.to = spot.edge.b;
      car.t = spot.t;
      car.x = spot.px;
      car.y = spot.py;
    }
  }
  run(world, 3.4, (t) => ({
    ...BLANK,
    ay: -1,
    ax: Math.sin(t * 1.2) * 0.08,
    aimX: coupe.x + 100,
    aimY: coupe.y,
  }));
  return 'play';
}

/** Three stars: cruisers closing in with lights on, tracer fire, the whole tape. */
function stageWanted(world) {
  world.mission = 2;
  world.stage = 1;
  world.money = 1850;
  world.wanted = 3;
  world.player.health = 84;
  const car = makeShotCar(world, 'sports', 1620, 1484, 0, CAR_COLORS[0]);
  car.vx = 330;
  car.driver = 'player';
  world.player.inCar = car;
  world.district = 'El Mercado';
  for (const [dx, dy] of [[-330, -30], [-430, 90], [-560, -110], [-260, 130]]) {
    const cop = makeShotCar(world, 'police', car.x + dx, car.y + dy, 0, '#e8eaee');
    cop.driver = 'ai';
    cop.ai.mode = 'chase';
    cop.siren = true;
    cop.ai.fireCd = 0.45;
    cop.vx = 250;
    world.cars.push(cop);
  }
  run(world, 2.6, (t) => ({
    ...BLANK,
    ay: -1,
    ax: Math.sin(t * 1.4) * 0.14,
    aimX: car.x + 200,
    aimY: car.y,
  }));
  return 'play';
}

function spawnCoupe(world) {
  const car = makeShotCar(world, 'special', COUPE_SPOT.x, COUPE_SPOT.y, COUPE_SPOT.angle, '#f2d492');
  car.missionCar = true;
  world.coupe = car;
  world.cars.push(car);
}

/** Mirror of the world's car factory, for staging only. */
function makeShotCar(world, kind, x, y, angle, color) {
  const hp = { civil: 55, taxi: 55, sports: 65, special: 110, police: 85 }[kind];
  return {
    id: world.nextId++, kind, x, y, angle,
    vx: 0, vy: 0, color, w: kind === 'special' ? 54 : 50,
    hp, maxHp: hp, driver: null, wreck: false, stun: 0, siren: false, honkT: 0,
    from: null, to: null, t: 0, cruise: 200,
    ai: { mode: 'idle', fireCd: 1, stuckT: 0, revT: 0, leaveT: 0 },
    ramCd: 0, smokeT: 0, bumpT: 0, missionCar: false, delivered: false,
  };
}
