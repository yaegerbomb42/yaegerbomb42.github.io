// ============================================================
// Sphere Quest — synthesized WebAudio SFX (no audio assets)
// ============================================================

let ctx = null;
let enabled = true;

export function setEnabled(v) { enabled = !!v; }
export function isEnabled() { return enabled; }

export function init() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function beep(freq, dur = 0.08, type = 'triangle', vol = 0.15, when = 0, slide = 0) {
  if (!enabled || !ctx) return;
  try {
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch { /* audio not available */ }
}

export const sfx = {
  mine() { beep(340 + Math.random() * 160, 0.07, 'triangle', 0.10); },
  buy() { beep(440, 0.09, 'square', 0.07); beep(660, 0.12, 'square', 0.07, 0.08); },
  deny() { beep(140, 0.12, 'sawtooth', 0.06, 0, 40); },
  level() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, 'triangle', 0.09, i * 0.09)); },
  achievement() { [880, 1108, 1318].forEach((f, i) => beep(f, 0.22, 'sine', 0.10, i * 0.12)); },
  jackpot() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.16, 'square', 0.06, i * 0.06)); },
  comet() { beep(880, 0.2, 'sine', 0.08, 0, -400); }
};
