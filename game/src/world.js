// Core simulation for Solara Keys in Costa Luna.
import {
  TITLE, CITY_NAME, FIXER_NAME, POLICE_NAME, PLACES, WORLD,
  PLAYER, VEHICLE, PED, TRAFFIC, COP, WANTED, ECONOMY, SAVE_KEY, MISSIONS,
} from './config.js';
import { createCity, nearestNode, nodeById, neighbors, pickNextNode, randomRoadPoint, collidesBuilding, constrainToWorld, rectsOverlap, placeById, onRoad } from './city.js';
import { createRng, randRange, choice, chance, randInt } from './random.js';
import { audio } from './audio.js';

const TAU = Math.PI * 2;
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function len(x, y) { return Math.hypot(x, y); }
function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
function angTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function dist2(ax, ay, bx, by) { const dx = ax-bx, dy = ay-by; return dx*dx+dy*dy; }

let nextId = 1;
function nid() { return nextId++; }

export function createWorld(seed = 1) {
  const city = createCity(seed);
  const rng = createRng(seed * 7919 + 3);
  const world = {
    seed,
    city,
    rng,
    title: TITLE,
    cityName: CITY_NAME,
    fixer: FIXER_NAME,
    police: POLICE_NAME,
    time: 0,
    money: ECONOMY.startMoney,
    wanted: 0,
    wantedHidden: 0,
    wantedVisible: false,
    mission: null,
    missionStage: 0,
    objective: '',
    objectivePos: null,
    jobCompleteTimer: 0,
    message: `Welcome to ${CITY_NAME}. ${FIXER_NAME} has work for you.`,
    messageTimer: 4,
    screen: 'title', // title, playing, paused, wasted, jobcomplete
    camera: { x: 0, y: 0 },
    player: null,
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    effects: [],
    sideJobCooldown: 0,
    shotMode: null,
  };

  spawnPlayer(world);
  spawnTraffic(world);
  spawnPeds(world);
  setupInitialMission(world);
  updateObjective(world);
  centerCamera(world, true);
  return world;
}

function spawnPlayer(world) {
  const start = placeById('plaza');
  const x = start.x + start.w / 2;
  const y = start.y + start.h + 30;
  world.player = {
    id: nid(), kind: 'player', x, y, vx: 0, vy: 0, angle: -Math.PI/2,
    health: PLAYER.maxHealth, maxHealth: PLAYER.maxHealth,
    inCarId: null, meleeCd: 0, shootCd: 0, alive: true,
  };
  // Give player a starter car near plaza for convenience.
  const car = makeCar(world, x + 60, y + 10, 0, 'civil', false);
  world.cars.push(car);
}

function makeCar(world, x, y, angle, type = 'civil', occupied = false, opts = {}) {
  const pos = constrainToWorld(x, y, 20);
  const node = nearestNode(world.city, pos.x, pos.y);
  return {
    id: nid(), kind: 'car', type, // civil, traffic, police, mission
    x: pos.x, y: pos.y, angle, speed: 0,
    w: VEHICLE.w, h: VEHICLE.h,
    hp: type === 'police' ? 120 : 80,
    occupied,
    driver: occupied ? 'npc' : null,
    color: opts.color || (type === 'police' ? null : choice(world.rng, ['#7bdff2','#b2f7ef','#eff7f6','#f7d6e0','#cdb4db','#f4a261','#84a59d'])),
    nodeId: node ? node.id : 0,
    prevNodeId: null,
    targetNodeId: node && node.edges[0] != null ? node.edges[0] : (node ? node.id : 0),
    steer: 0,
    siren: type === 'police',
    missionTag: opts.missionTag || null,
  };
}

function spawnTraffic(world) {
  for (let i = 0; i < TRAFFIC.count; i++) {
    const p = randomRoadPoint(world.city, world.rng);
    const n = nearestNode(world.city, p.x, p.y);
    const to = n && n.edges.length ? n.edges[0] : (n ? n.id : 0);
    const angle = n ? angTo(n.x, n.y, nodeById(world.city,to).x, nodeById(world.city,to).y) : randRange(world.rng,0,TAU);
    const car = makeCar(world, p.x, p.y, angle, 'traffic', true);
    if (n) { car.nodeId = n.id; car.targetNodeId = to; }
    car.speed = randRange(world.rng, 40, 100);
    world.cars.push(car);
  }
}

function makePed(world, x, y) {
  const pos = constrainToWorld(x, y, 10);
  return { id: nid(), kind: 'ped', x: pos.x, y: pos.y, vx: 0, vy: 0, angle: randRange(world.rng,0,TAU), health: 40, flee: 0, wanderT: randRange(world.rng,0,2), speed: PED.speed };
}

