import { h, rand, pick, shuffle, staircaseAbility } from '../util.js';

const seq = (f, n = 7) => [...Array(n)].map((_, i) => f(i));
const rec = (a, step, n = 7) => { const s = [a]; while (s.length < n) s.push(step(s.at(-1), s.length)); return s; };

const LEVELS = [
  () => { const a = rand(1, 20), d = rand(2, 9); return seq((i) => a + d * i); },
  () => Math.random() < 0.5
    ? (() => { const a = rand(60, 99), d = rand(3, 9); return seq((i) => a - d * i); })()
    : (() => { const a = rand(1, 5), r = rand(2, 3); return seq((i) => a * r ** i); })(),
  () => { const a = rand(1, 15), p = rand(2, 9); let q; do q = rand(-6, 12); while (q === p || q === 0); return rec(a, (x, i) => x + (i % 2 ? p : q)); },
  () => { const a = rand(1, 10), d = rand(1, 5), dd = rand(1, 4); return seq((i) => a + d * i + (dd * i * (i - 1)) / 2); },
  () => { const s = [rand(1, 6), rand(2, 9)]; while (s.length < 7) s.push(s.at(-1) + s.at(-2)); return s; },
  () => { const a = rand(1, 10), d = rand(2, 6), b = rand(25, 45), e = rand(2, 5); return seq((i) => (i % 2 === 0 ? a + d * (i / 2) : b - e * ((i - 1) / 2))); },
  () => { const a = rand(1, 5), k = rand(2, 3); let c; do c = rand(-3, 3); while (c === 0); return rec(a, (x) => x * k + c); },
  () => pick([
    () => { const o = rand(1, 5), c = rand(-5, 5); return seq((i) => (i + o) ** 2 + c); },
    () => { const o = rand(1, 3); return seq((i) => (i + o) ** 3 - (i + o)); },
    () => { const a = rand(1, 3); return rec(a, (x, i) => x * (i + 1)); },
    () => { const s = [rand(1, 5), rand(1, 5), rand(1, 5)]; while (s.length < 7) s.push(s.at(-1) + s.at(-2) + s.at(-3)); return s; },
  ])(),
];

export function generate(level) {
  const s = LEVELS[level - 1]();
  const shown = s.slice(0, 6), answer = s[6];
  const d1 = shown[5] - shown[4], d2 = shown[4] - shown[3];
  const pool = [shown[5] + d1, shown[5] + d2, answer + 1, answer - 1, answer + 2, answer - 2, answer + (d1 - d2), answer * 2 - shown[5], answer + 10, answer - 10];
  const distractors = [...new Set(pool.filter((x) => x !== answer && Number.isFinite(x)))];
  const options = shuffle([answer, ...shuffle(distractors).slice(0, 3)]);
  return { shown, options, correct: options.indexOf(answer) };
}

export default {
  id: 'series', name: 'Number Nexus', icon: '∑', color: '#ff9f43', domain: 'Reasoning',
  tagline: 'Crack the rule behind the numbers.',
  how: ['You get six numbers that follow a hidden rule.', 'Pick the number that comes next (click or press 1–4).', 'It adapts to you. 12 puzzles, 30 s each.'],
  rawLabel: 'Series level', norm: { mean: 4, sd: 1.6 }, format: (r) => r.toFixed(1),

  async play(ctx) {
    const { stage, hud, fx } = ctx;
    const row = h('div', { class: 'series' });
    const opts = h('div', { class: 'options four' });
    stage.append(row, opts);
    let level = 2;
    const log = [];
    for (let q = 0; q < 12; q++) {
      hud.set('level', level);
      hud.set('score', `${q + 1}/12`);
      const p = generate(level);
      const blank = h('div', { class: 'num blank' }, '?');
      row.replaceChildren(...p.shown.map((n, i) => h('div', { class: 'num', style: { 'animation-delay': `${i * 60}ms` } }, n)), blank);
      const buttons = p.options.map((o, i) => h('button', { class: 'option num-opt' }, String(o), h('kbd', {}, i + 1)));
      opts.replaceChildren(...buttons);
      const t = ctx.timer(30);
      const keymap = Object.fromEntries(buttons.map((_, i) => [String(i + 1), i]));
      const r = await t.race(ctx.choose(buttons.map((b, i) => [b, i]), keymap));
      t.stop();
      const ok = r === p.correct;
      buttons[p.correct].classList.add('right');
      if (r !== ctx.TIMEOUT && !ok) buttons[r].classList.add('wrong');
      blank.textContent = p.options[p.correct];
      blank.classList.add(ok ? 'right' : 'wrong');
      ok ? fx.good() : fx.bad();
      log.push({ level, ok });
      level = Math.max(1, Math.min(8, level + (ok ? 1 : -1)));
      await ctx.sleep(ok ? 700 : 1500);
    }
    return staircaseAbility(log);
  },
};
