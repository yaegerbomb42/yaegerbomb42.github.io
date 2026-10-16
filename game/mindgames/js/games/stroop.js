import { h, pick } from '../util.js';

const COLORS = [
  { name: 'RED', hex: '#ff4d6d', key: 'd' },
  { name: 'BLUE', hex: '#4cc9f0', key: 'f' },
  { name: 'GREEN', hex: '#57e389', key: 'j' },
  { name: 'YELLOW', hex: '#ffd166', key: 'k' },
];

export default {
  id: 'stroop', name: 'Color Clash', icon: '◐', color: '#ff4d6d', domain: 'Attention',
  tagline: 'Ignore the word. Trust the ink.',
  how: ['A color word appears, printed in some ink color.', 'Hit the button for the INK color, not the word (keys D F J K).', 'Be fast and accurate: errors subtract. 45 s.'],
  rawLabel: 'Net correct', norm: { mean: 30, sd: 8 },

  async play(ctx) {
    const { stage, hud, fx } = ctx;
    const word = h('div', { class: 'stroop-word' });
    const buttons = COLORS.map((c) => h('button', { class: 'swatch', style: { '--sw': c.hex } }, h('kbd', {}, c.key.toUpperCase())));
    stage.append(word, h('div', { class: 'swatches' }, buttons));
    const keymap = Object.fromEntries(COLORS.map((c, i) => [c.key, i]));

    let score = 0, streak = 0, last = -1;
    const t = ctx.timer(45);
    while (!t.expired) {
      let ink;
      do ink = Math.floor(Math.random() * 4); while (ink === last);
      last = ink;
      const text = Math.random() < 0.7 ? pick(COLORS.filter((_, i) => i !== ink)).name : COLORS[ink].name;
      word.textContent = text;
      word.style.color = COLORS[ink].hex;
      word.classList.remove('pop'); void word.offsetWidth; word.classList.add('pop');
      const r = await t.race(ctx.choose(buttons.map((b, i) => [b, i]), keymap));
      if (r === ctx.TIMEOUT) break;
      const ok = r === ink;
      score += ok ? 1 : -1;
      streak = ok ? streak + 1 : 0;
      hud.set('score', score);
      hud.set('level', streak >= 5 ? `🔥 ${streak}` : streak);
      buttons[r].classList.add(ok ? 'good' : 'bad');
      setTimeout(() => buttons[r].classList.remove('good', 'bad'), 180);
      ok ? fx.click() : fx.bad();
      if (!ok) await ctx.sleep(350);
    }
    return score;
  },
};
