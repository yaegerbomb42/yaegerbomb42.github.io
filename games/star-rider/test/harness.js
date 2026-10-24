// Headless harness — runs the real game logic in Node (no browser).
// Stubs DOM, canvas, and WebAudio so we can simulate thousands of frames
// and catch runtime errors, undefined references, and NaNs.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
let checks = 0;
function ok(cond, label) {
  checks++;
  if (cond) { console.log('  PASS  ' + label); }
  else { failures++; console.log('  FAIL  ' + label); }
}

// ---- Canvas 2D context stub (accept every call, measureText returns sane obj) ----
function makeCtx2d() {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  return new Proxy({
    measureText: () => ({ width: 42 }),
    canvas: {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }, {
    get(t, k) {
      if (k in t) return t[k];
      return noop; // any method
    },
    set() { return true; }, // swallow fillStyle, etc.
  });
}

// ---- DOM element stub ----
function makeEl(id) {
  const el = {
    id,
    style: {},
    children: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
      contains(c) { return this._s.has(c); },
    },
    get className() { return Array.from(this.classList._s).join(' '); },
    set className(v) { this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    _listeners: {},
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    get firstChild() { return this.children[0] || null; },
    dispatch(ev, arg) { (this._listeners[ev] || []).forEach(f => f(arg || {})); if (typeof this['on' + ev] === 'function') this['on' + ev](arg || {}); },
    click() { this.dispatch('click'); },
    querySelector: () => makeEl('qsel'),
    querySelectorAll: () => [],
    set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
    get innerHTML() { return this._html || ''; },
    textContent: '',
    getContext: () => makeCtx2d(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    width: 1280,
    height: 720,
  };
  return el;
}

// ---- WebAudio stubs ----
function makeAudioParam(v) {
  return {
    value: v,
    setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {}, cancelAndHoldAtTime() {},
  };
}
// Generic node: every known AudioNode property is a stub; unknown property
// reads lazily produce an AudioParam-like stub so the harness survives ANY
// node type (BiquadFilter.Q, Oscillator.detune, StereoPanner.pan, ...).
function makeNode() {
  const base = {
    connect() {}, disconnect() {}, start() {}, stop() {},
    gain: makeAudioParam(0), frequency: makeAudioParam(0), type: '', buffer: null,
    onended: null, playbackRate: makeAudioParam(1), loop: false, loopStart: 0, loopEnd: 0,
  };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      // unknown property — assume AudioParam-like and memoize
      t[k] = makeAudioParam(0);
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = {}; }
  createGain() { return makeNode(); }
  createOscillator() { return makeNode(); }
  createBiquadFilter() { return makeNode(); }
  createBufferSource() { return makeNode(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  resume() { return Promise.resolve(); }
}

// ---- Build sandbox ----
function buildEnv(seedData) {
  const ids = ['game', 'hud', 'menu-screen', 'levelup-screen', 'gameover-screen', 'victory-screen', 'pause-screen',
    'xp-bar', 'level-text', 'timer', 'kill-count', 'hp-bar', 'cards', 'gameover-title', 'gameover-stats',
    'victory-stats', 'high-score-line', 'start-btn', 'retry-btn', 'victory-retry-btn', 'combo-hud'];
  const els = {};
  ids.forEach(id => { els[id] = makeEl(id); });

  // Pre-create every id declared in index.html so QA audits can distinguish
  // "wired in JS" from "present in HTML but dead". Missing ids stay missing.
  const tabEls = [];
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    for (const m of html.matchAll(/<([a-z0-9]+)[^>]*?\bid="([^"]+)"/g)) {
      const id = m[2];
      if (els[id]) continue;
      const el = makeEl(id);
      if (m[1] === 'canvas') { el.width = 960; el.height = 540; }
      const dw = m[0].match(/data-(\w+)="([^"]+)"/);
      if (dw) el.dataset = { [dw[1]]: dw[2] };
      els[id] = el;
    }
    // Class-wired groups (codex tabs use querySelectorAll delegation)
    for (const m of html.matchAll(/<button[^>]*class="[^"]*codex-tab[^"]*"[^>]*>/g)) {
      const el = makeEl();
      const dt = m[0].match(/data-tab="([^"]+)"/);
      el.dataset = { tab: dt ? dt[1] : '' };
      tabEls.push(el);
    }
  } catch (e) { /* harness must never hard-fail on html parse */ }

  const listeners = {};
  let time = 0;
  const rafQueue = [];
  const localStorageData = {};
  if (seedData && typeof seedData === 'object') Object.assign(localStorageData, seedData); // simulate prior-session storage

  const sandbox = {
    console,
    performance: { now: () => time },
    requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
    localStorage: {
      getItem: (k) => (k in localStorageData ? localStorageData[k] : null),
      setItem: (k, v) => { localStorageData[k] = String(v); },
      removeItem: (k) => { delete localStorageData[k]; },
      _data: localStorageData,
    },
    document: {
      getElementById: (id) => els[id] || (els[id] = makeEl(id)),
      createElement: () => makeEl('dyn'),
      querySelector: (sel) => makeEl(sel),
      querySelectorAll: (sel) => (sel === '.codex-tab' ? tabEls : []), // codex tabs parse from real HTML
      body: { appendChild: (c) => c, children: [] },
    },
    AudioContext: FakeAudioContext,
    webkitAudioContext: FakeAudioContext,
    navigator: { maxTouchPoints: 0, userAgent: 'headless' },
    setInterval: () => 0, clearInterval: () => {},
    Math, JSON, Object, Array, Set, Map, Promise, Date, Number, String, Boolean, parseFloat, parseInt, isNaN, isFinite,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  sandbox.removeEventListener = () => {};
  sandbox.KeyboardEvent = class KeyboardEvent {
    constructor(type, opts = {}) { this.type = type; Object.assign(this, opts); }
    preventDefault() {}
  };
  sandbox.dispatchEvent = (ev) => { (listeners[ev.type] || []).forEach(f => f(ev)); return true; };
  sandbox.innerWidth = 1280;
  sandbox.innerHeight = 720;

  const ctx = vm.createContext(sandbox);

  function runFile(rel) {
    const code = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
  runFile('js/audio.js');
  runFile('js/gamepad.js');
  runFile('js/game.js');

  const api = {
    sandbox, els, localStorageData,
    key: (k, down) => { (listeners[down ? 'keydown' : 'keyup'] || []).forEach(f => f({ key: k, preventDefault() {} })); },
    // advance n frames at dt seconds
    step(frames, dtMs = 16.7) {
      for (let i = 0; i < frames; i++) {
        const cbs = rafQueue.splice(0);
        time += dtMs;
        cbs.forEach(cb => cb(time));
      }
    },
    game: () => sandbox.window.__game,
  };
  return api;
}

module.exports = { buildEnv, ok, results: () => ({ failures, checks }) };
