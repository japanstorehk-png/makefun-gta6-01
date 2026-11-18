// Solara Keys world: rules, entities, missions and state. No rendering, no DOM.
// Costa Luna is patrolled by Luna PD; your fixer is Mara Quill.

import {
  TITLE,
  CITY_NAME,
  FIXER_NAME,
  POLICE_NAME,
  PLACES,
  WORLD,
  PLAYER,
  VEHICLE,
  TRAFFIC,
  PED,
  WANTED,
  MONEY,
  SAVE_KEY,
  SCREENS,
} from './config.js';
import { createCity } from './city.js';
import { createRandom, randRange, choice, randInt } from './random.js';
import { sfx } from './audio.js';

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function normAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

function vehicleAt(v) { return { x: v.x, y: v.y, w: VEHICLE.width, h: VEHICLE.height, a: v.angle }; }
function pointInRotRect(px, py, r) {
  const dx = px - r.x, dy = py - r.y;
  const c = Math.cos(-r.a), s = Math.sin(-r.a);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return Math.abs(lx) < r.w / 2 + 6 && Math.abs(ly) < r.h / 2 + 6;
}

export function createWorld(initialSeed) {
  let seed = initialSeed >>> 0;
  let rng = createRandom(seed);
  let city = createCity(rng);
  const state = {};

  function resetWorld(newSeed = seed, fresh = true) {
    seed = (newSeed >>> 0) || 1;
    rng = createRandom(seed);
    city = createCity(rng);

    const hotel = city.placeById('hotel');
    const spawn = { x: hotel.x + hotel.w / 2, y: hotel.y + hotel.h + 40 };

    state.seed = seed;
    state.time = 0;
    state.screen = SCREENS.TITLE;
    state.screenTimer = 0;
    state.message = '';
    state.messageTimer = 0;
    state.player = {
      x: spawn.x, y: spawn.y, angle: -Math.PI / 2,
      health: PLAYER.maxHealth, alive: true,
      inVehicleId: null,
      meleeTimer: 0, shootTimer: 0,
      invuln: 0,
    };
    state.money = MONEY.start;
    state.wanted = { stars: 0, heat: 0, hiddenTimer: 0, seen: false };
    state.vehicles = [];
    state.peds = [];
    state.bullets = [];
    state.nextId = 1;
    state.mission = createMissionState();
    state.stats = { carsStolen: 0, pedsHit: 0 };

    spawnTraffic();
    spawnPeds();
    setupMissionVehicles();
    setObjectiveForStage();

    if (fresh) {
      state.message = `Welcome to ${CITY_NAME}. ${FIXER_NAME} has work for you.`;
      state.messageTimer = 4;
    }
  }

  function createMissionState() {
    return {
      stage: 0, // 0 intro/steal coupe,1 deliver,2 case pickup,3 lose cops & deliver,4 free roam side jobs
      completeBeat: 0,
      targetVehicleId: null,
      targetPlaceId: null,
      pickupPlaceId: null,
      sideJob: null, // {pickupId, dropId, reward, active, hasPackage}
      jobsDone: 0,
    };
  }

  function addVehicle(opts) {
    const v = {
      id: state.nextId++,
      x: opts.x, y: opts.y, angle: opts.angle || 0,
      speed: 0, vx: 0, vy: 0,
      type: opts.type || 'traffic', // traffic|parked|police|mission|playerparked
      color: opts.color || '#60a5fa',
      driver: opts.driver || 'none', // none|traffic|police|player
      node: opts.node || null,
      prevNodeId: opts.prevNodeId ?? -1,
      targetNodeId: opts.targetNodeId ?? null,
      edgeT: opts.edgeT || 0,
      hp: opts.hp || 80,
      dead: false,
      wantedForMission: !!opts.wantedForMission,
      siren: 0,
      shootTimer: randRange(rng, 0.2, 1.0),
    };
    state.vehicles.push(v);
    return v;
  }

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i++) {
      const n = city.randomNode();
      const e = city.pickNextEdge(n, -1);
      const t = e ? city.nodes[e.to] : n;
      const ang = e ? Math.atan2(t.y - n.y, t.x - n.x) : randRange(rng, 0, Math.PI * 2);
      addVehicle({
        x: n.x + (rng() - 0.5) * 10,
        y: n.y + (rng() - 0.5) * 10,
        angle: ang,
        type: 'traffic',
        color: choice(rng, ['#60a5fa', '#94a3b8', '#34d399', '#f472b6', '#a78bfa']),
        driver: 'traffic',
        node: n,
        prevNodeId: -1,
        targetNodeId: e ? e.to : null,
        edgeT: randRange(rng, 0, 0.5),
      });
    }
  }

  function spawnPeds() {
    for (let i = 0; i < PED.count; i++) {
      const p = city.pointOnRoads();
      const o = { x: Math.cos(i) * 18, y: Math.sin(i) * 18 };
      state.peds.push({
        id: state.nextId++,
        x: clamp(p.x + o.x, 20, WORLD.width - 20),
        y: clamp(p.y + o.y, 20, WORLD.height - 20),
        vx: 0, vy: 0,
        dir: randRange(rng, 0, Math.PI * 2),
        dirTimer: randRange(rng, 0.5, 2.5),
        hp: 40,
        dead: false,
      });
    }
  }

  function setupMissionVehicles() {
    // Opening job: steal a coupe at Hotel Azure.
    const hotel = city.placeById('hotel');
    const coupe = addVehicle({
      x: hotel.x + hotel.w / 2 - 30,
      y: hotel.y + hotel.h + 18,
      angle: 0,
      type: 'mission',
      color: '#f97316',
      driver: 'none',
      hp: 120,
      wantedForMission: true,
    });
    state.mission.targetVehicleId = coupe.id;
    state.mission.targetPlaceId = 'hotel';
  }

  function setObjectiveForStage() {
    const m = state.mission;
    if (m.stage === 0) {
      state.objective = `Steal the coupe at Hotel Azure for ${FIXER_NAME}.`;
    } else if (m.stage === 1) {
      const dest = city.placeById(m.targetPlaceId || 'marina');
      state.objective = `Deliver the coupe to ${dest.name}.`;
    } else if (m.stage === 2) {
      const p = city.placeById(m.pickupPlaceId || 'warehouse');
      state.objective = `Pick up a case at ${p.name} for ${FIXER_NAME}.`;
    } else if (m.stage === 3) {
      const dest = city.placeById(m.targetPlaceId || 'dock');
      const needLose = state.wanted.stars > 0 ? ` Lose ${POLICE_NAME} and` : '';
      state.objective = `${needLose} deliver the case to ${dest.name}.`.trim();
    } else {
      if (m.sideJob && m.sideJob.active) {
        const p = city.placeById(m.sideJob.hasPackage ? m.sideJob.dropId : m.sideJob.pickupId);
        state.objective = m.sideJob.hasPackage ? `Side job: deliver package to ${p.name}.` : `Side job: collect package at ${p.name}.`;
      } else {
        state.objective = 'Free roam: cause trouble, earn cash, or start a side job at Plaza.';
      }
    }
  }

  function playerVehicle() {
    if (!state.player.inVehicleId) return null;
    return state.vehicles.find((v) => v.id === state.player.inVehicleId) || null;
  }

  function addHeat(amount) {
    const w = state.wanted;
    const before = w.stars;
    w.heat += amount;
    while (w.heat >= WANTED.crimeHeat && w.stars < WANTED.max) {
      w.heat -= WANTED.crimeHeat;
      w.stars += 1;
    }
    w.heat = clamp(w.heat, 0, WANTED.crimeHeat * 1.5);
    if (w.stars > before) {
      sfx.wanted();
      state.message = `${POLICE_NAME} wanted level ${w.stars}!`;
      state.messageTimer = 2.5;
      ensurePolicePresence();
    }
    setObjectiveForStage();
  }

  function ensurePolicePresence() {
    const need = state.wanted.stars * WANTED.policePerStar;
    const current = state.vehicles.filter((v) => v.type === 'police' && !v.dead).length;
    for (let i = current; i < need; i++) spawnPoliceCar();
  }

  function spawnPoliceCar() {
    // Spawn at a road node away from player.
    let n = city.randomNode();
    const px = state.player.x, py = state.player.y;
    for (let i = 0; i < 10; i++) {
      const c = city.randomNode();
      if (dist2(c.x, c.y, px, py) > 600 * 600) { n = c; break; }
    }
    addVehicle({
      x: n.x, y: n.y, angle: randRange(rng, 0, Math.PI * 2),
      type: 'police', color: '#3b82f6', driver: 'police',
      node: n, targetNodeId: null, prevNodeId: -1, hp: 100,
    });
  }

  function tryEnterExit() {
    if (!state.player.alive) return;
    const pv = playerVehicle();
    if (pv) {
      // Exit vehicle: place player beside it.
      pv.driver = 'none';
      pv.speed *= 0.4;
      state.player.inVehicleId = null;
      const side = state.player.angle + Math.PI / 2;
      state.player.x = pv.x + Math.cos(side) * 28;
      state.player.y = pv.y + Math.sin(side) * 28;
      sfx.enter();
      state.message = 'On foot.';
      state.messageTimer = 1.2;
      return;
    }
    // Find nearest vehicle to enter/steal.
    let best = null, bestD = VEHICLE.enterRadius;
    for (const v of state.vehicles) {
      if (v.dead) continue;
      const d = dist(state.player.x, state.player.y, v.x, v.y);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (!best) return;

    const wasOccupied = best.driver === 'traffic' || best.driver === 'police';
    const stealing = best.driver !== 'player' && best.type !== 'trafficOwned';
    best.driver = 'player';
    best.type = best.type === 'police' ? 'police' : (best.wantedForMission ? 'mission' : 'playercar');
    state.player.inVehicleId = best.id;
    state.player.x = best.x; state.player.y = best.y;

    if (stealing && (wasOccupied || best.wantedForMission || best.type === 'police' || best.type === 'mission')) {
      state.stats.carsStolen += 1;
      state.money += MONEY.stealBonus;
      addHeat(best.type === 'police' ? 30 : 14);
      sfx.steal();
      state.message = best.type === 'police' ? `Stole a ${POLICE_NAME} cruiser!` : 'Car stolen.';
      state.messageTimer = 1.8;
      if (best.wantedForMission && state.mission.stage === 0) {
        // picked up mission car, objective updates to deliver
      }
    } else {
      sfx.enter();
      state.message = 'Entered vehicle.';
      state.messageTimer = 1.0;
    }
    checkMissionProgress();
  }

  function meleeAttack() {
    if (!state.player.alive || state.player.inVehicleId) return;
    if (state.player.meleeTimer > 0) return;
    state.player.meleeTimer = PLAYER.meleeCooldown;
    const px = state.player.x + Math.cos(state.player.angle) * 12;
    const py = state.player.y + Math.sin(state.player.angle) * 12;
    let did = false;
    for (const ped of state.peds) {
      if (ped.dead) continue;
      if (dist(px, py, ped.x, ped.y) < PLAYER.meleeRange) {
        ped.hp -= PLAYER.meleeDamage;
        ped.vx += Math.cos(state.player.angle) * 120;
        ped.vy += Math.sin(state.player.angle) * 120;
        did = true;
        if (ped.hp <= 0) { ped.dead = true; state.stats.pedsHit += 1; }
      }
    }
    // can hit nearby police on foot? police are in cars in this model; allow damaging nearby vehicle if very close
    if (did) { addHeat(10); sfx.hit(); state.message = 'Melee hit.'; state.messageTimer = 0.8; }
  }

  function shoot(aimWorldX, aimWorldY) {
    if (!state.player.alive || state.player.inVehicleId) return;
    if (state.player.shootTimer > 0) return;
    state.player.shootTimer = PLAYER.shootCooldown;
    const ang = Math.atan2(aimWorldY - state.player.y, aimWorldX - state.player.x);
    state.player.angle = ang;
    state.bullets.push({
      x: state.player.x + Math.cos(ang) * 14,
      y: state.player.y + Math.sin(ang) * 14,
      vx: Math.cos(ang) * PLAYER.bulletSpeed,
      vy: Math.sin(ang) * PLAYER.bulletSpeed,
      owner: 'player',
      life: PLAYER.bulletRange / PLAYER.bulletSpeed,
      damage: PLAYER.bulletDamage,
    });
    addHeat(8);
    sfx.shoot();
  }

  function spawnBullet(x, y, ang, owner, speed, damage, life) {
    state.bullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, owner, life, damage });
  }

  function damagePlayer(amount) {
    if (!state.player.alive || state.player.invuln > 0) return;
    state.player.health -= amount;
    state.player.invuln = 0.4;
    if (state.player.health <= 0) {
      state.player.health = 0;
      state.player.alive = false;
      // eject from vehicle
      const pv = playerVehicle();
      if (pv) { pv.driver = 'none'; state.player.inVehicleId = null; }
      state.screen = SCREENS.WASTED;
      state.screenTimer = 0;
      sfx.wasted();
    }
  }

  function updatePlayer(dt, input, aimWorld) {
    if (!state.player.alive) return;
    state.player.meleeTimer = Math.max(0, state.player.meleeTimer - dt);
    state.player.shootTimer = Math.max(0, state.player.shootTimer - dt);
    state.player.invuln = Math.max(0, state.player.invuln - dt);

    if (aimWorld && !state.player.inVehicleId) {
      state.player.angle = Math.atan2(aimWorld.y - state.player.y, aimWorld.x - state.player.x);
    }

    const pv = playerVehicle();
    if (pv) {
      updateDriving(dt, input, pv);
      state.player.x = pv.x; state.player.y = pv.y; state.player.angle = pv.angle;
    } else {
      updateOnFoot(dt, input);
    }
  }

  function updateOnFoot(dt, input) {
    const axis = input.axis();
    const spd = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    state.player.x += axis.x * spd * dt;
    state.player.y += axis.y * spd * dt;
    state.player.x = clamp(state.player.x, 12, WORLD.width - 12);
    state.player.y = clamp(state.player.y, 12, WORLD.height - 12);
    // simple push out of water blocks
    for (const w of city.water) {
      if (state.player.x > w.x && state.player.x < w.x + w.w && state.player.y > w.y && state.player.y < w.y + w.h) {
        // push to nearest edge
        const left = state.player.x - w.x, right = w.x + w.w - state.player.x;
        const top = state.player.y - w.y, bottom = w.y + w.h - state.player.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) state.player.x = w.x - 1;
        else if (m === right) state.player.x = w.x + w.w + 1;
        else if (m === top) state.player.y = w.y - 1;
        else state.player.y = w.y + w.h + 1;
      }
    }
  }

  function updateDriving(dt, input, v) {
    const axis = input.axis();
    const accelInput = -axis.y; // W up = forward in screen? we'll treat W as accelerate forward relative to car facing? simpler: axis.y -1 means forward
    const steerInput = axis.x;
    const hand = input.handbrake();
    if (accelInput > 0.1) v.speed += VEHICLE.accel * dt;
    else if (accelInput < -0.1) v.speed -= VEHICLE.brake * dt;
    else {
      const fr = (hand ? VEHICLE.handbrakeFriction : VEHICLE.friction) * dt;
      if (v.speed > 0) v.speed = Math.max(0, v.speed - fr);
      else if (v.speed < 0) v.speed = Math.min(0, v.speed + fr);
    }
    v.speed = clamp(v.speed, -VEHICLE.maxSpeed * 0.4, VEHICLE.maxSpeed);
    if (Math.abs(v.speed) > 5) {
      const turn = (hand ? VEHICLE.handbrakeTurn : VEHICLE.turnRate) * steerInput * (v.speed / VEHICLE.maxSpeed);
      v.angle += turn * dt;
    }
    v.x += Math.cos(v.angle) * v.speed * dt;
    v.y += Math.sin(v.angle) * v.speed * dt;
    v.x = clamp(v.x, 20, WORLD.width - 20);
    v.y = clamp(v.y, 20, WORLD.height - 20);
  }

  function updateTraffic(dt) {
    for (const v of state.vehicles) {
      if (v.dead) continue;
      if (v.driver === 'player') continue;
      if (v.driver === 'traffic') driveAlongRoads(dt, v, TRAFFIC.speed, TRAFFIC.maxSpeed, null);
      else if (v.driver === 'police') drivePolice(dt, v);
    }
  }

  function driveAlongRoads(dt, v, cruise, maxSpd, targetPos) {
    // Follow graph edges toward targetNodeId; if none choose one.
    if (v.targetNodeId == null && v.node) {
      const e = city.pickNextEdge(v.node, v.prevNodeId);
      if (e) v.targetNodeId = e.to;
    }
    let tx, ty;
    if (targetPos) { tx = targetPos.x; ty = targetPos.y; }
    else if (v.targetNodeId != null) {
      const tn = city.nodes[v.targetNodeId];
      tx = tn.x; ty = tn.y;
    } else {
      tx = v.x + Math.cos(v.angle) * 40; ty = v.y + Math.sin(v.angle) * 40;
    }
    const desired = angleTo(v.x, v.y, tx, ty);
    let diff = normAngle(desired - v.angle);
    v.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
    // simple speed control
    const dToTarget = dist(v.x, v.y, tx, ty);
    let targetSpeed = cruise;
    if (targetPos) targetSpeed = Math.min(maxSpd, cruise + dist(v.x, v.y, targetPos.x, targetPos.y) * 0.2);
    if (dToTarget < 30 && !targetPos) targetSpeed = cruise * 0.7;
    // avoid crowding player vehicle a bit
    const pv = playerVehicle();
    if (pv && pv !== v) {
      const d = dist(v.x, v.y, pv.x, pv.y);
      if (d < 50) targetSpeed = Math.min(targetSpeed, 40);
    }
    v.speed += clamp(targetSpeed - v.speed, -180 * dt, 140 * dt);
    v.speed = clamp(v.speed, 0, maxSpd);
    v.x += Math.cos(v.angle) * v.speed * dt;
    v.y += Math.sin(v.angle) * v.speed * dt;

    if (!targetPos && v.targetNodeId != null && dToTarget < 18) {
      v.prevNodeId = v.node ? v.node.id : -1;
      v.node = city.nodes[v.targetNodeId];
      const e = city.pickNextEdge(v.node, v.prevNodeId);
      v.targetNodeId = e ? e.to : null;
    }
    v.x = clamp(v.x, 20, WORLD.width - 20);
    v.y = clamp(v.y, 20, WORLD.height - 20);
  }

  function drivePolice(dt, v) {
    if (state.wanted.stars <= 0) {
      // calm down / wander
      driveAlongRoads(dt, v, 90, 120, null);
      return;
    }
    const px = state.player.x, py = state.player.y;
    const d = dist(v.x, v.y, px, py);
    // chase: aim at player with some lead via road-ish steering by directly steering toward player (arcade)
    const desired = angleTo(v.x, v.y, px, py);
    let diff = normAngle(desired - v.angle);
    v.angle += clamp(diff, -3.2 * dt, 3.2 * dt);
    let targetSpeed = 160 + state.wanted.stars * 25;
    if (d < 60) targetSpeed = 110;
    v.speed += clamp(targetSpeed - v.speed, -220 * dt, 200 * dt);
    v.speed = clamp(v.speed, 0, VEHICLE.maxSpeed + 20);
    v.x += Math.cos(v.angle) * v.speed * dt;
    v.y += Math.sin(v.angle) * v.speed * dt;
    v.x = clamp(v.x, 20, WORLD.width - 20);
    v.y = clamp(v.y, 20, WORLD.height - 20);

    // ram/contact damage to player vehicle or on foot
    if (d < 26 && state.player.alive) {
      const pv = playerVehicle();
      if (pv) damagePlayer(8 * dt * (1 + state.wanted.stars * 0.2));
      else damagePlayer(10 * dt);
      state.wanted.seen = true;
      state.wanted.hiddenTimer = 0;
    }

    // shoot at higher stars
    v.shootTimer -= dt;
    if (state.wanted.stars >= WANTED.policeShootStar && d < 360 && v.shootTimer <= 0 && state.player.alive) {
      v.shootTimer = WANTED.policeShotCooldown * randRange(rng, 0.7, 1.3);
      const spread = randRange(rng, -0.12, 0.12);
      spawnBullet(v.x, v.y, desired + spread, 'police', 520, 12 + state.wanted.stars * 2, 1.2);
      sfx.shoot();
      state.wanted.seen = true; state.wanted.hiddenTimer = 0;
    }
  }

  function updatePeds(dt) {
    const px = state.player.x, py = state.player.y;
    const pv = playerVehicle();
    for (const p of state.peds) {
      if (p.dead) continue;
      p.dirTimer -= dt;
      if (p.dirTimer <= 0) {
        p.dirTimer = randRange(rng, 0.6, 2.8);
        p.dir = randRange(rng, 0, Math.PI * 2);
      }
      let sp = PED.speed;
      // flee from fast player vehicle
      if (pv && Math.abs(pv.speed) > 80 && dist(p.x, p.y, pv.x, pv.y) < 90) {
        p.dir = angleTo(pv.x, pv.y, p.x, p.y);
        sp = 80;
      }
      p.vx = Math.cos(p.dir) * sp;
      p.vy = Math.sin(p.dir) * sp;
      // simple damping from hits
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.x = clamp(p.x, 12, WORLD.width - 12);
      p.y = clamp(p.y, 12, WORLD.height - 12);

      // collision with player car
      if (pv && Math.abs(pv.speed) > 60 && pointInRotRect(p.x, p.y, vehicleAt(pv))) {
        p.hp -= 50; p.dead = true; state.stats.pedsHit += 1; addHeat(6);
      }
      // avoid water
      for (const w of city.water) {
        if (p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h) {
          p.dir += Math.PI; p.x += Math.cos(p.dir) * 10; p.y += Math.sin(p.dir) * 10;
        }
      }
    }
  }

  function updateBullets(dt) {
    for (const b of state.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height) { b.dead = true; continue; }
      if (b.owner === 'player') {
        for (const p of state.peds) {
          if (p.dead) continue;
          if (dist(b.x, b.y, p.x, p.y) < 10) { p.hp -= b.damage; b.dead = true; if (p.hp <= 0) { p.dead = true; state.stats.pedsHit += 1; } addHeat(12); sfx.hit(); break; }
        }
        if (b.dead) continue;
        for (const v of state.vehicles) {
          if (v.dead || v.driver === 'player') continue;
          if (pointInRotRect(b.x, b.y, vehicleAt(v))) { v.hp -= b.damage * 0.5; b.dead = true; addHeat(v.type === 'police' ? 10 : 4); sfx.hit(); break; }
        }
      } else if (b.owner === 'police') {
        const pv = playerVehicle();
        if (pv && pointInRotRect(b.x, b.y, vehicleAt(pv))) { damagePlayer(b.damage); b.dead = true; }
        else if (!pv && dist(b.x, b.y, state.player.x, state.player.y) < 12) { damagePlayer(b.damage); b.dead = true; }
      }
    }
    state.bullets = state.bullets.filter((b) => !b.dead);
  }

  function updateWanted(dt) {
    const w = state.wanted;
    if (w.stars <= 0) { w.heat = Math.max(0, w.heat - WANTED.decayHidden * dt); return; }

    // Determine if any police can see player
    let seen = false;
    const px = state.player.x, py = state.player.y;
    for (const v of state.vehicles) {
      if (v.dead || v.type !== 'police') continue;
      const d = dist(v.x, v.y, px, py);
      if (d < WANTED.sightRange) { seen = true; break; }
    }
    w.seen = seen;
    if (seen) {
      w.hiddenTimer = 0;
      w.heat = Math.max(0, w.heat - WANTED.decayVisible * dt);
      ensurePolicePresence();
    } else {
      w.hiddenTimer += dt;
      w.heat = Math.max(0, w.heat - WANTED.decayHidden * dt);
      const need = WANTED.loseTime + w.stars * 1.5;
      if (w.hiddenTimer >= need) {
        w.stars -= 1;
        w.hiddenTimer = 0;
        w.heat = 0;
        state.message = w.stars > 0 ? `${POLICE_NAME} lost sight. Wanted ${w.stars}.` : `You lost ${POLICE_NAME}.`;
        state.messageTimer = 2.5;
        // remove excess police cars gradually
        prunePolice();
      }
    }
    // keep objective text fresh for stage 3
    if (state.mission.stage === 3) setObjectiveForStage();
  }

  function prunePolice() {
    const need = state.wanted.stars * WANTED.policePerStar;
    let cops = state.vehicles.filter((v) => v.type === 'police' && !v.dead);
    for (let i = cops.length - 1; i >= need; i--) {
      cops[i].dead = true;
    }
    state.vehicles = state.vehicles.filter((v) => !(v.type === 'police' && v.dead && dist(v.x, v.y, state.player.x, state.player.y) > 500));
  }

  function nearPlace(placeId, radius = 80) {
    const p = city.placeById(placeId);
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    return dist(state.player.x, state.player.y, cx, cy) < radius + Math.max(p.w, p.h) * 0.25;
  }

  function completeBeat(text, reward = 0) {
    state.mission.completeBeat = 2.2;
    state.screen = SCREENS.COMPLETE;
    state.screenTimer = 0;
    if (reward) state.money += reward;
    state.message = text;
    state.messageTimer = 2.5;
    sfx.complete();
  }

  function startSideJob() {
    if (state.mission.sideJob && state.mission.sideJob.active) return;
    // pick two different places
    const ids = PLACES.map((p) => p.id);
    const pickup = choice(rng, ids);
    let drop = choice(rng, ids);
    for (let i = 0; i < 6 && drop === pickup; i++) drop = choice(rng, ids);
    state.mission.sideJob = { pickupId: pickup, dropId: drop, reward: MONEY.sideJobReward, active: true, hasPackage: false };
    state.message = `Side job from ${FIXER_NAME}: pick up at ${city.placeById(pickup).name}.`;
    state.messageTimer = 3;
    setObjectiveForStage();
  }

  function checkMissionProgress() {
    const m = state.mission;
    const pv = playerVehicle();

    if (m.stage === 0) {
      // stole the coupe (player in mission target vehicle)
      if (pv && pv.id === m.targetVehicleId) {
        m.stage = 1;
        m.targetPlaceId = 'marina';
        completeBeat('Coupe stolen. Deliver it to Costa Marina.', 0);
        setObjectiveForStage();
      }
    } else if (m.stage === 1) {
      // deliver to marina while in that car
      if (pv && pv.id === m.targetVehicleId && nearPlace('marina', 70)) {
        m.stage = 2;
        m.pickupPlaceId = 'warehouse';
        // park the mission car as normal
        pv.driver = 'none'; pv.wantedForMission = false; pv.type = 'parked'; pv.speed = 0;
        state.player.inVehicleId = null;
        state.player.x = pv.x + 30; state.player.y = pv.y;
        completeBeat(`Delivery complete. ${FIXER_NAME}: collect a case at the Warehouse.`, MONEY.deliveryReward);
        setObjectiveForStage();
      }
    } else if (m.stage === 2) {
      // pick up case at warehouse on foot
      if (!pv && nearPlace(m.pickupPlaceId || 'warehouse', 70)) {
        m.stage = 3;
        m.targetPlaceId = 'dock';
        // trigger a wanted response as part of the job
        addHeat(WANTED.crimeHeat * 2 + 5);
        completeBeat(`Case secured. Lose ${POLICE_NAME} and deliver to the Dock.`, 0);
        setObjectiveForStage();
      }
    } else if (m.stage === 3) {
      // must have delivered? require on foot or in any vehicle at dock, and wanted 0 to be "lost police" (or allow if hidden enough?) objective says lose the police
      if (nearPlace(m.targetPlaceId || 'dock', 70) && state.wanted.stars === 0) {
        m.stage = 4;
        m.jobsDone += 1;
        completeBeat(`Case delivered. ${CITY_NAME} is open — take side jobs for ${FIXER_NAME}.`, MONEY.deliveryReward);
        setObjectiveForStage();
      } else if (nearPlace(m.targetPlaceId || 'dock', 70) && state.wanted.stars > 0) {
        state.message = `Lose ${POLICE_NAME} before you drop the case!`;
        state.messageTimer = 1.5;
      }
    } else {
      // free roam side jobs
      if (m.sideJob && m.sideJob.active) {
        if (!m.sideJob.hasPackage && nearPlace(m.sideJob.pickupId, 70)) {
          m.sideJob.hasPackage = true;
          state.message = `Package collected. Deliver to ${city.placeById(m.sideJob.dropId).name}.`;
          state.messageTimer = 2.5;
          setObjectiveForStage();
        } else if (m.sideJob.hasPackage && nearPlace(m.sideJob.dropId, 70)) {
          const reward = m.sideJob.reward;
          m.sideJob.active = false;
          m.sideJob = null;
          m.jobsDone += 1;
          completeBeat('Side job delivered.', reward);
          setObjectiveForStage();
        }
      } else if (!pv && nearPlace('plaza', 70)) {
        // offer side job when standing at plaza
        // triggered by interact/start flow through message prompt; auto-start here for simplicity when pressing E handled elsewhere
      }
    }
  }

  function interactContext() {
    // E key context: if can start side job at plaza in free roam
    const m = state.mission;
    if (state.screen !== SCREENS.PLAY) return;
    const pv = playerVehicle();
    if (pv) { tryEnterExit(); return; }
    // on foot: try enter car first
    let best = null, bestD = VEHICLE.enterRadius;
    for (const v of state.vehicles) { if (v.dead) continue; const d = dist(state.player.x, state.player.y, v.x, v.y); if (d < bestD) { bestD = d; best = v; } }
    if (best) { tryEnterExit(); return; }
    if (m.stage >= 4 && !m.sideJob && nearPlace('plaza', 70)) {
      startSideJob();
      return;
    }
  }

  function step(dt, input, aimWorld, allowControl = true) {
    state.time += dt;
    if (state.messageTimer > 0) state.messageTimer = Math.max(0, state.messageTimer - dt);
    if (state.screenTimer >= 0) state.screenTimer += dt;

    if (state.screen === SCREENS.COMPLETE) {
      state.mission.completeBeat -= dt;
      if (state.mission.completeBeat <= 0) {
        state.screen = SCREENS.PLAY;
      }
      // still allow world to tick lightly? easier to freeze except timer
      return;
    }
    if (state.screen === SCREENS.WASTED || state.screen === SCREENS.TITLE || state.screen === SCREENS.PAUSE) {
      // no simulation advance except maybe title idle camera feel handled in render
      return;
    }
    if (!allowControl) return;

    updatePlayer(dt, input, aimWorld);
    updateTraffic(dt);
    updatePeds(dt);
    updateBullets(dt);
    updateWanted(dt);
    checkMissionProgress();

    // periodic cleanup of dead peds/vehicles far away (respawn-lite feel not necessary, keep simple)
  }

  function startNewGame(newSeed) {
    resetWorld(newSeed != null ? newSeed : ((Math.random() * 0xffffffff) >>> 0), true);
    state.screen = SCREENS.PLAY;
  }

  function startFromTitle(newSeed) {
    if (newSeed != null) seed = newSeed >>> 0;
    // if no save loaded state (fresh), resetWorld already did; ensure play
    state.screen = SCREENS.PLAY;
    state.message = `${FIXER_NAME}: Steal the coupe at Hotel Azure.`;
    state.messageTimer = 3.5;
  }

  function serialize() {
    // minimal save of important progress
    const pv = playerVehicle();
    return {
      v: 1,
      seed: state.seed,
      money: state.money,
      player: { x: state.player.x, y: state.player.y, health: state.player.health, alive: state.player.alive, inVehicleId: state.player.inVehicleId },
      wanted: { stars: state.wanted.stars, heat: state.wanted.heat },
      mission: state.mission,
      objective: state.objective,
    };
  }

  function saveGame() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch {}
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return false;
      resetWorld(data.seed || seed, false);
      if (typeof data.money === 'number') state.money = data.money;
      if (data.player) {
        state.player.x = data.player.x ?? state.player.x;
        state.player.y = data.player.y ?? state.player.y;
        state.player.health = data.player.health ?? state.player.health;
        state.player.alive = data.player.alive !== false;
        state.player.inVehicleId = data.player.inVehicleId ?? null;
      }
      if (!playerVehicle()) state.player.inVehicleId = null;
      if (data.wanted) { state.wanted.stars = clamp(data.wanted.stars || 0, 0, WANTED.max); state.wanted.heat = data.wanted.heat || 0; }
      if (data.mission) state.mission = { ...createMissionState(), ...data.mission };
      if (data.objective) state.objective = data.objective;
      setObjectiveForStage();
      ensurePolicePresence();
      state.screen = SCREENS.TITLE; // load into title, continue from there
      state.message = 'Save loaded. Press Enter to continue.';
      state.messageTimer = 3;
      return true;
    } catch { return false; }
  }

  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

  // initial state
  const api = {
    state,
    city,
    resetWorld: (newSeed, fresh) => { resetWorld(newSeed, fresh); api.city = city; },
    step,
    shoot,
    meleeAttack,
    interactContext,
    startNewGame: (newSeed) => { startNewGame(newSeed); api.city = city; },
    startFromTitle,
    saveGame,
    loadGame: () => { const ok = loadGame(); api.city = city; return ok; },
    clearSave,
    playerVehicle,
    getSeed: () => seed,
  };
  resetWorld(initialSeed, true);
  api.city = city;
  return api;
}
