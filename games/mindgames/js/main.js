import { h, $, clamp, normCdf } from './util.js';
import { makeCtx, ABORT } from './ctx.js';
import { sfx, sound } from './sound.js';
import { GAMES } from './games/index.js';

const app = $('#app');
const KEY = 'mindgames.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { best: {}, runs: [] }; } catch { return { best: {}, runs: [] }; } };
const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));

// ---- Scoring -------------------------------------------------------------
// Each game's raw result is normed against approximate adult means/SDs → z → percentile.
// Game points = percentile (0–100). Mind Score = sum over the 10 games (0–1000).
export function evaluate(game, raw) {
  const z = clamp((raw - game.norm.mean) / game.norm.sd, -3, 3);
  const pct = normCdf(z);
  return { id: game.id, raw, z, pct, points: Math.round(pct * 100) };
}

// The mean of k correlated z-scores has SD sqrt((1+(k-1)r)/k), so rescale it back to unit
// variance before mapping to the IQ scale (mean 100, SD 15).
const INTERCORR = 0.3;
export function estimateIQ(results) {
  const k = results.length;
  const mz = results.reduce((s, r) => s + r.z, 0) / k;
  const cz = mz / Math.sqrt((1 + (k - 1) * INTERCORR) / k);
  return { iq: Math.round(clamp(100 + 15 * cz, 55, 145)), margin: 11 };
}

const DOMAINS = ['Memory', 'Working Memory', 'Reasoning', 'Attention', 'Speed', 'Spatial'];
const iqBand = (iq) => iq >= 130 ? 'Very superior' : iq >= 120 ? 'Superior' : iq >= 110 ? 'High average' : iq >= 90 ? 'Average' : iq >= 80 ? 'Low average' : 'Below average';
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const fmtRaw = (g, raw) => (g.format ? g.format(raw) : raw);

// ---- Shared UI ------------------------------------------------------------
function muteButton() {
  const b = h('button', { class: 'icon-btn', title: 'Sound' }, sound.muted ? '🔇' : '🔊');
  b.onclick = () => { sfx.toggle(); b.textContent = sound.muted ? '🔇' : '🔊'; };
  return b;
}

function screen(...children) {
  app.replaceChildren(h('div', { class: 'screen' }, children));
  window.scrollTo(0, 0);
}

function waitButton(btn, keys = ['Enter']) {
  return new Promise((res) => {
    const kf = (e) => { if (keys.includes(e.key)) { e.preventDefault(); done(); } };
    const done = () => { removeEventListener('keydown', kf); res(); };
    btn.addEventListener('click', done, { once: true });
    addEventListener('keydown', kf);
  });
}

// ---- Home -----------------------------------------------------------------
function home() {
  const d = load();
  const last = d.runs.at(-1);
  const bestIQ = d.runs.length ? Math.max(...d.runs.map((r) => r.iq)) : null;
  screen(
    h('header', { class: 'topbar' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, '🧠'), 'Mind Games'), muteButton()),
    h('section', { class: 'hero' },
      h('h1', {}, 'How sharp is your mind ', h('span', { class: 'grad' }, 'today'), '?'),
      h('p', { class: 'sub' }, 'Ten adaptive games that test memory, reasoning, attention, speed and spatial thinking. Play them all to get your Mind Score and an IQ estimate.'),
      h('div', { class: 'hero-actions' },
        h('button', { class: 'btn primary big', onclick: () => assessment() }, 'Start full assessment →'),
        h('span', { class: 'muted' }, '≈ 12 min · 10 games · headphones optional')),
      last && h('div', { class: 'stats-row' },
        stat('Last IQ estimate', last.iq),
        stat('Last Mind Score', last.score, '/1000'),
        stat('Best IQ estimate', bestIQ),
        stat('Assessments', d.runs.length))),
    h('h2', { class: 'section-title' }, 'Practice any game'),
    h('section', { class: 'cards' }, GAMES.map((g) => {
      const best = d.best[g.id];
      return h('button', { class: 'card', style: { '--c': g.color }, onclick: () => single(g) },
        h('div', { class: 'card-icon' }, g.icon),
        h('div', { class: 'card-body' },
          h('div', { class: 'card-top' }, h('h3', {}, g.name), h('span', { class: 'chip' }, g.domain)),
          h('p', {}, g.tagline),
          h('div', { class: 'card-best' }, best ? [`Best: ${fmtRaw(g, best.raw)} · `, h('b', {}, `${best.points} pts`)] : 'Not played yet')));
    })),
    d.runs.length > 1 && history(d.runs),
    h('footer', { class: 'foot' }, 'Scores are normed against approximate published adult averages. This is a fun estimate, not a clinical IQ test.'));
}

