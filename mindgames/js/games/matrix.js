import { h, svg, pick, shuffle, staircaseAbility } from '../util.js';

// Procedurally generated Raven-style 3x3 matrices. Each attribute follows a row rule.
const DOMAINS = {
  shape: ['circle', 'square', 'triangle', 'diamond', 'hex', 'star'],
  color: ['#ff5d8f', '#4cc9f0', '#ffd166', '#72efdd', '#b388ff', '#ff9f43'],
  fill: ['solid', 'outline', 'faded'],
  size: [0.55, 0.78, 1],
  count: [1, 2, 3],
  rot: [0, 90, 180],
};
const ORDERED = new Set(['size', 'count', 'rot']);
const ROT_SHAPES = ['triangle', 'arrow'];
const ATTRS = Object.keys(DOMAINS);
const sig = (o) => ATTRS.map((a) => o[a]).join('|');

export function generate(level) {
  const nVar = Math.min(4, Math.ceil(level / 2));
  const hard = level % 2 === 0;
  let vary;
  do vary = shuffle(ATTRS).slice(0, nVar);
  while (vary.includes('shape') && vary.includes('rot'));

  const rules = {};
  for (const a of ATTRS) {
    if (!vary.includes(a)) {
      const v = a === 'rot' ? 0 : a === 'shape' && vary.includes('rot') ? pick(ROT_SHAPES) : pick(DOMAINS[a]);
      rules[a] = () => v;
    } else if (ORDERED.has(a) && (!hard || Math.random() < 0.3)) {
      const vals = Math.random() < 0.5 ? DOMAINS[a] : [...DOMAINS[a]].reverse();
      rules[a] = (r, c) => vals[c];
    } else {
      const vals = shuffle(DOMAINS[a]).slice(0, 3);
      const shift = pick([1, 2]);
      rules[a] = (r, c) => vals[(c + r * shift) % 3];
    }
  }
  const cells = [0, 1, 2].map((r) => [0, 1, 2].map((c) => Object.fromEntries(ATTRS.map((a) => [a, rules[a](r, c)]))));
  const answer = cells[2][2];

  const mutate = (o, a) => {
    const pool = a === 'shape' && vary.includes('rot') ? ROT_SHAPES : DOMAINS[a];
    const others = pool.filter((v) => v !== o[a]);
    return { ...o, [a]: pick(others) };
  };
  const cands = [
    ...vary.flatMap((a) => [mutate(answer, a), mutate(answer, a)]),
    cells[2][1], cells[1][2], cells[2][0],
    ...ATTRS.filter((a) => !vary.includes(a) && a !== 'rot').map((a) => mutate(answer, a)),
  ];
  // A second pass mutating two attributes guarantees we always find enough distractors.
  for (let i = 0; i < 20; i++) cands.push(mutate(mutate(answer, pick(vary)), pick(['color', 'fill', 'size', 'count'])));
  const seen = new Set([sig(answer)]);
  const distractors = [];
  for (const c of cands) {
    if (distractors.length === 5) break;
    if (seen.has(sig(c))) continue;
    seen.add(sig(c));
    distractors.push(c);
  }
  const options = shuffle([answer, ...distractors]);
  return { cells, options, correct: options.indexOf(answer) };
}

function shapeMarkup(shape, R) {
  const poly = (pts) => `<polygon points="${pts.map(([x, y]) => `${(x * R).toFixed(1)},${(y * R).toFixed(1)}`).join(' ')}"/>`;
  switch (shape) {
    case 'circle': return `<circle r="${R * 0.92}"/>`;
    case 'square': return `<rect x="${-R * 0.8}" y="${-R * 0.8}" width="${R * 1.6}" height="${R * 1.6}" rx="${R * 0.12}"/>`;
    case 'triangle': return poly([[0, -1], [0.9, 0.62], [-0.9, 0.62]]);
    case 'diamond': return poly([[0, -1], [0.72, 0], [0, 1], [-0.72, 0]]);
    case 'hex': return poly([...Array(6)].map((_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]));
    case 'star': return poly([...Array(10)].map((_, i) => {
      const r = i % 2 ? 0.45 : 1, t = (i * Math.PI) / 5 - Math.PI / 2;
      return [r * Math.cos(t), r * Math.sin(t)];
    }));
    case 'arrow': return poly([[0, -1], [0.8, -0.1], [0.3, -0.1], [0.3, 1], [-0.3, 1], [-0.3, -0.1], [-0.8, -0.1]]);
  }
}

const POS = { 1: [[50, 50]], 2: [[30, 50], [70, 50]], 3: [[50, 29], [29, 70], [71, 70]] };

export function figure(o) {
  const R = (o.count === 1 ? 34 : 19) * o.size;
  const paint = o.fill === 'solid' ? `fill="${o.color}" stroke="${o.color}" stroke-width="2"`
    : o.fill === 'outline' ? `fill="none" stroke="${o.color}" stroke-width="3.5"`
    : `fill="${o.color}" fill-opacity=".3" stroke="${o.color}" stroke-width="2.5"`;
  const items = POS[o.count].map(([x, y]) =>
    `<g transform="translate(${x} ${y}) rotate(${o.rot})" ${paint} stroke-linejoin="round">${shapeMarkup(o.shape, R)}</g>`).join('');
  return svg(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${items}</svg>`);
}

export default {
  id: 'matrix', name: 'Matrix Mind', icon: '⊞', color: '#ff5d8f', domain: 'Reasoning',
  tagline: 'Find the hidden rules. Complete the grid.',
  how: ['Each row of the 3×3 grid follows rules (shape, color, size, count, fill, rotation).', 'Pick the piece that completes the pattern (click or press 1–6).', 'The puzzles adapt to you. 12 puzzles, 45 s each.'],
  rawLabel: 'Puzzle level', norm: { mean: 4, sd: 1.6 }, format: (r) => r.toFixed(1),

  async play(ctx) {
    const { stage, hud, fx } = ctx;
    const board = h('div', { class: 'matrix' });
    const opts = h('div', { class: 'options six' });
    stage.append(board, opts);

    let level = 2;
    const log = [];
    for (let q = 0; q < 12; q++) {
      hud.set('level', level);
      hud.set('score', `${q + 1}/12`);
      const p = generate(level);
      board.replaceChildren(...p.cells.flat().map((c, i) =>
        h('div', { class: 'mcell' }, i === 8 ? h('span', { class: 'qmark' }, '?') : figure(c))));
      const buttons = p.options.map((o, i) => h('button', { class: 'option' }, figure(o), h('kbd', {}, i + 1)));
      opts.replaceChildren(...buttons);
      const t = ctx.timer(45);
      const keymap = Object.fromEntries(buttons.map((_, i) => [String(i + 1), i]));
      const r = await t.race(ctx.choose(buttons.map((b, i) => [b, i]), keymap));
      t.stop();
      const ok = r === p.correct;
      buttons[p.correct].classList.add('right');
      if (r !== ctx.TIMEOUT && !ok) buttons[r].classList.add('wrong');
      board.lastChild.replaceChildren(figure(p.options[p.correct]));
      ok ? fx.good() : fx.bad();
      log.push({ level, ok });
      level = Math.max(1, Math.min(8, level + (ok ? 1 : -1)));
      await ctx.sleep(ok ? 700 : 1500);
    }
    return staircaseAbility(log);
  },
};
