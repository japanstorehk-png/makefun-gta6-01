// Keyboard and mouse input state for Solara Keys.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, pressed: false };

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (['w','a','s','d','shift',' ','e','f','p','escape','enter','n'].includes(k) || e.key === ' ') {
      e.preventDefault();
    }
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
  }
  function onKeyUp(e) {
    keys.delete(e.key.toLowerCase());
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  }
  function onMouseDown(e) {
    onMouseMove(e);
    mouse.down = true;
    mouse.pressed = true;
  }
  function onMouseUp(e) {
    onMouseMove(e);
    mouse.down = false;
  }
  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  function isDown(k) { return keys.has(k.toLowerCase()); }
  function wasPressed(k) { return pressed.has(k.toLowerCase()); }
  function consumePress(k) { pressed.delete(k.toLowerCase()); }
  function mouseWasPressed() { return mouse.pressed; }

  function endFrame() {
    pressed.clear();
    mouse.pressed = false;
  }

  return { keys, mouse, isDown, wasPressed, consumePress, mouseWasPressed, endFrame };
}