function spawnPeds(world) {
  for (let i = 0; i < PED.count; i++) {
    const p = randomRoadPoint(world.city, world.rng);
    const ox = randRange(world.rng, -60, 60), oy = randRange(world.rng, -60, 60);
    world.peds.push(makePed(world, p.x + ox, p.y + oy));
  }
}

function setupInitialMission(world) {
  // Mission 1: steal a coupe at Hotel Azure and deliver it to the dock.
  const hotel = placeById('hotel_azure');
  const dock = placeById('dock');
  const tx = hotel.x + hotel.w / 2 + 40;
  const ty = hotel.y + hotel.h + 20;
  const target = makeCar(world, tx, ty, Math.PI / 2, 'mission', false, { color: '#ffd166', missionTag: 'mission1' });
  world.cars.push(target);
  world.mission = {
    id: MISSIONS.INTRO,
    name: 'Hotel Lift',
    giver: FIXER_NAME,
    targetCarId: target.id,
    pickup: { x: hotel.x + hotel.w/2, y: hotel.y + hotel.h/2, name: 'Hotel Azure' },
    dropoff: { x: dock.x + dock.w/2, y: dock.y + dock.h/2, name: 'Dock' },
    reward: ECONOMY.mission1Reward,
    state: 'steal', // steal -> deliver
  };
  world.message = `${FIXER_NAME}: Steal the coupe at Hotel Azure and bring it to the Dock.`;
  world.messageTimer = 6;
}

function setupMission2(world) {
  const warehouse = placeById('warehouse');
  const plaza = placeById('plaza');
  const car = makeCar(world, warehouse.x + warehouse.w/2, warehouse.y + warehouse.h + 20, -Math.PI/2, 'mission', false, { color: '#ffd166', missionTag: 'mission2' });
  world.cars.push(car);
  world.mission = {
    id: MISSIONS.DELIVER,
    name: 'Case Run',
    giver: FIXER_NAME,
    targetCarId: car.id,
    pickup: { x: warehouse.x + warehouse.w/2, y: warehouse.y + warehouse.h/2, name: 'Warehouse' },
    dropoff: { x: plaza.x + plaza.w/2, y: plaza.y + plaza.h/2, name: 'Plaza' },
    reward: ECONOMY.mission2Reward,
    state: 'pickup', // pickup -> deliver -> losecops
  };
  world.wanted = Math.max(world.wanted, 2);
  world.message = `${FIXER_NAME}: Grab the case car at the Warehouse, deliver to Plaza, then lose ${POLICE_NAME}!`;
  world.messageTimer = 6;
  audio.sirenUp();
}

function setupSideJob(world) {
  // simple free-roam delivery side job from fixer at plaza to a random place
  const from = placeById('plaza');
  const destChoices = PLACES.filter(p => p.id !== 'plaza');
  const dest = choice(world.rng, destChoices);
  world.mission = {
    id: MISSIONS.FREE_ROAM,
    name: 'Side Delivery',
    giver: FIXER_NAME,
    targetCarId: null,
    pickup: { x: from.x + from.w/2, y: from.y + from.h/2, name: 'Plaza' },
    dropoff: { x: dest.x + dest.w/2, y: dest.y + dest.h/2, name: dest.name },
    reward: ECONOMY.sideJobReward,
    state: 'goto_pickup', // goto_pickup -> deliver
  };
  world.message = `${FIXER_NAME}: Side job ready at Plaza. Deliver a package to ${dest.name}.`;
  world.messageTimer = 5;
}

function updateObjective(world) {
  const m = world.mission;
  if (!m) { world.objective = 'Free roam in Costa Luna.'; world.objectivePos = null; return; }
  if (m.id === MISSIONS.INTRO) {
    if (m.state === 'steal') { world.objective = `Steal the marked coupe at ${m.pickup.name}.`; const c = getCar(world, m.targetCarId); world.objectivePos = c ? {x:c.x,y:c.y} : m.pickup; }
    else if (m.state === 'deliver') { world.objective = `Deliver the coupe to ${m.dropoff.name}.`; world.objectivePos = m.dropoff; }
  } else if (m.id === MISSIONS.DELIVER) {
    if (m.state === 'pickup') { world.objective = `Collect the case car at ${m.pickup.name}.`; const c = getCar(world, m.targetCarId); world.objectivePos = c ? {x:c.x,y:c.y} : m.pickup; }
    else if (m.state === 'deliver') { world.objective = `Deliver the case to ${m.dropoff.name}.`; world.objectivePos = m.dropoff; }
    else if (m.state === 'losecops') { world.objective = `Lose ${POLICE_NAME} (wanted: ${world.wanted}).`; world.objectivePos = null; }
  } else if (m.id === MISSIONS.FREE_ROAM) {
    if (m.state === 'goto_pickup') { world.objective = `Meet ${FIXER_NAME} at ${m.pickup.name} for a side job.`; world.objectivePos = m.pickup; }
    else if (m.state === 'deliver') { world.objective = `Deliver the package to ${m.dropoff.name}.`; world.objectivePos = m.dropoff; }
  }
}

