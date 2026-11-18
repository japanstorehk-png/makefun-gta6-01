// Keyboard and mouse. Edge-triggered actions (press E, press F, click) are collected
// between frames and handed to the game once, then cleared; held keys (WASD, Shift,
// Space, mouse button) are read continuously.
// Solara Keys note: the axes are world-aligned — W is always north even when the car
// faces south, Space is the handbrake, and each edge is consumed by the first sim
// step so a single press never fires twice across a slow frame.

const HOLD_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
]);

export function createInput() {
  const down = new Set();
  const pressed = new Set();
  const mouse = { x: 640, y: 360, down: false };
  let mousePressed = false;

  window.addEventListener('keydown', (e) => {
    if (HOLD_KEYS.has(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
  });
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mousePressed = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  window.addEventListener('blur', () => {
    down.clear();
    mouse.down = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  const axis = (neg, pos) => (down.has(pos) ? 1 : 0) - (down.has(neg) ? 1 : 0);

  return {
    mouse,
    mousePressed: () => mousePressed,
    /** One snapshot per animation frame; edges are consumed by the first sim step. */
    snapshot(aimX, aimY) {
      const snap = {
        ax: axis('KeyA', 'KeyD') + axis('ArrowLeft', 'ArrowRight'),
        ay: axis('KeyW', 'KeyS') + axis('ArrowUp', 'ArrowDown'),
        sprint: down.has('ShiftLeft') || down.has('ShiftRight'),
        handbrake: down.has('Space'),
        fireDown: mouse.down,
        firePressed: mousePressed,
        meleePressed: pressed.has('KeyF'),
        interactPressed: pressed.has('KeyE'),
        pausePressed: pressed.has('Escape') || pressed.has('KeyP'),
        confirmPressed: pressed.has('Enter') || mousePressed,
        newPressed: pressed.has('KeyN'),
        mutePressed: pressed.has('KeyM'),
        aimX, aimY,
      };
      return snap;
    },
    endFrame() {
      pressed.clear();
      mousePressed = false;
    },
  };
}
