// Keyboard and mouse, and the pointer lock that turns the mouse into look. Held keys live in
// `keys`; presses since the last read are latched in `pressed` (mouse buttons as Mouse0 and
// Mouse2) so a tap between two simulation steps is never lost. `onKey` sees every fresh key
// press first, for the menus.
export function createInput(canvas, onLockChange, onKey) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, fire: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (event.code === 'Space' || event.code === 'Tab' || event.code.startsWith('Control')) event.preventDefault();
    if (down && !event.repeat) {
      if (onKey(event.code)) return;
      pressed.add(event.code);
    }
    if (down) keys.add(event.code);
    else keys.delete(event.code);
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) {
      state.fire = true;
      pressed.add('Mouse0');
    }
    if (event.button === 2) pressed.add('Mouse2');
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.fire = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.fire = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    // True once per physical press.
    took(code) {
      return pressed.delete(code);
    },
    // The look movement since the last call, in pixels.
    takeLook(out) {
      out.x = state.lookX;
      out.y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return out;
    },
    clearPresses() {
      pressed.clear();
    },
  };
}
