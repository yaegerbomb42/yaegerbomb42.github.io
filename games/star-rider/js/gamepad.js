// ============================================================
//  STAR-RIDER - Gamepad support module
//  Fully decoupled: never touches game.js internals.
//  Translates gamepad input into synthetic keyboard events that
//  the game's existing key handlers consume, and watches the
//  exposed window.__game handle to fire haptic rumble on
//  damage / dashing / leveling.
// ============================================================
(function () {
'use strict';

const DEADZONE_ON = 0.38;   // axis -> key press threshold
const DEADZONE_OFF = 0.22;  // axis -> key release threshold (hysteresis)
const POLL_MS = 16;         // ~60hz polling

// Standard-mapping buttons
const BTN = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, LS: 10, RS: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

// What each button emits as key(s). Arrays = hold ALL of them while pressed.
const BUTTON_KEY_MAP = [
  [BTN.A,     [' ']],          // dash
  [BTN.X,     [' ']],          // dash (alt)
  [BTN.RT,    [' ']],          // dash (alt, analog trigger read digitally)
  [BTN.START, ['p']],          // pause toggle (edge)
  [BTN.Y,     ['m']],          // mute toggle (edge)
  [BTN.B,     ['Enter']],      // menu confirm (edge)
];

let padIndex = -1;
let padName = '';
let enabled = true;
let toastShown = false;

// held-state: key string -> true while held by gamepad
const held = Object.create(null);
// prev button pressed state for edge detection
const prevButtons = Object.create(null);
// prev player stats for haptics
let lastHp = null, lastLevel = null, lastDashCd = null;

function hasGamepadApi() {
  return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
}

function getPad() {
  if (!hasGamepadApi()) return null;
  const pads = navigator.getGamepads();
  if (!pads) return null;
  if (padIndex >= 0 && pads[padIndex]) return pads[padIndex];
  for (let i = 0; i < pads.length; i++) {
    if (pads[i] && pads[i].connected) { padIndex = i; padName = pads[i].id || 'gamepad'; return pads[i]; }
  }
  return null;
}

function pressKey(key) {
  if (held[key]) return;
  held[key] = true;
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}
function releaseKey(key) {
  if (!held[key]) return;
  held[key] = false;
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}
function tapKey(key) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}
function releaseAll() {
  for (const k in held) if (held[k]) releaseKey(k);
}

function updateAxes(pad) {
  const ax = pad.axes[0] || 0;
  const ay = pad.axes[1] || 0;

  // left/right
  if (ax < -DEADZONE_ON) pressKey('a');
  else if (ax > -DEADZONE_OFF && held['a'] && !isPressed(pad, BTN.LEFT)) releaseKey('a');
  if (ax > DEADZONE_ON) pressKey('d');
  else if (ax < DEADZONE_OFF && held['d'] && !isPressed(pad, BTN.RIGHT)) releaseKey('d');

  // up/down (axis -1 is up)
  if (ay < -DEADZONE_ON) pressKey('w');
  else if (ay > -DEADZONE_OFF && held['w'] && !isPressed(pad, BTN.UP)) releaseKey('w');
  if (ay > DEADZONE_ON) pressKey('s');
  else if (ay < DEADZONE_OFF && held['s'] && !isPressed(pad, BTN.DOWN)) releaseKey('s');
}

function isPressed(pad, idx) {
  const b = pad.buttons[idx];
  return !!b && (b.pressed || b.value > 0.5);
}

function updateButtons(pad) {
  // dpad -> movement keys (merged with stick via held-state)
  const dpad = [
    [BTN.UP, 'w'], [BTN.DOWN, 's'], [BTN.LEFT, 'a'], [BTN.RIGHT, 'd'],
  ];
  for (const [idx, key] of dpad) {
    if (isPressed(pad, idx)) pressKey(key);
    else if (held[key]) {
      const axisIdx = (idx === BTN.LEFT || idx === BTN.RIGHT) ? 0 : 1;
      if (Math.abs(pad.axes[axisIdx] || 0) < DEADZONE_OFF) releaseKey(key);
    }
  }

  for (const [idx, keys] of BUTTON_KEY_MAP) {
    const now = isPressed(pad, idx);
    const was = !!prevButtons[idx];
    prevButtons[idx] = now;
    const edgeOnly = (idx === BTN.START || idx === BTN.Y || idx === BTN.B);
    if (edgeOnly) {
      if (now && !was) keys.forEach(tapKey);
    } else {
      if (now && !was) keys.forEach(pressKey);
      else if (!now && was) keys.forEach(releaseKey);
    }
  }
}

function rumble(strong, weak, ms) {
  if (!hasGamepadApi() || padIndex < 0) return;
  const pad = navigator.getGamepads()[padIndex];
  const act = pad && (pad.vibrationActuator || (pad.hapticActuators && pad.hapticActuators[0]));
  if (!act) return;
  try {
    if (act.playEffect) {
      act.playEffect('dual-rumble', {
        duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak),
      }).catch(() => {});
    } else if (act.pulse) {
      act.pulse(Math.max(strong, weak), ms);
    }
  } catch (e) { /* haptics unsupported — ignore */ }
}

function updateHaptics() {
  const g = window.__game;
  if (!g || !g.player) return;
  const p = g.player;

  if (lastHp !== null && p.hp < lastHp - 0.5) rumble(0.85, 0.4, 140);              // took damage
  if (lastLevel !== null && p.level > lastLevel) rumble(0.3, 0.6, 90);             // level up pulse
  if (lastDashCd !== null && lastDashCd <= 0 && p.dashCd > 2) rumble(0.2, 0.3, 60); // dash kicked in

  lastHp = p.hp; lastLevel = p.level; lastDashCd = p.dashCd;
}

function poll() {
  if (!enabled) return;
  const pad = getPad();
  if (!pad) { releaseAll(); return; }
  updateAxes(pad);
  updateButtons(pad);
  updateHaptics();
}

// Connection lifecycle
if (typeof window !== 'undefined') {
  window.addEventListener('gamepadconnected', (e) => {
    padIndex = e.gamepad.index;
    padName = e.gamepad.id || 'gamepad';
    if (!toastShown) { toastShown = true; try { console.log('[gamepad] connected:', padName); } catch (err) {} }
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    if (e.gamepad.index === padIndex) { padIndex = -1; padName = ''; releaseAll(); }
  });
  // Interval-based polling (reliable even when rAF throttles in background tabs)
  if (hasGamepadApi()) setInterval(poll, POLL_MS);
}

window.GamepadSys = {
  get connected() { return getPad() !== null; },
  get padName() { return padName; },
  setEnabled(v) { enabled = !!v; if (!enabled) releaseAll(); },
  rumble,
  _poll: poll, // exposed for headless tests
};
})();