function getCar(world, id) { return world.cars.find(c => c.id === id); }
function playerCar(world) { return world.player.inCarId ? getCar(world, world.player.inCarId) : null; }

export function startNewGame(world, seed = 1) {
  const fresh = createWorld(seed);
  Object.assign(world, fresh);
}

export function saveGame(world) {
  try {
    const data = serialize(world);
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {}
}

export function loadGame(seedIfNone = 1) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return deserialize(data);
  } catch { return null; }
}

function serialize(w) {
  return {
    seed: w.seed, time: w.time, money: w.money, wanted: w.wanted, wantedHidden: w.wantedHidden,
    mission: w.mission, missionStage: w.missionStage, objective: w.objective, objectivePos: w.objectivePos,
    message: w.message, messageTimer: w.messageTimer, sideJobCooldown: w.sideJobCooldown,
    player: { x: w.player.x, y: w.player.y, angle: w.player.angle, health: w.player.health, inCarId: w.player.inCarId },
    cars: w.cars.map(c => ({ id:c.id,type:c.type,x:c.x,y:c.y,angle:c.angle,speed:c.speed,w:c.w,h:c.h,hp:c.hp,occupied:c.occupied,driver:c.driver,color:c.color,nodeId:c.nodeId,prevNodeId:c.prevNodeId,targetNodeId:c.targetNodeId,missionTag:c.missionTag })),
    peds: w.peds.map(p => ({ id:p.id,x:p.x,y:p.y,health:p.health,flee:p.flee })),
  };
}

function deserialize(data) {
  const w = createWorld(data.seed || 1);
  w.time = data.time || 0; w.money = data.money ?? ECONOMY.startMoney;
  w.wanted = data.wanted || 0; w.wantedHidden = data.wantedHidden || 0;
  w.mission = data.mission || w.mission; w.missionStage = data.missionStage || 0;
  w.objective = data.objective || w.objective; w.objectivePos = data.objectivePos || null;
  w.message = data.message || w.message; w.messageTimer = data.messageTimer || 2;
  w.sideJobCooldown = data.sideJobCooldown || 0;
  if (data.player) Object.assign(w.player, data.player);
  if (Array.isArray(data.cars) && data.cars.length) {
    w.cars = data.cars.map(c => ({ ...makeCar(w,c.x,c.y,c.angle,c.type,c.occupied,{color:c.color,missionTag:c.missionTag}), ...c }));
  }
  if (Array.isArray(data.peds) && data.peds.length) {
    w.peds = data.peds.map(p => ({ ...makePed(w,p.x,p.y), ...p }));
  }
  // ensure ids don't collide
  let maxId = 1;
  for (const arr of [w.cars,w.peds,[w.player]]) for (const e of arr) maxId = Math.max(maxId, e.id||1);
  nextId = maxId + 1;
  // cops/bullets reset on load for simplicity
  w.cops = []; w.bullets = [];
  centerCamera(w, true);
  return w;
}

export function updateWorld(world, input, dt) {
  if (world.screen !== 'playing') return;
  world.time += dt;
  if (world.messageTimer > 0) world.messageTimer -= dt;
  if (world.jobCompleteTimer > 0) {
    world.jobCompleteTimer -= dt;
    if (world.jobCompleteTimer <= 0 && world.screen === 'jobcomplete') world.screen = 'playing';
  }
  if (world.sideJobCooldown > 0) world.sideJobCooldown -= dt;

  const p = world.player;
  if (!p.alive) { world.screen = 'wasted'; return; }

  if (p.meleeCd > 0) p.meleeCd -= dt;
  if (p.shootCd > 0) p.shootCd -= dt;

  handlePlayerInput(world, input, dt);
  updateCars(world, dt);
  updatePeds(world, dt);
  updateCops(world, dt);
  updateBullets(world, dt);
  updateWanted(world, dt);
  checkMission(world);
  updateObjective(world);
  centerCamera(world);
}

function handlePlayerInput(world, input, dt) {
  const p = world.player;
  const car = playerCar(world);
  if (car) {
    driveCar(world, car, input, dt, true);
    p.x = car.x; p.y = car.y; p.angle = car.angle;
  } else {
    moveOnFoot(world, input, dt);
  }

  if (input.wasPressed('e')) {
    if (car) exitCar(world); else tryEnterCar(world);
  }
  if (!car && input.wasPressed('f')) doMelee(world);
  if (!car && (input.mouseWasPressed() || input.wasPressed(' '))) {
    // space used as handbrake in car; on foot allow click shoot only to avoid conflict
  }
  if (!car && input.mouse.down && p.shootCd <= 0) {
    // hold to shoot with cooldown
    doShoot(world, input);
  } else if (!car && input.mouseWasPressed() && p.shootCd <= 0) {
    doShoot(world, input);
  }
}

