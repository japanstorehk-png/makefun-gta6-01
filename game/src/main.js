// Boot and the one loop. Input is read each frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one) and the renderer paints the result.
// Screens: title, play, paused (which saves) and the wasted overlay.
// Solara Keys note: the title screen keeps stepping the world so traffic lives behind
// the menu, and pause plus blur both write the save, so a closed tab never loses progress.
//
// ?seed=N fixes the traffic and pedestrian pattern. ?shot=start|play|drive|wanted (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { STEP, SAVE_KEY, computeView } from './config.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Math.random() * 4294967296) >>> 0;

window.addEventListener('error', (e) => {
  document.title = `ERR: ${e.message ?? 'unknown'}`;
});

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput();

let screen = 'title';
world.hasSave = !!readSave();

// Audio may only start after a user gesture, so wake it on the first key or click.
const wakeAudio = () => audio.ensure();
window.addEventListener('keydown', wakeAudio);
window.addEventListener('mousedown', wakeAudio);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

function saveGame() {
  if (screen !== 'title') writeSave(world.saveState());
}

function startGame(fresh) {
  if (fresh) {
    clearSave();
    world.newGame();
  } else {
    const save = readSave();
    if (save) world.applySave(save);
    else world.newGame();
  }
  world.hasSave = true;
  screen = 'play';
}

// -- input plumbing -----------------------------------------------------------

const blankAim = () => ({ aimX: world.player.x + 40, aimY: world.player.y });

function aimWorld() {
  const v = computeView(window.innerWidth, window.innerHeight);
  return {
    aimX: world.cam.x - 640 + (input.mouse.x - v.ox) / v.s,
    aimY: world.cam.y - 360 + (input.mouse.y - v.oy) / v.s,
  };
}

function stepFixed(dt, snap) {
  let acc = dt;
  let first = true;
  while (acc >= STEP) {
    const s = first ? { ...snap, ...blankEdges(snap) } : { ...snap, firePressed: false, meleePressed: false, interactPressed: false };
    world.step(STEP, s);
    acc -= STEP;
    first = false;
  }
  return acc;
}

function blankEdges(snap) {
  return { firePressed: snap.firePressed, meleePressed: snap.meleePressed, interactPressed: snap.interactPressed };
}

function drainSfx() {
  if (!world.sfx.length) return;
  for (const name of world.sfx) audio.play(name);
  world.sfx.length = 0;
}

function updateStatus() {
  if (screen === 'title') status.textContent = 'Solara Keys — press Enter or click to start';
  else if (world.wasted) status.textContent = 'Wasted. Press Enter to continue.';
  else if (screen === 'paused') status.textContent = 'Paused. Progress saved.';
  else status.textContent = world.objective ?? 'Solara Keys';
}

// -- the loop -------------------------------------------------------------------

let last = performance.now();
let leftover = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  const aim = aimWorld();
  const snap = input.snapshot(aim.aimX, aim.aimY);

  if (snap.mutePressed) audio.toggleMute();

  if (screen === 'title') {
    if (snap.newPressed) startGame(true);
    else if (snap.confirmPressed) startGame(false);
    else {
      const idle = { ...snap, ...blankAim(), fireDown: false, firePressed: false, meleePressed: false, interactPressed: false };
      stepFixed(dt, idle);
    }
  } else if (screen === 'play') {
    if (snap.pausePressed) {
      screen = 'paused';
      saveGame();
    } else if (world.dialogue) {
      world.dialogue.t += dt;
      if (snap.confirmPressed || world.dialogue.t > 4.6) world.advanceDialogue();
    } else if (world.wasted) {
      if (snap.confirmPressed && world.wastedT > 1.2) {
        world.respawn();
        saveGame();
      }
      world.stepFx(dt);
    } else {
      const merged = { ...snap, ...aim };
      leftover = stepFixed(dt + leftover, merged);
      if (world.saveNow) {
        world.saveNow = false;
        saveGame();
      }
    }
  } else if (screen === 'paused') {
    if (snap.pausePressed || snap.confirmPressed) screen = 'play';
  }

  drainSfx();
  audio.update(world, screen);
  updateStatus();
  renderer.draw(world, screen);
  input.endFrame();
  requestAnimationFrame(frame);
}

// -- screenshot staging ----------------------------------------------------------

if (shot) {
  const shown = stageShot(shot, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, shown);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      document.title = 'shot-ready';
    }
  }
  requestAnimationFrame(paint);
} else {
  // Progress is guarded against a crashed tab: pause-and-save on blur or close.
  window.addEventListener('blur', () => {
    if (screen === 'play' && !world.wasted) {
      screen = 'paused';
      saveGame();
    }
  });
  window.addEventListener('beforeunload', () => saveGame());
  requestAnimationFrame(frame);
}
