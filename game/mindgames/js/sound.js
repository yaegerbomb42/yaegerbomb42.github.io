let ac = null;
export const sound = { muted: localStorage.getItem('mindgames.muted') === '1' };

function tone(freq, dur = 0.12, type = 'sine', vol = 0.07, delay = 0) {
  if (sound.muted) return;
  try {
    ac ||= new AudioContext();
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {}
}

export const sfx = {
  good: () => { tone(660, 0.09, 'triangle'); tone(990, 0.14, 'triangle', 0.07, 0.07); },
  bad: () => tone(150, 0.25, 'sawtooth', 0.04),
  tick: (i = 0) => tone(392 * Math.pow(2, (i % 12) / 12), 0.16, 'sine', 0.08),
  click: () => tone(540, 0.05, 'triangle', 0.035),
  count: (final) => tone(final ? 880 : 440, final ? 0.25 : 0.12, 'triangle', 0.07),
  fanfare: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, i * 0.09)),
  toggle() { sound.muted = !sound.muted; localStorage.setItem('mindgames.muted', sound.muted ? '1' : '0'); },
};
