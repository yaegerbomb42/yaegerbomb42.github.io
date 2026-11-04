import { h, shuffle, pick } from '../util.js';

const SYMBOLS = ['◆', '▲', '●', '■', '★', '✚', '☾', '♠', '⬣', '✦', '♣', '⧫'];

export default {
  id: 'cipher', name: 'Symbol Cipher', icon: '✦', color: '#57e389', domain: 'Speed',
  tagline: 'Decode symbols faster than thought.',
  how: ['A key matches 9 symbols to the digits 1–9.', 'Type the digit for each symbol that appears.', 'Errors subtract. 60 s.'],
  rawLabel: 'Net decoded', norm: { mean: 36, sd: 8 },

  async play(ctx) {
    const { stage, hud, fx } = ctx;
    const syms = shuffle(SYMBOLS).slice(0, 9);
    const keyRow = h('div', { class: 'cipher-key' }, syms.map((s, i) => h('div', { class: 'ck' }, h('span', { class: 'ck-sym' }, s), h('span', { class: 'ck-num' }, i + 1))));
    const big = h('div', { class: 'cipher-sym' });
    const pad = [...Array(9)].map((_, i) => h('button', { class: 'key' }, i + 1));
    stage.append(keyRow, big, h('div', { class: 'keypad nine' }, pad));
    const keymap = Object.fromEntries(pad.map((_, i) => [String(i + 1), i]));

    let score = 0, last = -1;
    const t = ctx.timer(60);
    while (!t.expired) {
      let s;
      do s = Math.floor(Math.random() * 9); while (s === last);
      last = s;
      big.textContent = syms[s];
      big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
      const r = await t.race(ctx.choose(pad.map((b, i) => [b, i]), keymap));
      if (r === ctx.TIMEOUT) break;
      const ok = r === s;
      score += ok ? 1 : -1;
      hud.set('score', score);
      pad[r].classList.add(ok ? 'good' : 'bad');
      setTimeout(() => pad[r].classList.remove('good', 'bad'), 160);
      ok ? fx.click() : fx.bad();
      if (!ok) { keyRow.children[s].classList.add('hint'); await ctx.sleep(400); keyRow.children[s].classList.remove('hint'); }
    }
    return score;
  },
};
