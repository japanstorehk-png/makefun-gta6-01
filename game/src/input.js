// Keyboard and mouse input. Held keys provide movement/handbrake state; one-shot
// actions are queued as flags so presses between frames are never lost.

export const ACTION_START = 1 << 0;
export const ACTION_PAUSE = 1 << 1;
export const ACTION_INTERACT = 1 << 2; // E
export const ACTION_MELEE = 1 << 3; // F
export const ACTION_NEW_GAME = 1 << 4; // N

const DIR_KEYS = {
  KeyW: [0, -1],
  KeyA: [-1, 0],
  KeyS: [0, 1],
  KeyD: [1, 0],
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  function updateMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' || event.code === 'KeyP') {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
      return;
    }
    if (event.code === 'Enter') {
      if (!event.repeat) actions |= ACTION_START;
      event.preventDefault();
      return;
    }
    if (event.code === 'KeyE') {
      if (!event.repeat) actions |= ACTION_INTERACT;
      event.preventDefault();
      return;
    }
    if (event.code === 'KeyF') {
      if (!event.repeat) actions |= ACTION_MELEE;
      event.preventDefault();
      return;
    }
    if (event.code === 'KeyN') {
      if (!event.repeat) actions |= ACTION_NEW_GAME;
      event.preventDefault();
      return;
    }
    if (event.code === 'Space') {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    if (DIR_KEYS[event.code] || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      held.add(event.code);
      // prevent page scrolling on space/arrows-like keys not used, but keep minimal
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });

  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });

  canvas.addEventListener('mousemove', updateMouse);
  canvas.addEventListener('mousedown', (event) => {
    updateMouse(event);
    mouseDown = true;
    mouseClicked = true;
  });
  window.addEventListener('mouseup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('click', () => {
    actions |= ACTION_START;
  });

  return {
    axis() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const d = DIR_KEYS[code];
        if (d) {
          x += d[0];
          y += d[1];
        }
      }
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len };
    },
    sprint() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    handbrake() {
      return held.has('Space');
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    takeClick() {
      const c = mouseClicked;
      mouseClicked = false;
      return c;
    },
    takeActions() {
      const a = actions;
      actions = 0;
      return a;
    },
  };
}
