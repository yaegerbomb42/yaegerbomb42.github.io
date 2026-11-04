import { h, svg, pick } from '../util.js';

const norm = (cells) => {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};
const key = (cells) => JSON.stringify(norm(cells));
const rot = (cells, times) => {
  let c = cells;
  for (let i = 0; i < times; i++) c = c.map(([x, y]) => [y, -x]);
  return norm(c);
};
const mirror = (cells) => norm(cells.map(([x, y]) => [-x, y]));

export function makeShape(size) {
  while (true) {
    const cells = [[0, 0]];
    const has = (x, y) => cells.some((c) => c[0] === x && c[1] === y);
    while (cells.length < size) {
      const [x, y] = pick(cells);
      const [dx, dy] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      if (!has(x + dx, y + dy)) cells.push([x + dx, y + dy]);
    }
    // Must be chiral: its mirror image can't be reached by rotation.
    const m = key(mirror(cells));
    if ([0, 1, 2, 3].every((r) => key(rot(cells, r)) !== m)) return norm(cells);
  }
}

function draw(cells, color) {
  const w = Math.max(...cells.map((c) => c[0])) + 1, hgt = Math.max(...cells.map((c) => c[1])) + 1;
  const S = 20, span = Math.max(w, hgt) * S, ox = (span - w * S) / 2, oy = (span - hgt * S) / 2;
  const rects = cells.map(([x, y]) => `<rect x="${ox + x * S + 1}" y="${oy + y * S + 1}" width="${S - 2}" height="${S - 2}" rx="3"/>`).join('');
  return svg(`<svg viewBox="-4 -4 ${span + 8} ${span + 8}" xmlns="http://www.w3.org/2000/svg"><g fill="${color}" fill-opacity=".85" stroke="${color}" stroke-width="1.5">${rects}</g></svg>`);
}

export default {
  id: 'rotate', name: 'Spin Sight', icon: '⟳', color: '#f72585', domain: 'Spatial',
  tagline: 'Rotate shapes in your mind.',
  how: ['Two block shapes appear. The right one has been rotated.', 'Is it the SAME shape (←) or a MIRROR image (→)?', 'Errors subtract. 60 s.'],
  rawLabel: 'Net correct', norm: { mean: 14, sd: 6 },

  async play(ctx) {
    const { stage, hud, fx } = ctx;
    const left = h('div', { class: 'rot-panel' }), right = h('div', { class: 'rot-panel' });
    const same = h('button', { class: 'btn choice yes' }, 'SAME', h('kbd', {}, '←'));
    const mir = h('button', { class: 'btn choice no' }, 'MIRROR', h('kbd', {}, '→'));
    stage.append(h('div', { class: 'rot-pair' }, left, h('div', { class: 'rot-vs' }, '?'), right), h('div', { class: 'choices' }, same, mir));

    let score = 0, n = 0;
    const t = ctx.timer(60);
    while (!t.expired) {
      const size = n < 4 ? 5 : n < 10 ? 6 : 7;
      const base = makeShape(size);
      const isMirror = Math.random() < 0.5;
      const a = rot(base, Math.floor(Math.random() * 4));
      const b = rot(isMirror ? mirror(base) : base, Math.floor(Math.random() * 4));
      left.replaceChildren(draw(a, '#4cc9f0'));
      right.replaceChildren(draw(b, '#f72585'));
      right.firstChild.style.transform = `rotate(${pick([0, 90, 180, 270])}deg)`;
      const r = await t.race(ctx.choose([[same, false], [mir, true]], { ArrowLeft: false, ArrowRight: true, s: false, m: true }));
      if (r === ctx.TIMEOUT) break;
      const ok = r === isMirror;
      score += ok ? 1 : -1;
      n++;
      hud.set('score', score);
      hud.set('level', size + ' blocks');
      (r ? mir : same).classList.add(ok ? 'good' : 'bad');
      ok ? fx.good() : fx.bad();
      await ctx.sleep(ok ? 200 : 600);
      same.classList.remove('good', 'bad'); mir.classList.remove('good', 'bad');
    }
    return score;
  },
};
