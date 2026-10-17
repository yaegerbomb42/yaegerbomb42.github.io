// Node sanity checks for the procedural generators: node js/test.mjs
import { generate as matrix } from './games/matrix.js';
import { generate as series } from './games/series.js';
import { generate as logic } from './games/logic.js';
import { makeShape } from './games/rotate.js';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL', msg); } };
for (let L = 1; L <= 8; L++) for (let i = 0; i < 300; i++) {
  const m = matrix(L);
  const sigs = new Set(m.options.map((o) => JSON.stringify(o)));
  check(m.options.length === 6 && sigs.size === 6 && m.correct >= 0, `matrix L${L} options`);
  const s = series(L);
  check(s.options.length === 4 && new Set(s.options).size === 4 && s.correct >= 0 && s.options.every(Number.isInteger), `series L${L} ${s.shown} ${s.options}`);
}
for (let k = 3; k <= 6; k++) for (let i = 0; i < 200; i++) check(logic(k).premises.length === k - 1, 'logic');
for (let i = 0; i < 200; i++) check(makeShape(7).length === 7, 'shape');
console.log(fails ? `${fails} failures` : 'all generator checks passed');
