import { h, pick, shuffle } from '../util.js';

const NAMES = ['Zib', 'Kora', 'Mave', 'Tull', 'Pex', 'Ryn', 'Dova', 'Quill', 'Nax', 'Juno'];
const DIMS = [['taller', 'shorter'], ['older', 'younger'], ['faster', 'slower'], ['heavier', 'lighter'], ['richer', 'poorer']];

export function generate(k) {
  const order = shuffle(NAMES).slice(0, k); // order[0] is the "most" of the dimension
  const [more, less] = pick(DIMS);
  const premises = shuffle(order.slice(0, -1).map((a, i) => {
    const b = order[i + 1];
    return Math.random() < 0.5 ? `${a} is ${more} than ${b}.` : `${b} is ${less} than ${a}.`;
  }));
  let i, j;
  do { i = Math.floor(Math.random() * k); j = Math.floor(Math.random() * k); } while (Math.abs(i - j) < 2);
  const word = Math.random() < 0.5 ? more : less;
  const truth = word === more ? i < j : i > j;
  return { premises, question: `Is ${order[i]} ${word} than ${order[j]}?`, truth };
}

export default {
  id: 'logic', name: 'Logic Ladder', icon: '⋔', color: '#9ef01a', domain: 'Reasoning',
  tagline: 'Chain the clues. Judge the claim.',
  how: ['Read the clues about how people compare.', 'Answer YES (←) or NO (→) to the question.', 'Streaks add more people. Wrong answers cost as much as right ones earn. 90 s.'],
  rawLabel: 'Logic points', norm: { mean: 10, sd: 5 },

  async play(ctx) {
    const { stage, hud, fx } = ctx;
    const card = h('div', { class: 'logic-card' });
    const yes = h('button', { class: 'btn choice yes' }, 'YES', h('kbd', {}, '←'));
    const no = h('button', { class: 'btn choice no' }, 'NO', h('kbd', {}, '→'));
    stage.append(card, h('div', { class: 'choices' }, yes, no));

    let k = 3, streak = 0, points = 0;
    const t = ctx.timer(90);
    while (!t.expired) {
      hud.set('level', `${k} people`);
      const p = generate(k);
      card.replaceChildren(
        h('ul', { class: 'premises' }, p.premises.map((s) => h('li', {}, s))),
        h('div', { class: 'question' }, p.question));
      const r = await t.race(ctx.choose([[yes, true], [no, false]], { ArrowLeft: true, ArrowRight: false, y: true, n: false }));
      if (r === ctx.TIMEOUT) break;
      const ok = r === p.truth;
      points += ok ? k - 2 : -(k - 2);
      hud.set('score', points);
      card.classList.add(ok ? 'good' : 'bad');
      ok ? fx.good() : fx.bad();
      if (ok) { if (++streak >= 2 && k < 6) { k++; streak = 0; } }
      else { streak = 0; if (k > 3) k--; }
      await ctx.sleep(ok ? 250 : 600);
      card.classList.remove('good', 'bad');
    }
    return points;
  },
};