function moveOnFoot(world, input, dt) {
  const p = world.player;
  let mx = 0, my = 0;
  if (input.isDown('w')) my -= 1;
  if (input.isDown('s')) my += 1;
  if (input.isDown('a')) mx -= 1;
  if (input.isDown('d')) mx += 1;
  const l = Math.hypot(mx, my) || 1;
  mx /= l; my /= l;
  const sprint = input.isDown('shift');
  const spd = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const nx = p.x + mx * spd * dt;
  const ny = p.y + my * spd * dt;
  const c1 = constrainToWorld(nx, p.y, PLAYER.radius);
  if (!collidesBuilding(world.city, c1.x, p.y, PLAYER.radius)) p.x = c1.x;
  const c2 = constrainToWorld(p.x, ny, PLAYER.radius);
  if (!collidesBuilding(world.city, p.x, c2.y, PLAYER.radius)) p.y = c2.y;
  if (mx || my) p.angle = Math.atan2(my, mx);
  p.vx = mx * spd; p.vy = my * spd;
}

function driveCar(world, car, input, dt, isPlayer) {
  let accel = 0;
  if (input.isDown('w')) accel += 1;
  if (input.isDown('s')) accel -= 1;
  const handbrake = input.isDown(' ');
  const turnInput = (input.isDown('d') ? 1 : 0) - (input.isDown('a') ? 1 : 0);
  const moving = Math.abs(car.speed) > 5;
  const turnBase = handbrake ? VEHICLE.handbrakeTurn : VEHICLE.turnRate;
  if (moving) car.angle += turnInput * turnBase * dt * Math.sign(car.speed || 1) * clamp(Math.abs(car.speed)/VEHICLE.maxSpeed, 0.3, 1);

  if (accel > 0) car.speed += VEHICLE.accel * dt;
  else if (accel < 0) {
    if (car.speed > 20) car.speed -= VEHICLE.brake * dt; else car.speed -= VEHICLE.accel * 0.7 * dt;
  } else {
    const fr = (handbrake ? VEHICLE.handbrakeFriction : VEHICLE.friction) * dt;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - fr); else car.speed = Math.min(0, car.speed + fr);
  }
  car.speed = clamp(car.speed, -VEHICLE.reverseSpeed, isPlayer ? VEHICLE.maxSpeed : (car.type === 'police' ? COP.carSpeed : TRAFFIC.maxSpeed));

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const cw = constrainToWorld(nx, ny, 18);
  const hit = collidesBuilding(world.city, cw.x, cw.y, 18);
  if (!hit) { car.x = cw.x; car.y = cw.y; }
  else { car.speed *= -0.2; }

  // hit peds lightly
  if (Math.abs(car.speed) > VEHICLE.hitDamageSpeed) {
    for (const ped of world.peds) {
      if (dist2(car.x, car.y, ped.x, ped.y) < 26*26) {
        ped.health -= Math.abs(car.speed) * 0.03;
        ped.flee = 3;
        if (isPlayer) noteCrime(world, 1, ped.x, ped.y);
      }
    }
  }
}