function stat(label, value, suffix = '') {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, value, h('small', {}, suffix)), h('div', { class: 'stat-l' }, label));
}

function history(runs) {
  const rs = runs.slice(-12);
  const W = 600, H = 140, lo = 70, hi = 145;
  const x = (i) => (rs.length === 1 ? W / 2 : 20 + (i * (W - 40)) / (rs.length - 1));
  const y = (v) => H - 20 - ((clamp(v, lo, hi) - lo) / (hi - lo)) * (H - 40);
  const pts = rs.map((r, i) => `${x(i)},${y(r.iq)}`).join(' ');
  const dots = rs.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.iq)}" r="4"/><text x="${x(i)}" y="${y(r.iq) - 10}">${r.iq}</text>`).join('');
  const box = h('section', { class: 'history' }, h('h2', { class: 'section-title' }, 'Your progress'));
  box.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${W} ${H}" class="spark"><line x1="0" x2="${W}" y1="${y(100)}" y2="${y(100)}" class="avg"/><polyline points="${pts}"/>${dots}</svg>`);
  return box;
}

// ---- Game flow ------------------------------------------------------------
async function intro(game, meta) {
  const go = h('button', { class: 'btn primary big' }, 'Start ', h('kbd', {}, 'Enter'));
  const back = h('button', { class: 'btn ghost' }, meta ? 'Quit assessment' : '← Back');
  screen(
    meta && progressBar(meta.i, meta.total),
    h('div', { class: 'intro', style: { '--c': game.color } },
      h('div', { class: 'intro-icon' }, game.icon),
      h('span', { class: 'chip' }, game.domain),
      h('h1', {}, game.name),
      h('p', { class: 'sub' }, game.tagline),
      h('ol', { class: 'how' }, game.how.map((s) => h('li', {}, s))),
      h('div', { class: 'intro-actions' }, back, go)));
  return Promise.race([waitButton(go).then(() => true), waitButton(back, ['Escape']).then(() => false)]);
}

function progressBar(i, total) {
  return h('div', { class: 'progress' },
    h('div', { class: 'progress-label' }, `Game ${i + 1} of ${total}`),
    h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: { width: `${(i / total) * 100}%` } })));
}

function makeHud(game) {
  const f = {};
  const field = (k, label) => (f[k] = h('div', { class: 'hud-f', hidden: true }, h('span', { class: 'hud-l' }, label), h('span', { class: 'hud-v' })));
  const quit = h('button', { class: 'icon-btn', title: 'Quit (Esc)' }, '✕');
  const el = h('header', { class: 'hud', style: { '--c': game.color } },
    h('div', { class: 'hud-name' }, h('span', { class: 'hud-icon' }, game.icon), game.name),
    h('div', { class: 'hud-fields' }, field('level', 'Level'), field('score', 'Score'), field('lives', 'Lives'), field('time', 'Time')),
    quit);
  return {
    el, quit,
    set(k, v) {
      const box = f[k];
      box.hidden = v === '' || v == null;
      box.lastChild.textContent = k === 'lives' ? '♥'.repeat(Math.max(0, v)) + '♡'.repeat(Math.max(0, (box.max ||= v) - v)) : v;
    },
    urgent(b) { f.time.classList.toggle('urgent', b); },
  };
}

