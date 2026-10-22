// Unit tests for Sphere Quest pure logic (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import { exportSave, importSave } from '../js/save.js';

test('defaultState is valid and self-consistent', () => {
  const s = L.defaultState();
  assert.equal(s.crystals, 0);
  assert.deepEqual(s.upgrades, { power: 0, miner: 0, core: 0, theme: 0 });
  assert.equal(s.v, L.GAME_VERSION);
  assert.equal(L.getAutoRate(s), 0);
  assert.equal(L.getGlobalMult(s), 1);
});

test('levelFromXp thresholds match cumulative XP', () => {
  let xp = 0;
  const l1 = L.levelFromXp(xp);
  assert.equal(l1.level, 1);
  assert.equal(l1.need, L.LEVEL_XP(1));
  // just below level 2
  const need1 = L.LEVEL_XP(1);
  const l2 = L.levelFromXp(need1);
  assert.equal(l2.level, 2);
  assert.equal(l2.into, 0);
  // level 5 boundary
  const total5 = L.xpForLevel(5);
  const l5 = L.levelFromXp(total5);
  assert.equal(l5.level, 5);
  assert.equal(l5.into, 0);
});

test('ranks map to levels', () => {
  assert.equal(L.rankForLevel(0), 'Star Rodent');
  assert.equal(L.rankForLevel(1), 'Star Rodent');
  assert.equal(L.rankForLevel(5), 'Orbital Scout');
  assert.equal(L.rankForLevel(30), 'Cosmic Admiral');
  assert.equal(L.rankForLevel(99), 'Void Emperor');
});

test('upgrade costs grow and respect max', () => {
  assert.equal(L.upgradeCost('power', 0), 25);
  assert.ok(L.upgradeCost('power', 1) > 25);
  const s = L.defaultState();
  s.crystals = 1e12;
  assert.ok(L.canBuyUpgrade('power', s));
  s.crystals = 0;
  assert.ok(!L.canBuyUpgrade('power', s));
  s.upgrades.power = L.UPGRADES.power.max;
  assert.ok(!L.canBuyUpgrade('power', s));
});

test('mineGain respects power/core and randomness bounds', () => {
  const s = L.defaultState();
  s.upgrades.power = 4;
  s.upgrades.core = 2; // mult 1.3
  for (let i = 0; i < 200; i++) {
    const g = L.mineGain(s);
    const ideal = 5 * 1.3;
    assert.ok(g >= Math.max(1, Math.round(ideal * 0.85)), `too low ${g}`);
    assert.ok(g <= Math.round(ideal * 1.15), `too high ${g}`);
  }
});

test('combo multiplier scales', () => {
  assert.equal(L.comboMultiplier(0), 1);
  assert.equal(L.comboMultiplier(50), 2);
});

test('daily missions are deterministic per day and respect a new day', () => {
  const d1 = new Date('2026-05-01T10:00:00Z');
  const d1b = new Date('2026-05-01T23:59:00Z');
  const d2 = new Date('2026-05-02T00:00:00Z');
  const m1 = L.dailyMissions(d1);
  const m1b = L.dailyMissions(d1b);
  const m2 = L.dailyMissions(d2);
  assert.equal(m1.length, 3);
  assert.deepEqual(m1.map(x => x.key), m1b.map(x => x.key));
  assert.notDeepEqual(m1.map(x => x.key), m2.map(x => x.key));
  assert.ok(m1.every(m => m.n > 0 && m.reward > 0));
});

test('ensureMissions only refreshes on new day', () => {
  const s = L.defaultState();
  L.ensureMissions(s, new Date('2026-05-01T12:00:00Z'));
  const first = s.missions.map(m => m.key);
  L.ensureMissions(s, new Date('2026-05-01T18:00:00Z'));
  assert.deepEqual(s.missions.map(m => m.key), first);
  s.missions[0].claimed = true;
  L.ensureMissions(s, new Date('2026-05-02T12:00:00Z'));
  assert.equal(s.missions[0].claimed, false);
  assert.notDeepEqual(s.missions.map(m => m.key), first);
});

test('missionProgress reads session metrics', () => {
  const s = L.defaultState();
  s.session = { mined: 100, clicks: 20, xp: 30, buys: 2 };
  const missions = L.dailyMissions(new Date('2026-05-01T12:00:00Z'));
  for (const m of missions) {
    assert.equal(typeof L.missionProgress(s, m), 'number');
    assert.ok(L.missionProgress(s, m) >= 0);
  }
  const mineM = missions.find(m => m.tpl === 'mine');
  if (mineM) assert.equal(L.missionProgress(s, mineM), 100);
  assert.equal(L.missionProgress(s, missions.find(m => m.tpl === 'total')), 0);
});

test('achievements unlock based on state (without side effects)', () => {
  const s = L.defaultState();
  assert.equal(L.newlyUnlocked(s).length, 0);
  s.totalMined = 1;
  assert.deepEqual(L.newlyUnlocked(s), ['first']);
  s.bestCombo = 50;
  s.totalClicks = 30;
  s.upgrades.miner = 5;
  s.upgrades.power = 1;
  s.upgrades.core = 1;
  s.xp = L.xpForLevel(7);
  const unlocked = new Set(L.newlyUnlocked(s));
  assert.ok(unlocked.has('fire'));
  assert.ok(unlocked.has('unstoppable'));
  assert.ok(unlocked.has('rapid'));
  assert.ok(unlocked.has('fleet'));
  assert.ok(unlocked.has('loadout'));
  assert.ok(unlocked.has('constellation'));
  // already-unlocked not reported twice
  s.achievements = [...unlocked];
  assert.equal(L.newlyUnlocked(s).length, 0);
});

test('fmt and fmtTime helpers', () => {
  assert.equal(L.fmt(0), '0');
  assert.equal(L.fmt(999), '999');
  assert.equal(L.fmt(1250), '1.3K');
  assert.equal(L.fmt(2.5e6), '2.50M');
  assert.equal(L.fmt(1.2e9), '1.20B');
  assert.equal(L.fmtTime(0), '0s');
  assert.equal(L.fmtTime(65), '1m 5s');
  assert.equal(L.fmtTime(3661), '1h 1m');
});

test('save export/import round-trips', () => {
  const s = L.defaultState();
  s.crystals = 12345;
  s.explorer.name = 'Testy';
  const json = exportSave(s);
  const back = importSave(json);
  assert.equal(back.crystals, 12345);
  assert.equal(back.explorer.name, 'Testy');
  assert.equal(back.upgrades.theme, 0);
  assert.throws(() => importSave('{"nope":1}'));
  assert.throws(() => importSave('not json'));
});

test('pushLog caps length and prepends', () => {
  const s = L.defaultState();
  for (let i = 0; i < 20; i++) L.pushLog(s, 'entry ' + i);
  assert.equal(s.log.length, 14);
  assert.equal(s.log[0].msg, 'entry 19');
});