function tryEnterCar(world) {
  const p = world.player;
  let best = null, bd = VEHICLE.enterRadius * VEHICLE.enterRadius;
  for (const c of world.cars) {
    const d = dist2(p.x, p.y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;
  // steal if occupied by npc/traffic
  if (best.occupied && best.driver && best.driver !== 'player') {
    best.occupied = false; best.driver = null;
    noteCrime(world, WANTED.carjackHeat, best.x, best.y);
    world.message = `You stole a car in ${CITY_NAME}.`;
    world.messageTimer = 2;
  }
  best.occupied = true; best.driver = 'player';
  p.inCarId = best.id;
  p.x = best.x; p.y = best.y;
  audio.enter();
}

function exitCar(world) {
  const p = world.player;
  const car = playerCar(world);
  if (!car) return;
  car.driver = null; car.occupied = false; p.inCarId = null;
  const ox = Math.cos(car.angle + Math.PI/2) * 26;
  const oy = Math.sin(car.angle + Math.PI/2) * 26;
  const pos = constrainToWorld(car.x + ox, car.y + oy, PLAYER.radius);
  p.x = pos.x; p.y = pos.y; car.speed *= 0.4;
  audio.exit();
}

function aimAngle(world, input) {
  // convert mouse screen to world
  const mx = world.camera.x + input.mouse.x;
  const my = world.camera.y + input.mouse.y;
  return angTo(world.player.x, world.player.y, mx, my);
}

function doShoot(world, input) {
  const p = world.player;
  if (p.inCarId) return;
  p.shootCd = PLAYER.shootCooldown;
  const a = aimAngle(world, input);
  p.angle = a;
  world.bullets.push({ id:nid(), x:p.x + Math.cos(a)*16, y:p.y + Math.sin(a)*16, vx:Math.cos(a)*PLAYER.bulletSpeed, vy:Math.sin(a)*PLAYER.bulletSpeed, life: PLAYER.bulletRange/PLAYER.bulletSpeed, dmg: PLAYER.bulletDamage, owner:'player' });
  noteCrime(world, WANTED.shootHeat, p.x, p.y, 0.4);
  audio.shot();
}

function doMelee(world) {
  const p = world.player;
  if (p.meleeCd > 0) return;
  p.meleeCd = PLAYER.meleeCooldown;
  audio.melee();
  // hit nearest ped/cop in arc
  const range2 = PLAYER.meleeRange * PLAYER.meleeRange;
  for (const ped of world.peds) {
    if (dist2(p.x,p.y,ped.x,ped.y) < range2) {
      ped.health -= PLAYER.meleeDamage; ped.flee = 4;
      noteCrime(world, 1, ped.x, ped.y);
    }
  }
  for (const cop of world.cops) {
    if (dist2(p.x,p.y,cop.x,cop.y) < range2) { cop.health -= PLAYER.meleeDamage; noteCrime(world, WANTED.killHeat, cop.x, cop.y); }
  }
}

function noteCrime(world, heat, x, y, prob = 1) {
  // if near any cop or in general, add wanted; simple visibility model
  let seen = false;
  for (const cop of world.cops) if (dist2(x,y,cop.x,cop.y) < WANTED.crimeSeenRadius*WANTED.crimeSeenRadius) { seen = true; break; }
  // also small chance seen by city if no cops yet
  if (!seen && world.wanted === 0) seen = chance(world.rng, 0.35 * prob);
  if (world.wanted > 0) seen = true;
  if (seen) {
    const before = world.wanted;
    world.wanted = clamp(world.wanted + heat, 0, WANTED.max);
    world.wantedHidden = 0;
    world.wantedVisible = true;
    if (world.wanted > before) { audio.sirenUp(); world.message = `${POLICE_NAME} alerted! Wanted level ${world.wanted}.`; world.messageTimer = 2.5; }
  }
}

function updateCars(world, dt) {
  for (const car of world.cars) {
    if (car.driver === 'player') continue;
    if (car.type === 'police') continue; // police cars driven in updateCops
    // simple traffic AI following road graph
    if (car.occupied && (car.type === 'traffic' || car.type === 'civil')) {
      driveTraffic(world, car, dt);
    }
  }
}

function driveTraffic(world, car, dt) {
  const target = nodeById(world.city, car.targetNodeId);
  if (!target) return;
  const dx = target.x - car.x, dy = target.y - car.y;
  const d = Math.hypot(dx, dy);
  if (d < 24) {
    car.prevNodeId = car.nodeId;
    car.nodeId = car.targetNodeId;
    car.targetNodeId = pickNextNode(world.city, car.nodeId, car.prevNodeId, world.rng);
  } else {
    const desired = Math.atan2(dy, dx);
    let da = desired - car.angle;
    while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    car.angle += clamp(da, -2.2*dt, 2.2*dt);
    car.speed += (TRAFFIC.speed - car.speed) * dt * 1.5;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!collidesBuilding(world.city, nx, ny, 16)) { car.x = nx; car.y = ny; }
    else { car.angle += Math.PI * 0.5; }
  }
}

function updatePeds(world, dt) {
  const ppos = world.player;
  for (let i = world.peds.length - 1; i >= 0; i--) {
    const ped = world.peds[i];
    if (ped.health <= 0) { world.peds.splice(i,1); continue; }
    if (ped.flee > 0) ped.flee -= dt;
    const dpl = Math.hypot(ped.x - ppos.x, ped.y - ppos.y);
    let vx = 0, vy = 0;
    if (ped.flee > 0 || (world.wanted > 0 && dpl < 140)) {
      const n = norm(ped.x - ppos.x, ped.y - ppos.y);
      vx = n.x * PED.fleeSpeed; vy = n.y * PED.fleeSpeed;
    } else {
      ped.wanderT -= dt;
      if (ped.wanderT <= 0) { ped.angle += randRange(world.rng, -1.8, 1.8); ped.wanderT = randRange(world.rng, 0.6, 2.0); }
      vx = Math.cos(ped.angle) * PED.speed; vy = Math.sin(ped.angle) * PED.speed;
    }
    const nx = ped.x + vx * dt, ny = ped.y + vy * dt;
    const cw = constrainToWorld(nx, ny, 8);
    if (!collidesBuilding(world.city, cw.x, cw.y, 8)) { ped.x = cw.x; ped.y = cw.y; }
    else { ped.angle += Math.PI; }
  }
  // maintain count
  while (world.peds.length < PED.count) {
    const pnt = randomRoadPoint(world.city, world.rng);
    world.peds.push(makePed(world, pnt.x + randRange(world.rng,-50,50), pnt.y + randRange(world.rng,-50,50)));
  }
}

function updateCops(world, dt) {
  // spawn cops based on wanted
  const desired = world.wanted === 0 ? 0 : Math.min(1 + world.wanted * 2, 10);
  world._copSpawnT = (world._copSpawnT || 0) - dt;
  if (world.cops.length < desired && world._copSpawnT <= 0) {
    spawnCop(world);
    world._copSpawnT = COP.spawnCooldown / Math.max(1, world.wanted);
  }
  if (world.wanted === 0 && world.cops.length > 0) {
    // despawn gradually when clear
    world._copDespawnT = (world._copDespawnT || 0) - dt;
    if (world._copDespawnT <= 0) { world.cops.pop(); world._copDespawnT = 2; }
  }

  const target = playerCar(world) || world.player;
  for (let i = world.cops.length - 1; i >= 0; i--) {
    const cop = world.cops[i];
    if (cop.health <= 0) { world.cops.splice(i,1); continue; }
    if (cop.shootCd > 0) cop.shootCd -= dt;

    if (cop.inCarId) {
      const car = getCar(world, cop.inCarId);
      if (!car) { cop.inCarId = null; continue; }
      cop.x = car.x; cop.y = car.y;
      driveCopCar(world, cop, car, target, dt);
      // sometimes get out if close and on foot target? keep simple: stay in car
    } else {
      // on foot cop
      const dx = target.x - cop.x, dy = target.y - cop.y;
      const d = Math.hypot(dx,dy)||1;
      const sp = COP.speed;
      const nx = cop.x + dx/d * sp * dt;
      const ny = cop.y + dy/d * sp * dt;
      if (!collidesBuilding(world.city, nx, ny, 10)) { cop.x = nx; cop.y = ny; }
      cop.angle = Math.atan2(dy,dx);
    }

    // shoot at player at higher wanted
    const d = Math.hypot(target.x - cop.x, target.y - cop.y);
    if (world.wanted >= 2 && d < COP.shootRange && cop.shootCd <= 0 && hasLineish(world, cop.x, cop.y, target.x, target.y)) {
      cop.shootCd = COP.shootCooldown * (1.2 - world.wanted*0.1);
      const a = angTo(cop.x, cop.y, target.x + randRange(world.rng,-20,20), target.y + randRange(world.rng,-20,20));
      world.bullets.push({ id:nid(), x:cop.x+Math.cos(a)*14, y:cop.y+Math.sin(a)*14, vx:Math.cos(a)*COP.bulletSpeed, vy:Math.sin(a)*COP.bulletSpeed, life: COP.shootRange/COP.bulletSpeed, dmg: COP.bulletDamage, owner:'cop' });
    }

    if (d < COP.vision) world.wantedVisible = true;
  }
}

function hasLineish(world, ax, ay, bx, by) {
  // crude: sample points, blocked by buildings
  const steps = 6;
  for (let i=1;i<steps;i++) {
    const t=i/steps; const x=ax+(bx-ax)*t, y=ay+(by-ay)*t;
    if (collidesBuilding(world.city, x, y, 4)) return false;
  }
  return true;
}

function spawnCop(world) {
  const p = world.player;
  // spawn away from player on a road node
  let node = null;
  for (let i=0;i<20;i++) {
    const n = randomNode(world.city, world.rng);
    if (dist2(n.x,n.y,p.x,p.y) > 500*500) { node = n; break; }
  }
  if (!node) node = nearestNode(world.city, p.x + 600, p.y + 600);
  const car = makeCar(world, node.x, node.y, randRange(world.rng,0,TAU), 'police', true, { color: '#1c7ed6' });
  car.speed = 0;
  world.cars.push(car);
  const cop = { id:nid(), kind:'cop', x:car.x, y:car.y, angle:0, health:70, inCarId: car.id, shootCd: randRange(world.rng,0.3,1.0) };
  world.cops.push(cop);
}

function driveCopCar(world, cop, car, target, dt) {
  const dx = target.x - car.x, dy = target.y - car.y;
  const d = Math.hypot(dx,dy)||1;
  const desired = Math.atan2(dy, dx);
  let da = desired - car.angle;
  while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
  car.angle += clamp(da, -2.8*dt, 2.8*dt);
  const wantSpeed = d > 120 ? COP.carSpeed : COP.carSpeed * 0.5;
  if (car.speed < wantSpeed) car.speed += VEHICLE.accel * 1.2 * dt; else car.speed -= VEHICLE.brake * 0.5 * dt;
  car.speed = clamp(car.speed, -40, COP.carSpeed);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (!collidesBuilding(world.city, nx, ny, 18)) { car.x = nx; car.y = ny; }
  else { car.angle += Math.PI * 0.6; car.speed *= 0.5; }
}

function updateBullets(world, dt) {
  const p = world.player;
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0;
    if (collidesBuilding(world.city, b.x, b.y, 2)) dead = true;
    if (!dead && b.owner === 'player') {
      for (const ped of world.peds) {
        if (dist2(b.x,b.y,ped.x,ped.y) < 12*12) { ped.health -= b.dmg; ped.flee = 4; dead = true; noteCrime(world,WANTED.killHeat,ped.x,ped.y); break; }
      }
      if (!dead) for (const cop of world.cops) {
        if (dist2(b.x,b.y,cop.x,cop.y) < 13*13) { cop.health -= b.dmg; dead = true; noteCrime(world,WANTED.killHeat,cop.x,cop.y); break; }
      }
    } else if (!dead && b.owner === 'cop') {
      const tx = p.inCarId ? (playerCar(world)?.x ?? p.x) : p.x;
      const ty = p.inCarId ? (playerCar(world)?.y ?? p.y) : p.y;
      if (dist2(b.x,b.y,tx,ty) < 14*14) {
        p.health -= b.dmg; dead = true; audio.hit();
        if (p.health <= 0) { p.health = 0; p.alive = false; world.message = 'Wasted in Costa Luna.'; world.messageTimer = 3; audio.wasted(); }
      }
    }
    if (dead) world.bullets.splice(i,1);
  }
}

