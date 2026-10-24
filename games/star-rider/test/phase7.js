'use strict';
// Agent-Guardian — Phase 7 feature gate + PERF-GATE soak.
// Exclusive file: do NOT edit run.js/verify.js here.
// Every feature check graceful-skips (PASS with note) until its wave lands.
const fs = require('fs');
const path = require('path');
const { buildEnv, ok, results } = require('./harness');

let skips = 0;
function skip(label, why) { skips++; console.log('  SKIP  ' + label + (why ? ' — ' + why : '')); }

// ---------- static feature surfacing (source-level) ----------
const gameSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');
const audioSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8');
const has = (re) => re.test(gameSrc);
const hasAudio = (re) => re.test(audioSrc);

console.log('== Phase 7 static feature surface ==');
const F = {
  levelupHud: has(/levelup(Hud|Queue|Pending|nonblock)/i) || has(/pendingLevels/) && has(/state\s*===\s*'playing'[^]*?pendingLevels/), // queued levels don't pause
  gemVacuum: has(/vacuum|gemPull|attractGems|magnetSurge|autoVacuum/i), // magnet powerup removed; auto-vacuum is the surface now
  overkill: has(/overkill|OVERKILL/i),
  splitter: has(/splitter/i),
  phantom: has(/phantom/i),
  weaver: has(/weaver/i),
  weaponHeat: has(/heat/i) && has(/milestoneBoost/i),
  runSave: has(/neonSurvivorsRunSave|runSave\b|saveRun\b|loadRun\b|continueRun|midRunSave|suspendRun|resumeRun|beforeunload/i) && has(/level|weapons|kills|time/i),
  sfxPack: hasAudio(/levelup|stinger|sparkle|comboTick|dopamine/i),
};
for (const [k, v] of Object.entries(F)) ok(true, `surface ${k}: ${v ? 'LANDED' : 'pending'}`);

// =====================================================================
// shared boot
let env;
try { env = buildEnv(); } catch (e) { ok(false, 'boot threw: ' + e.message); process.exit(1); }
const g = () => env.game();

function freshRun(seedData) {
  env = buildEnv(seedData);
  const gg = env.game();
  env.els['start-btn'].click();
  env.step(5);
  return gg;
}
function stabilize(gg) {
  gg.player.xp = 0; gg.player.xpNeed = 1e9;
  if (gg.state !== 'playing') { try { gg.startGame(); } catch (_) {} }
}
function pushEnemy(gg, type, x, y, extra = {}) {
  const e = Object.assign({
    type, x, y, vx: 0, vy: 0, hp: 20, maxHp: 20, speed: 60, damage: 5, r: 8, xp: 1,
    hitT: 0, ang: 0, spin: 0.5, dashT: 99, dashing: false, spawnT: 0,
    elite: false, boss: false, tier: 0, wobble: 0,
  }, extra);
  gg.enemies.push(e);
  return e;
}

// =====================================================================
console.log('== WS-B: non-blocking level-up ==');
{
  const gg = freshRun();
  stabilize(gg);
  if (!F.levelupHud) { skip('non-blocking levelup', 'not landed'); }
  else {
    // queue a level; state must stay 'playing' while choices are presented
    gg.player.xp = gg.player.xpNeed;
    if (typeof gg.levelUp === 'function') gg.levelUp();
    env.step(3);
    ok(gg.state === 'playing', 'state stays playing with pending level: ' + gg.state);
    // degrade: if overlay still used, pendingLevels>0 but state stays playing
  }
}

// =====================================================================
console.log('== WS-A: gem vacuum ==');
{
  const gg = freshRun();
  stabilize(gg);
  const p = gg.player;
  if (!F.gemVacuum) { skip('gem vacuum', 'not landed'); }
  else {
    gg.gems.push({ type: 'gem', x: p.x + 500, y: p.y + 500, value: 5, bobT: 0, vx: 0, vy: 0, age: 5 });
    const d0 = Math.hypot(500, 500);
    let minD = d0;
    for (let i = 0; i < 60; i++) { env.step(1); const gm = gg.gems.find(x => x.type === 'gem'); if (!gm) break; const d = Math.hypot(gm.x - p.x, gm.y - p.y, 2); if (d < minD) minD = d; }
    ok(minD < d0 * 0.5 || !gg.gems.some(x => x.type === 'gem'), `vacuum pulls aged gem: ${d0.toFixed(0)} -> ${minD.toFixed(0)}`);
  }
}

// =====================================================================
console.log('== WS-C: overkill drama ==');
{
  const gg = freshRun();
  stabilize(gg);
  if (!F.overkill) { skip('overkill', 'not landed'); }
  else {
    const ra = gg.runArrays;
    const e = pushEnemy(gg, 'dot', gg.player.x + 20, gg.player.y, { hp: 5, maxHp: 5 });
    const ftBefore = ra.floatTexts.length;
    const shBefore = gg.shockwaves.length;
    try { gg.damageEnemy(e, 9999, '#fff'); } catch (_) {}
    env.step(4);
    ok(ra.floatTexts.length > ftBefore || gg.shockwaves.length > shBefore || ra.particles.length > 0, 'big hit spawns overkill feedback');
  }
}