async function play(game, meta) {
  if (!(await intro(game, meta))) return null;
  const hud = makeHud(game);
  const stage = h('main', { class: 'stage', style: { '--c': game.color } });
  screen(meta && progressBar(meta.i, meta.total), hud.el, stage);
  const flash = (cls) => { stage.classList.remove('flash-good', 'flash-bad'); void stage.offsetWidth; stage.classList.add(cls); };
  const fx = { good: () => { sfx.good(); flash('flash-good'); }, bad: () => { sfx.bad(); flash('flash-bad'); }, tick: sfx.tick, click: sfx.click };
  const ctx = makeCtx(stage, hud, fx);
  hud.quit.onclick = () => ctx.abort();
  const esc = (e) => { if (e.key === 'Escape') ctx.abort(); };
  addEventListener('keydown', esc);
  try {
    const cd = h('div', { class: 'countdown' });
    stage.append(cd);
    for (const n of [3, 2, 1]) { cd.textContent = n; cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop'); sfx.count(false); await ctx.sleep(650); }
    sfx.count(true);
    cd.remove();
    const raw = await game.play(ctx);
    return evaluate(game, raw);
  } catch (e) {
    if (e === ABORT) return null;
    throw e;
  } finally {
    ctx.abort();
    removeEventListener('keydown', esc);
  }
}

function recordBest(r) {
  const d = load();
  if (!d.best[r.id] || r.points > d.best[r.id].points) d.best[r.id] = { raw: r.raw, points: r.points };
  save(d);
  return d;
}

function resultCard(game, r) {
  const pctile = Math.round(r.pct * 100);
  return h('div', { class: 'result', style: { '--c': game.color } },
    h('div', { class: 'intro-icon' }, game.icon),
    h('h2', {}, game.name),
    h('div', { class: 'result-grid' },
      h('div', {}, h('div', { class: 'stat-v' }, fmtRaw(game, r.raw)), h('div', { class: 'stat-l' }, game.rawLabel)),
      h('div', {}, h('div', { class: 'stat-v' }, r.points, h('small', {}, '/100')), h('div', { class: 'stat-l' }, 'Points')),
      h('div', {}, h('div', { class: 'stat-v' }, ordinal(Math.max(1, Math.min(99, pctile)))), h('div', { class: 'stat-l' }, 'Percentile'))),
    h('div', { class: 'meter' }, h('div', { class: 'meter-fill', style: { width: `${pctile}%` } })));
}

async function single(game) {
  const r = await play(game);
  if (!r) return home();
  const prev = load().best[game.id];
  recordBest(r);
  sfx.fanfare();
  const again = h('button', { class: 'btn primary' }, 'Play again ', h('kbd', {}, 'Enter'));
  const back = h('button', { class: 'btn ghost' }, 'All games');
  screen(h('div', { class: 'center' },
    resultCard(game, r),
    r.points > (prev?.points ?? 0) && h('div', { class: 'badge' }, '★ New personal best'),
    h('div', { class: 'intro-actions' }, back, again)));
  const choice = await Promise.race([waitButton(again).then(() => 'again'), waitButton(back, ['Escape']).then(() => 'home')]);
  choice === 'again' ? single(game) : home();
}

async function assessment() {
  const results = [];
  for (const [i, g] of GAMES.entries()) {
    const r = await play(g, { i, total: GAMES.length });
    if (!r) return home();
    results.push(r);
    recordBest(r);
    sfx.fanfare();
    if (i < GAMES.length - 1) {
      const next = h('button', { class: 'btn primary' }, `Next: ${GAMES[i + 1].name} `, h('kbd', {}, 'Enter'));
      screen(progressBar(i + 1, GAMES.length), h('div', { class: 'center' }, resultCard(g, r), h('div', { class: 'intro-actions' }, next)));
      await waitButton(next);
    }
  }
  final(results);
}

function gauge(iq) {
  const a = ((clamp(iq, 55, 145) - 55) / 90) * Math.PI;
  const x = 100 - 80 * Math.cos(a), y = 100 - 80 * Math.sin(a);
  const el = h('div', { class: 'gauge' });
  el.innerHTML = `<svg viewBox="0 0 200 115">
    <defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#4cc9f0"/><stop offset=".5" stop-color="#b388ff"/><stop offset="1" stop-color="#ff5d8f"/></linearGradient></defs>
    <path d="M20 100 A80 80 0 0 1 180 100" class="g-track"/>
    <path d="M20 100 A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" class="g-fill"/>
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" class="g-dot"/></svg>
    <div class="g-val"><span class="count-up">${iq}</span><small>IQ estimate</small></div>`;
  return el;
}

export function final(results) {
  const d = load();
  const score = results.reduce((s, r) => s + r.points, 0);
  const { iq, margin } = estimateIQ(results);
  d.runs.push({ date: Date.now(), iq, score, points: Object.fromEntries(results.map((r) => [r.id, r.points])) });
  save(d);
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const domains = DOMAINS.map((dom) => {
    const rs = GAMES.filter((g) => g.domain === dom).map((g) => byId[g.id]);
    return { dom, pct: rs.reduce((s, r) => s + r.pct, 0) / rs.length };
  });
  const top = [...domains].sort((a, b) => b.pct - a.pct)[0];

  screen(
    h('header', { class: 'topbar' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, '🧠'), 'Mind Games'), muteButton()),
    h('section', { class: 'final' },
      h('div', { class: 'final-hero' },
        gauge(iq),
        h('div', { class: 'final-side' },
          h('div', { class: 'band' }, iqBand(iq)),
          h('p', { class: 'muted' }, `Likely range ${iq - margin}–${iq + margin} · about ${ordinal(Math.round(normCdf((iq - 100) / 15) * 100) || 1)} percentile`),
          h('div', { class: 'mind-score' }, h('span', {}, score), h('small', {}, ' / 1000 Mind Score')),
          h('p', { class: 'muted' }, 'Strongest area: ', h('b', {}, top.dom)))),
      h('h2', { class: 'section-title' }, 'Cognitive profile'),
      h('div', { class: 'domains' }, domains.map((x) =>
        h('div', { class: 'dom' }, h('span', { class: 'dom-l' }, x.dom),
          h('div', { class: 'meter' }, h('div', { class: 'meter-fill', style: { width: `${Math.round(x.pct * 100)}%` } })),
          h('span', { class: 'dom-v' }, Math.round(x.pct * 100))))),
      h('h2', { class: 'section-title' }, 'Game breakdown'),
      h('div', { class: 'breakdown' }, GAMES.map((g) => {
        const r = byId[g.id];
        return h('div', { class: 'brow', style: { '--c': g.color } },
          h('span', { class: 'b-icon' }, g.icon), h('span', { class: 'b-name' }, g.name),
          h('span', { class: 'b-raw muted' }, `${g.rawLabel}: ${fmtRaw(g, r.raw)}`),
          h('span', { class: 'b-pts' }, r.points));
      })),
      h('p', { class: 'disclaimer' }, 'How this works: each game is scored against approximate adult averages from the research literature, then the ten scores are combined into one IQ-scale estimate. Practice, fatigue, device and input speed all affect it, so treat this as a benchmark to beat, not a diagnosis.'),
      h('div', { class: 'intro-actions' },
        h('button', { class: 'btn ghost', onclick: home }, 'Home'),
        h('button', { class: 'btn primary', onclick: () => assessment() }, 'Retake assessment'))));
  sfx.fanfare();
}

home();
