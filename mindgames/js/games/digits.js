import { h, rand } from '../util.js';

export default {
  id: 'digits', name: 'Digit Echo', icon: '#', color: '#ffd166', domain: 'Memory',
  tagline: 'Hold a stream of digits in your head.',
  how: ['Digits flash one at a time.', 'Type them back in order (keyboard or keypad).', 'Two misses at the same length ends the game.'],
  rawLabel: 'Digit span', norm: { mean: 6.8, sd: 1.3 },

  async play(ctx) {
    const { stage, hud, fx } = ctx;
    const show = h('div', { class: 'big-digit' });
    const slots = h('div', { class: 'slots' });
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'del', 0, 'ok'].map((k) =>
      h('button', { class: `key ${typeof k === 'string' ? 'key-fn' : ''}` }, k === 'del' ? '⌫' : k === 'ok' ? '↵' : k));
    const pad = h('div', { class: 'keypad locked' }, keys);
    stage.append(show, slots, pad);

    const keymap = { Backspace: 'del', Enter: 'ok' };
    for (let d = 0; d <= 9; d++) keymap[String(d)] = d;
    const items = keys.map((el, i) => [el, [1, 2, 3, 4, 5, 6, 7, 8, 9, 'del', 0, 'ok'][i]]);

    let len = 3, fails = 0, best = 0;
    hud.set('lives', 2);
    while (true) {
      hud.set('level', len);
      const seq = [];
      while (seq.length < len) {
        const d = rand(0, 9);
        if (d !== seq.at(-1)) seq.push(d);
      }
      slots.replaceChildren();
      pad.classList.add('locked');
      await ctx.sleep(600);
      for (const [i, d] of seq.entries()) {
        show.textContent = d;
        show.classList.add('pop');
        fx.tick(d);
        await ctx.sleep(650);
        show.classList.remove('pop');
        show.textContent = '';
        await ctx.sleep(220);
      }
      show.textContent = '?';
      pad.classList.remove('locked');
      const entry = [];
      const cells = seq.map(() => h('span', { class: 'slot' }));
      slots.replaceChildren(...cells);
      while (entry.length < len) {
        const k = await ctx.choose(items, keymap);
        if (k === 'del') entry.pop();
        else if (k === 'ok') { if (entry.length) break; }
        else { entry.push(k); fx.click(); }
        cells.forEach((c, i) => { c.textContent = entry[i] ?? ''; c.classList.toggle('filled', i < entry.length); });
      }
      pad.classList.add('locked');
      const ok = entry.length === len && entry.every((d, i) => d === seq[i]);
      cells.forEach((c, i) => { c.textContent = seq[i]; c.classList.add(entry[i] === seq[i] ? 'right' : 'wrong'); });
      show.textContent = '';
      if (ok) { best = len++; fails = 0; hud.set('score', best); hud.set('lives', 2); fx.good(); }
      else { fails++; hud.set('lives', 2 - fails); fx.bad(); }
      await ctx.sleep(1100);
      if (fails >= 2) break;
    }
    return best;
  },
};