function updateWanted(world, dt) {
  if (world.wanted <= 0) { world.wantedVisible = false; return; }
  // visible if any cop close
  let visible = false;
  const p = world.player;
  const px = p.x, py = p.y;
  for (const cop of world.cops) {
    if (dist2(px,py,cop.x,cop.y) < (COP.vision*COP.vision)) { visible = true; break; }
  }
  world.wantedVisible = visible;
  if (!visible) {
    world.wantedHidden += dt;
    if (world.wantedHidden >= WANTED.decayTime) {
      world.wanted = Math.max(0, world.wanted - 1);
      world.wantedHidden = 0;
      world.message = world.wanted > 0 ? `${POLICE_NAME} losing interest... Wanted ${world.wanted}.` : `You lost ${POLICE_NAME}.`;
      world.messageTimer = 2.5;
    }
  } else {
    world.wantedHidden = Math.max(0, world.wantedHidden - dt * 0.5);
  }
}

function completeJob(world, text) {
  world.jobCompleteTimer = 2.2;
  world.screen = 'jobcomplete';
  world.message = text;
  world.messageTimer = 2.2;
  audio.mission();
}

function checkMission(world) {
  const m = world.mission; if (!m) return;
  const p = world.player;
  const car = playerCar(world);
  const at = (pt, r=70) => dist2(p.x,p.y,pt.x,pt.y) < r*r;

  if (m.id === MISSIONS.INTRO) {
    if (m.state === 'steal') {
      if (car && car.id === m.targetCarId) {
        m.state = 'deliver';
        world.message = `Coupe secured. Deliver it to ${m.dropoff.name}.`;
        world.messageTimer = 3;
        audio.cash();
      }
    } else if (m.state === 'deliver') {
      if (car && car.id === m.targetCarId && at(m.dropoff, 80)) {
        world.money += m.reward;
        completeJob(world, `Job complete: ${m.name}! +$${m.reward} from ${FIXER_NAME}.`);
        // remove mission tag but keep car
        car.missionTag = null; m.targetCarId = null;
        world.mission = null; world.missionStage = 1;
        world._nextMissionT = 2.5;
      }
    }
  } else if (m.id === MISSIONS.DELIVER) {
    if (m.state === 'pickup') {
      if (car && car.id === m.targetCarId) {
        m.state = 'deliver'; world.message = `Case collected. Deliver to ${m.dropoff.name}.`; world.messageTimer = 3;
      } else if (!car && at(m.pickup, 90)) {
        world.message = `Get in the marked case car at ${m.pickup.name}.`; world.messageTimer = 1.2;
      }
    } else if (m.state === 'deliver') {
      if (car && at(m.dropoff, 80)) {
        world.money += m.reward;
        m.state = 'losecops';
        world.wanted = Math.max(world.wanted, 2);
        world.message = `Case delivered. Now lose ${POLICE_NAME}!`; world.messageTimer = 4;
        completeJob(world, `Delivery done: ${m.name}! +$${m.reward}`);
        audio.sirenUp();
      }
    } else if (m.state === 'losecops') {
      if (world.wanted === 0) {
        completeJob(world, `Heat lost. ${FIXER_NAME}: You're clear for side jobs.`);
        world.mission = null; world.missionStage = 2; world._nextMissionT = 3;
      }
    }
  } else if (m.id === MISSIONS.FREE_ROAM) {
    if (m.state === 'goto_pickup') {
      if (at(m.pickup, 80) && !car) {
        m.state = 'deliver'; world.message = `Package acquired. Deliver to ${m.dropoff.name}.`; world.messageTimer = 3; audio.cash();
      } else if (at(m.pickup, 80) && car) {
        world.message = `Exit your car to pick up the package from ${FIXER_NAME}.`; world.messageTimer = 1.5;
      }
    } else if (m.state === 'deliver') {
      if (at(m.dropoff, 85)) {
        world.money += m.reward;
        completeJob(world, `Side job complete! +$${m.reward}`);
        world.mission = null; world.sideJobCooldown = 6;
      }
    }
  }

  // mission progression timers
  if (!world.mission && world._nextMissionT != null) {
    world._nextMissionT -= 1/60; // approx; called per tick
    if (world._nextMissionT <= 0) {
      world._nextMissionT = null;
      if (world.missionStage === 1) setupMission2(world);
      else if (world.missionStage >= 2) setupSideJob(world);
    }
  } else if (!world.mission && world.missionStage >= 2 && world.sideJobCooldown <= 0) {
    // allow picking up side job by visiting plaza on foot; prompt
    const plaza = placeById('plaza');
    if (!car && dist2(p.x,p.y,plaza.x+plaza.w/2, plaza.y+plaza.h/2) < 90*90) {
      setupSideJob(world);
    }
  }
}

