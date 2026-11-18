// Solara Keys - bootstrap, loop, and screen/state management.
import { STEP, SAVE_KEY } from './config.js';
import { createInput } from './input.js';
import { createRenderer, render } from './render.js';
import { createWorld, updateWorld, startNewGame, saveGame, loadGame, applyShot } from './world.js';
import { getShotParams, markShotReady } from './shots.js';
import { audio } from './audio.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const shot = getShotParams();

let world;
if (shot.active) {
  world = createWorld(shot.seed);
  applyShot(world, shot.shot, shot.seed);
} else {
  world = loadGame(shot.seed) || createWorld(1);
  world.screen = world.screen === 'wasted' ? 'title' : (world.screen || 'title');
  if (world.screen !== 'title' && world.screen !== 'playing') world.screen = 'title';
}

let last = performance.now();
let acc = 0;
let shotMarked = false;

function setStatus(text) { if (status) status.textContent = text; }

function handleGlobalInput() {
  const onTitle = world.screen === 'title';
  const onPause = world.screen === 'paused';
  const onWasted = world.screen === 'wasted';
  const onJob = world.screen === 'jobcomplete';

  // new game
  if ((onTitle || onPause || onWasted) && input.wasPressed('n')) {
    audio.unlock(); audio.click();
    startNewGame(world, 1);
    try { localStorage.removeItem(SAVE_KEY); } catch {}
    world.screen = 'playing';
    setStatus('New game started in Costa Luna.');
  }

  // start/continue
  const startPressed = input.wasPressed('enter') || input.mouseWasPressed();
  if (onTitle && startPressed) {
    audio.unlock(); audio.start();
    world.screen = 'playing';
    setStatus('Playing Solara Keys.');
  } else if (onWasted && startPressed) {
    audio.unlock(); audio.click();
    startNewGame(world, world.seed || 1);
    world.screen = 'playing';
  } else if (onJob && startPressed) {
    world.screen = 'playing';
  }

  // pause toggle
  if ((input.wasPressed('escape') || input.wasPressed('p')) && (world.screen === 'playing' || world.screen === 'paused')) {
    audio.unlock();
    if (world.screen === 'playing') {
      world.screen = 'paused';
      saveGame(world);
      setStatus('Paused. Game saved.');
    } else {
      world.screen = 'playing';
      setStatus('Resumed.');
    }
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt;

  handleGlobalInput();

  while (acc >= STEP) {
    updateWorld(world, input, STEP);
    input.endFrame();
    acc -= STEP;
  }

  render(renderer, world);

  if (!shotMarked) {
    // ensure one painted frame for shots; mark ready after render
    requestAnimationFrame(() => {
      if (!shotMarked) {
        shotMarked = true;
        if (shot.active) markShotReady({ shot: shot.shot, seed: shot.seed });
        else window.__gameReady = true;
      }
    });
  }

  requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', () => {
  if (!shot.active && world && world.screen !== 'title') {
    try { saveGame(world); } catch {}
  }
});
// also save on visibility change when paused/backgrounded
document.addEventListener('visibilitychange', () => {
  if (!shot.active && document.hidden && world && world.screen !== 'title') {
    try { saveGame(world); } catch {}
  }
});

requestAnimationFrame(frame);
