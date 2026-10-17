import { h, rand } from '../util.js';

export default {
  id: 'pulse', name: 'Pattern Pulse', icon: '◈', color: '#4cc9f0', domain: 'Memory',
  tagline: 'Watch the grid pulse, then replay the path.',
  how: ['Tiles light up one at a time.', 'Tap them back in the exact same order.', 'Every success adds a step. You have 3 lives.'],
  rawLabel: 'Longest sequence', norm: { mean: 6, sd: 1.4 },

  async play(ctx) {
    const { stage, hud, fx } = ctx;
    const N = 16;
    const tiles = [...Array(N)].map(() => h('button', { class: 'tile' }));
    const grid = h('div', { class: 'tile-grid g4 locked' }, tiles);
    const msg = h('div', { class: 'prompt' }, 'Get ready');
    stage.append(msg, grid);

    let len = 3, lives = 3, best = 0;
    hud.set('lives', lives);
    while (lives > 0) {
      hud.set('level', len);
      const seq = [];
      while (seq.length < len) {
        const t = rand(0, N - 1);
        if (t !== seq.at(-1)) seq.push(t);
      }
      grid.classList.add('locked');
      msg.textContent = 'Watch…';
      await ctx.sleep(700);
      for (const [k, i] of seq.entries()) {
        tiles[i].classList.add('lit');
        fx.tick(k);
        await ctx.sleep(460);
        tiles[i].classList.remove('lit');
        await ctx.sleep(170);
      }
      grid.classList.remove('locked');
      msg.textContent = 'Your turn';

      let ok = true;
      for (let s = 0; s < len; s++) {
        const i = await ctx.choose(tiles.map((t, j) => [t, j]));
        const hit = i === seq[s];
        tiles[i].classList.add(hit ? 'hit' : 'miss');
        setTimeout(() => tiles[i].classList.remove('hit', 'miss'), 260);
        if (!hit) { ok = false; break; }
        fx.tick(s);
      }
      grid.classList.add('locked');
      if (ok) {
        best = len++;
        hud.set('score', best);
        fx.good();
        msg.textContent = 'Perfect!';
      } else {
        hud.set('lives', --lives);
        fx.bad();
        msg.textContent = lives ? 'Missed. Same length, new pattern.' : 'Out of lives';
      }
      await ctx.sleep(900);
    }
    return best;
  },
};
