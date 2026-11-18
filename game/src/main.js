// Solara Keys bootstrap and main loop.
// Supports ?shot=start|play|drive|wanted&seed=N for deterministic screenshots.

import { STEP, MAX_FRAME, SCREENS, TITLE } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createRenderer } from './render.js';
import { createInput, ACTION_START, ACTION_PAUSE, ACTION_INTERACT, ACTION_MELEE, ACTION_NEW_GAME } from './input.js';
import { stageShot } from './shots.js';
import { unlockAudio } from './audio.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = parseInt(params.get('seed') || '', 10);
const seed = Number.isFinite(seedParam) ? (seedParam >>> 0) : ((Math.random() * 0xffffffff) >>> 0);

const renderer = createRenderer(canvas);
const world = createWorld(seed);
const input = createInput(canvas);

let hasSave = false;
if (!shot) {
  hasSave = world.loadGame();
  // loadGame sets screen to TITLE when save found; keep hasSave flag for UI
  if (!hasSave) {
    world.state.screen = SCREENS.TITLE;
  } else {
    world.state.screen = SCREENS.TITLE;
  }
} else {
  // Shots must bypass stored save.
  world.clearSave();
}

function restartAfterWasted() {
  // restart run but keep same seed/session feel; simplest is reset world state and go to play
  const s = world.getSeed();
  world.resetWorld(s, false);
  world.state.player.health = 100;
  world.state.player.alive = true;
  world.state.player.inVehicleId = null;
  world.state.wanted.stars = 0;
  world.state.wanted.heat = 0;
  world.state.wanted.hiddenTimer = 0;
  // keep money/mission progress minimal restart: reset mission to beginning for fairness
  world.state.money = Math.max(0, world.state.money);
  world.startNewGame(s);
}

function newGame() {
  world.clearSave();
  const s = ((Math.random() * 0xffffffff) >>> 0);
  world.startNewGame(s);
  hasSave = false;
}

function continueOrStart() {
  if (world.state.screen === SCREENS.TITLE) {
    unlockAudio();
    if (hasSave) {
      // continue loaded state
      world.state.screen = SCREENS.PLAY;
      world.state.message = world.state.message || 'Back in Costa Luna.';
      world.state.messageTimer = 2.0;
    } else {
      world.state.screen = SCREENS.PLAY;
      world.state.message = 'Mara Quill: Steal the coupe at Hotel Azure.';
      world.state.messageTimer = 3.5;
    }
  } else if (world.state.screen === SCREENS.WASTED) {
    unlockAudio();
    restartAfterWasted();
  } else if (world.state.screen === SCREENS.COMPLETE) {
    // allow skipping beat
    world.state.mission.completeBeat = 0;
    world.state.screen = SCREENS.PLAY;
  }
}

function togglePause() {
  if (world.state.screen === SCREENS.PLAY) {
    world.state.screen = SCREENS.PAUSE;
    world.saveGame();
    hasSave = true;
  } else if (world.state.screen === SCREENS.PAUSE) {
    world.state.screen = SCREENS.PLAY;
  }
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_NEW_GAME) {
    if (world.state.screen === SCREENS.TITLE) {
      newGame();
    }
  }
  if (actions & ACTION_START) {
    continueOrStart();
  }
  if (actions & ACTION_PAUSE) {
    if (world.state.screen === SCREENS.PLAY || world.state.screen === SCREENS.PAUSE) togglePause();
  }
  if (actions & ACTION_INTERACT) {
    if (world.state.screen === SCREENS.PLAY) world.interactContext();
  }
  if (actions & ACTION_MELEE) {
    if (world.state.screen === SCREENS.PLAY) world.meleeAttack();
  }
}

function update(dt) {
  handleActions();
  const mouse = input.mouse();
  const aimWorld = renderer.screenToWorld(mouse.x, mouse.y);
  // shooting: hold/click mouse while playing and on foot
  if (world.state.screen === SCREENS.PLAY && mouse.down && !world.state.player.inVehicleId) {
    world.shoot(aimWorld.x, aimWorld.y);
  }
  // consume click as start handled via ACTION_START, but also ensure mouse click can shoot once? shooting uses down
  input.takeClick();

  if (world.state.screen === SCREENS.PLAY) {
    world.step(dt, input, aimWorld, true);
  } else if (world.state.screen === SCREENS.COMPLETE) {
    world.step(dt, input, aimWorld, false);
  }
  // other screens static
}

let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    update(STEP);
    acc -= STEP;
  }
  renderer.draw(world, hasSave);
  requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', () => {
  if (!shot) world.saveGame();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && world.state.screen === SCREENS.PLAY) {
    world.state.screen = SCREENS.PAUSE;
    world.saveGame();
    hasSave = true;
  }
});

if (shot) {
  // stageShot will paint and set __shotReady
  stageShot(world, renderer, shot);
} else {
  requestAnimationFrame(frame);
}
