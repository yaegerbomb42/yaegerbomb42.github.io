import { h, rand, clamp } from '../util.js';

const BLOCKS = 4, TRIAL_MS = 1900, ON_MS = 550;

function makeSequence(n, len) {
  const seq = [];
  for (let i = 0; i < len; i++) {
    if (i >= n && Math.random() < 0.33) seq.push(seq[i - n]);
    else {
      let p;
      do p = rand(0, 8); while (i >= n && p === seq[i - n]);
      seq.push(p);
    }
  }
  return seq;
}

export default {
  id: 'nback', name: 'N-Back Nexus', icon: '⟲', color: '#b388ff', domain: 'Working Memory',
  tagline: 'Track where the light was, N steps ago.',
  how: ['A square lights up somewhere on the grid, again and again.', 'Press SPACE (or MATCH) when it lands where it was N steps back.', 'Do well and N goes up. 4 rounds.'],
  rawLabel: 'N-back level', norm: { mean: 2.0, sd: 0.8 }, format: (r) => r.toFixed(1),

  async play(ctx) {
    const { stage, hud, fx } = ctx;
    const cells = [...Array(9)].map(() => h('div', { class: 'tile' }));
    const grid = h('div', { class: 'tile-grid g3 locked' }, cells);
    const banner = h('div', { class: 'prompt' });
    const btn = h('button', { class: 'btn primary match' }, 'MATCH', h('kbd', {}, 'space'));
    stage.append(banner, grid, btn);

    let n = 1, best = 0;
    for (let b = 0; b < BLOCKS; b++) {
      hud.set('level', `${n}-back`);
      hud.set('score', `${b + 1}/${BLOCKS}`);
      banner.innerHTML = `<b>${n}-back</b>: match the position from <b>${n}</b> step${n > 1 ? 's' : ''} ago`;
      await ctx.sleep(2200);
      const seq = makeSequence(n, 15 + n);
      let hits = 0, targets = 0, fas = 0, nons = 0;
      for (let i = 0; i < seq.length; i++) {
        const target = i >= n && seq[i] === seq[i - n];
        const cell = cells[seq[i]];
        cell.classList.add('lit');
        const off = setTimeout(() => cell.classList.remove('lit'), ON_MS);
        const t0 = performance.now();
        const r = await ctx.choose([[btn, 'm']], { ' ': 'm' }, TRIAL_MS);
        const pressed = r === 'm';
        if (pressed) {
          btn.classList.add(target ? 'good' : 'bad');
          target ? fx.good() : fx.bad();
          await ctx.sleep(Math.max(0, TRIAL_MS - (performance.now() - t0)));
          btn.classList.remove('good', 'bad');
        } else if (target) {
          grid.classList.add('missed');
          setTimeout(() => grid.classList.remove('missed'), 300);
        }
        clearTimeout(off);
        cell.classList.remove('lit');
        if (i >= n) {
          if (target) { targets++; if (pressed) hits++; }
          else { nons++; if (pressed) fas++; }
        }
      }
      const acc = ((targets ? hits / targets : 1) + (nons ? 1 - fas / nons : 1)) / 2;
      best = Math.max(best, n - 1 + clamp((acc - 0.5) / 0.4, 0, 1));
      banner.innerHTML = `Round accuracy <b>${Math.round(acc * 100)}%</b>`;
      if (acc >= 0.8) { n++; fx.good(); banner.innerHTML += ' · level up!'; }
      else if (acc < 0.55 && n > 1) n--;
      await ctx.sleep(1500);
    }
    return best;
  },
};
