// Deterministic screenshot scenes for ?shot=start|play|drive|wanted&seed=N.
// Each scene stages the real world, draws it, and sets window.__shotReady.
// Shots bypass stored saves.

import { SCREENS, WANTED, TITLE } from './config.js';

function findNearestVehicle(world, pred = () => true) {
  const { state } = world;
  let best = null, bestD = Infinity;
  for (const v of state.vehicles) {
    if (v.dead) continue;
    if (!pred(v)) continue;
    const d = (v.x - state.player.x) ** 2 + (v.y - state.player.y) ** 2;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

export function stageShot(world, renderer, name) {
  // Bypass save: ensure fresh state for the seed already set by caller.
  world.clearSave();
  const { state } = world;

  if (name === 'start') {
    state.screen = SCREENS.TITLE;
    state.message = 'Welcome to Costa Luna.';
    state.messageTimer = 5;
  } else if (name === 'play') {
    state.screen = SCREENS.PLAY;
    state.player.inVehicleId = null;
    state.message = 'On foot in Costa Luna.';
    state.messageTimer = 5;
  } else if (name === 'drive') {
    state.screen = SCREENS.PLAY;
    // put player in nearest drivable car
    let car = findNearestVehicle(world, (v) => v.type !== 'police');
    if (!car) car = state.vehicles[0];
    if (car) {
      car.driver = 'player';
      state.player.inVehicleId = car.id;
      state.player.x = car.x; state.player.y = car.y;
      car.speed = 140;
    }
    state.message = 'Driving through Costa Luna.';
    state.messageTimer = 5;
  } else if (name === 'wanted') {
    state.screen = SCREENS.PLAY;
    state.wanted.stars = 4;
    state.wanted.heat = WANTED.crimeHeat * 0.5;
    state.wanted.hiddenTimer = 0;
    state.wanted.seen = true;
    // give player a car to make chase readable
    let car = findNearestVehicle(world, (v) => v.type !== 'police');
    if (!car) car = state.vehicles[0];
    if (car) {
      car.driver = 'player';
      car.type = 'playercar';
      state.player.inVehicleId = car.id;
      state.player.x = car.x; state.player.y = car.y;
      car.speed = 180;
    }
    // ensure police presence and pull some close
    // spawn/position a few police near player
    const px = state.player.x, py = state.player.y;
    let cops = state.vehicles.filter((v) => v.type === 'police' && !v.dead);
    const need = 4;
    for (let i = cops.length; i < need; i++) {
      const n = world.city.randomNode();
      world.state.vehicles.push({
        id: world.state.nextId++,
        x: n.x, y: n.y, angle: 0, speed: 150, vx: 0, vy: 0,
        type: 'police', color: '#3b82f6', driver: 'police',
        node: n, prevNodeId: -1, targetNodeId: null, edgeT: 0,
        hp: 100, dead: false, wantedForMission: false, siren: 0, shootTimer: 0.4,
      });
    }
    cops = state.vehicles.filter((v) => v.type === 'police' && !v.dead);
    const offsets = [[-180, -120], [200, -80], [-160, 160], [220, 140]];
    cops.slice(0, offsets.length).forEach((v, i) => {
      v.x = px + offsets[i][0];
      v.y = py + offsets[i][1];
      v.angle = Math.atan2(py - v.y, px - v.x);
      v.speed = 170;
      v.dead = false;
    });
    state.message = 'Luna PD is on you! Lose the heat.';
    state.messageTimer = 5;
  } else {
    state.screen = SCREENS.TITLE;
  }

  // advance a little so scene looks alive for play/drive/wanted
  if (name === 'play' || name === 'drive' || name === 'wanted') {
    const dt = 1 / 60;
    for (let i = 0; i < 30; i++) {
      // tick traffic/police minimally by stepping with no player control input
      // call step with a dummy input-like object via direct state nudges: easier to use world.step with stub
      world.step(dt, { axis: () => ({ x: 0, y: 0 }), sprint: () => false, handbrake: () => false }, null, true);
    }
  }

  let painted = 0;
  function paint() {
    renderer.draw(world, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}