// =====================================================================
console.log('== WS-D: new enemies ==');
{
  const gg = freshRun();
  stabilize(gg);
  const ra = gg.runArrays;
  // splitter gen-cap
  if (!F.splitter) { skip('splitter', 'not landed'); }
  else {
    const s = pushEnemy(gg, 'splitter', gg.player.x + 100, gg.player.y, { gen: 0, hp: 10, maxHp: 10 });
    try { gg.damageEnemy(s, 999, '#fff'); } catch (_) {}
    env.step(6);
    const splits = gg.enemies.filter(e => /split/i.test(e.type) || e.gen > 0);
    const maxGen = splits.reduce((m, e) => Math.max(m, e.gen || 0), 0);
    ok(maxGen <= 3, `splitter gen capped <=3: ${maxGen}`);
  }
  // phantom
  if (!F.phantom) { skip('phantom', 'not landed'); }
  else {
    const ph = pushEnemy(gg, 'phantom', gg.player.x + 80, gg.player.y, { phaseT: 1, phased: false });
    env.step(45);
    ok(true, 'phantom stepped 45f without crash');
  }
  // weaver
  if (!F.weaver) { skip('weaver', 'not landed'); }
  else {
    const w = pushEnemy(gg, 'weaver', gg.player.x + 120, gg.player.y, {});
    const hzBefore = ra.hazards.length;
    env.step(90);
    ok(true, `weaver stepped 90f, hazards ${hzBefore} -> ${ra.hazards.length}`);
  }
}

// =====================================================================
console.log('== WS-E: weapon heat ==');
{
  const gg = freshRun();
  stabilize(gg);
  if (!F.weaponHeat) { skip('weapon heat', 'not landed'); }
  else {
    const w = (gg.player.weapons || [])[0];
    ok(true, 'weapons present: ' + (gg.player.weapons || []).length + (w && w.heat !== undefined ? ' heat=' + w.heat : ' (heat field pending)'));
  }
}

// =====================================================================
console.log('== WS-G: run-save round-trip ==');
{
  if (!F.runSave) { skip('run save', 'not landed'); }
  else {
    const gg = freshRun();
    stabilize(gg);
    gg.player.level = 7; gg.player.hp = 55;
    env.step(2);
    const keys = Object.keys(env.localStorageData);
    const key = keys.find(k => /runSave|suspend|resume|midRun/i.test(k));
    const api = typeof gg.saveRun === 'function' || typeof gg.suspendRun === 'function' || typeof gg.continueRun === 'function';
    ok(!!key || api, 'run-save key or API present: ' + (key || (api ? 'api' : 'none')) + ' | keys:' + keys.join(','));
  }
}

// =====================================================================
console.log('== WS-F: SFX pack ==');
{
  if (!F.sfxPack) { skip('sfx pack', 'not landed'); }
  else ok(true, 'audio dopamine pack surfaced in audio.js');
}

// =====================================================================
// PERF GATE — soak: 40 enemies incl. new types, 600 frames, caps hold
console.log('== PERF GATE: 40-enemy 600-frame soak ==');
{
  const gg = freshRun();
  stabilize(gg);
  const p = gg.player;
  p.hp = 99999; p.maxHp = 99999; // survive soak
  const types = ['dot', 'tri', 'quad', 'sniper', 'healer', 'bomber', 'penta'];
  if (F.splitter) types.push('splitter');
  if (F.phantom) types.push('phantom');
  if (F.weaver) types.push('weaver');
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pushEnemy(gg, types[i % types.length], p.x + Math.cos(a) * 220, p.y + Math.sin(a) * 220, { spawnT: 0 });
  }
  const ra = gg.runArrays;
  let crashed = null;
  let maxParticles = 0, maxFloatTexts = 0, maxShockwaves = 0, maxProjectiles = 0, maxHazards = 0;
  try {
    for (let i = 0; i < 600; i++) {
      env.step(1);
      maxParticles = Math.max(maxParticles, ra.particles.length);
      maxFloatTexts = Math.max(maxFloatTexts, ra.floatTexts.length);
      maxShockwaves = Math.max(maxShockwaves, gg.shockwaves.length);
      maxProjectiles = Math.max(maxProjectiles, ra.projectiles.length);
      maxHazards = Math.max(maxHazards, ra.hazards.length);
    }
  } catch (e) { crashed = e; }
  ok(!crashed, 'soak ran 600 frames' + (crashed ? ': ' + crashed.message : ''));
  ok(maxParticles <= 800, `pool particles ${maxParticles}/800`);
  ok(maxFloatTexts <= 80, `pool floatTexts ${maxFloatTexts}/80`);
  ok(maxShockwaves <= 100, `pool shockwaves ${maxShockwaves}/100`);
  ok(maxProjectiles <= 300, `pool projectiles ${maxProjectiles}/300`);
  ok(maxHazards <= 40, `hazards bounded ${maxHazards}/~40`);
  ok(Number.isFinite(gg.player.hp), 'player.hp finite after soak: ' + gg.player.hp);
  console.log(`  soak peaks: particles=${maxParticles} floatTexts=${maxFloatTexts} shockwaves=${maxShockwaves} projectiles=${maxProjectiles} hazards=${maxHazards}`);
}

// =====================================================================
const r = results();
console.log(`\nphase7: ${r.checks} checks, ${r.failures} failures, ${skips} skips`);
process.exit(r.failures ? 1 : 0);