function centerCamera(world, snap = false) {
  const p = world.player;
  const car = playerCar(world);
  const tx = (car ? car.x : p.x) - 1280/2;
  const ty = (car ? car.y : p.y) - 720/2;
  const cx = clamp(tx, 0, Math.max(0, WORLD.width - 1280));
  const cy = clamp(ty, 0, Math.max(0, WORLD.height - 720));
  if (snap) { world.camera.x = cx; world.camera.y = cy; }
  else { world.camera.x += (cx - world.camera.x) * 0.18; world.camera.y += (cy - world.camera.y) * 0.18; }
}

export function applyShot(world, shot, seed) {
  // reset to deterministic state for shot, bypassing save
  const fresh = createWorld(seed || 1);
  // copy core arrays/objects
  world.seed = fresh.seed; world.city = fresh.city; world.rng = fresh.rng;
  world.time = fresh.time; world.money = fresh.money; world.wanted = fresh.wanted; world.wantedHidden = 0; world.wantedVisible = false;
  world.mission = fresh.mission; world.missionStage = fresh.missionStage; world.objective = fresh.objective; world.objectivePos = fresh.objectivePos;
  world.jobCompleteTimer = 0; world.message = fresh.message; world.messageTimer = 2; world.sideJobCooldown = 0;
  world.player = fresh.player; world.cars = fresh.cars; world.peds = fresh.peds; world.cops = fresh.cops; world.bullets = [];
  world.screen = 'playing'; world.shotMode = shot;

  if (shot === 'start') {
    world.screen = 'title';
  } else if (shot === 'play') {
    world.screen = 'playing';
    world.message = `${FIXER_NAME}: Steal the coupe at Hotel Azure.`;
  } else if (shot === 'drive') {
    world.screen = 'playing';
    // put player in nearest car and place on a road
    const car = world.cars.find(c => !c.occupied && c.type !== 'police') || world.cars[0];
    if (car) { car.occupied = true; car.driver = 'player'; world.player.inCarId = car.id; world.player.x = car.x; world.player.y = car.y; car.speed = 180; }
    world.message = 'Driving through Costa Luna.';
  } else if (shot === 'wanted') {
    world.screen = 'playing';
    world.wanted = 4; world.wantedVisible = true;
    setupWantedShot(world);
    world.message = `${POLICE_NAME} are on your tail!`;
  }
  updateObjective(world);
  centerCamera(world, true);
}

function setupWantedShot(world) {
  // ensure player driving and cops present
  let car = playerCar(world);
  if (!car) {
    car = world.cars.find(c => !c.occupied && c.type !== 'police') || world.cars[0];
    if (car) { car.occupied = true; car.driver = 'player'; world.player.inCarId = car.id; car.speed = 220; }
  } else { car.speed = Math.max(car.speed, 200); }
  world.cops = [];
  for (let i=0;i<5;i++) spawnCop(world);
}
