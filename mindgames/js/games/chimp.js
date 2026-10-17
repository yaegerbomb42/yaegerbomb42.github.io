import { h, shuffle } from '../util.js';

const COLS = 8, ROWS = 5;

export default {
  id: 'chimp', name: 'Chimp Recall', icon: '⁂', color: '#72efdd', domain: 'Memory',
  tagline: 'Memorize where the numbers are hiding.',
  how: ['Numbered tiles appear on the board.', 'Tap them in order starting at 1. After your first tap, the rest go blank.', 'Each success adds a number. 3 strikes.'],
  rawLabel: 'Numbers recalled', norm: { mean: 8.5, sd: 2 },

  async play(ctx) {
    const { stage, hud, fx } = ctx;
    const board = h('div', { class: 'chimp-board', style: { '--cols': COLS, '--rows': ROWS } });
    const msg = h('div', { class: 'prompt' }, 'Tap 1 when ready');
    stage.append(msg, board);

    let count = 4, strikes = 0, best = 0;
    hud.set('lives', 3);
    while (strikes < 3) {
      hud.set('level', count);
      const spots = shuffle([...Array(COLS * ROWS).keys()]).slice(0, count);
      const tiles = spots.map((s, i) => {
        const t = h('button', { class: 'chimp-tile', style: { 'grid-column': (s % COLS) + 1, 'grid-row': Math.floor(s / COLS) + 1 } }, i + 1);
        return t;
      });
      board.replaceChildren(...tiles);
      msg.textContent = 'Tap 1 when ready';
      let ok = true;
      for (let k = 0; k < count; k++) {
        const i = await ctx.choose(tiles.filter((t) => !t.disabled).map((t) => [t, tiles.indexOf(t)]));
        if (k === 0) { board.classList.add('hidden'); msg.textContent = '…'; }
        if (i !== k) {
          tiles[i].classList.add('wrong');
          ok = false;
          break;
        }
        tiles[i].disabled = true;
        tiles[i].classList.add('done');
        fx.tick(k);
      }
      board.classList.remove('hidden');
      if (ok) { best = count++; hud.set('score', best); fx.good(); msg.textContent = 'Nice!'; }
      else { strikes++; hud.set('lives', 3 - strikes); fx.bad(); msg.textContent = strikes < 3 ? 'Strike. Try again.' : 'Game over'; }
      await ctx.sleep(1000);
    }
    return best;
  },
};
