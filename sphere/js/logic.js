// ============================================================
// Sphere Quest — pure game logic (no DOM / Three.js, unit-testable)
// ============================================================

export const GAME_VERSION = 2;
export const SAVE_KEY = 'sphere-quest-save-v2';

// ---- Upgrades ----------------------------------------------------------
export const UPGRADES = {
  power: { id: 'power', name: 'Mining Laser', icon: '🔦',
    blurb: '+1 crystal per click per level.', base: 25, growth: 1.55, max: 40 },
  miner: { id: 'miner', name: 'Auto-Miner Drone', icon: '🛰️',
    blurb: '+0.5 crystals/sec per drone. They orbit the sphere.', base: 120, growth: 1.65, max: 30 },
  core: { id: 'core', name: 'Charge Core', icon: '⚡',
    blurb: '+15% to all crystal gains per level.', base: 300, growth: 2.2, max: 12 },
  theme: { id: 'theme', name: 'Sphere Theme', icon: '🎨',
    blurb: 'Recolor the sphere (cosmetic).', base: 400, growth: 3.0, max: 6 }
};

export const THEMES = [
  { name: 'Azure',   core: 0x1e3a8a, hi: 0x60a5fa, emis: 0x0d1b3a, accent: '#93c5fd' },
  { name: 'Magenta', core: 0x701a75, hi: 0xe879f9, emis: 0x2a0a2e, accent: '#f0abfc' },
  { name: 'Jade',    core: 0x064e3b, hi: 0x34d399, emis: 0x052e24, accent: '#6ee7b7' },
  { name: 'Solar',   core: 0x78350f, hi: 0xfbbf24, emis: 0x3b2205, accent: '#fcd34d' },
  { name: 'Void',    core: 0x1e1b4b, hi: 0xa78bfa, emis: 0x120f34, accent: '#c4b5fd' },
  { name: 'Ember',   core: 0x7f1d1d, hi: 0xf87171, emis: 0x331111, accent: '#fca5a5' }
];

// ---- Levels & XP -------------------------------------------------------
export const LEVEL_XP = (level) => Math.round(40 * Math.pow(level, 1.35));

export function xpForLevel(targetLevel) {
  let total = 0;
  for (let l = 1; l < targetLevel; l++) total += LEVEL_XP(l);
  return total;
}

export function levelFromXp(xp) {
  let level = 1, total = 0;
  while (total + LEVEL_XP(level) <= xp) { total += LEVEL_XP(level); level++; }
  return { level, into: xp - total, need: LEVEL_XP(level) };
}

export const RANKS = [
  [1, 'Star Rodent'], [2, 'Probe Pilot'], [3, 'Dust Diver'], [4, 'Asteroid Apprentice'],
  [5, 'Orbital Scout'], [7, 'Meteor Hunter'], [9, 'Comet Chaser'], [12, 'Nebula Nomad'],
  [15, 'Planetary Pioneer'], [18, 'Drift Baron'], [22, 'Supernova Ace'], [26, 'Galaxy Guardian'],
  [30, 'Cosmic Admiral'], [35, 'Singularity Sovereign'], [40, 'Void Emperor']
];

export function rankForLevel(level) {
  let cur = RANKS[0][1];
  for (const [l, name] of RANKS) if (level >= l) cur = name;
  return cur;
}

// ---- Economy -----------------------------------------------------------
export function upgradeCost(id, level) {
  const u = UPGRADES[id];
  return Math.round(u.base * Math.pow(u.growth, level));
}
export function upgradePrice(id, s) { return upgradeCost(id, s.upgrades[id]); }

export function getClicksPerMine(s) { return 1 + s.upgrades.power; }
export function getAutoRate(s) { return 0.5 * s.upgrades.miner; }
export function getGlobalMult(s) { return 1 + 0.15 * s.upgrades.core; }

export function mineGain(s) {
  const base = getClicksPerMine(s) * getGlobalMult(s);
  return Math.max(1, Math.round(base * (0.85 + Math.random() * 0.3)));
}

export function canBuyUpgrade(id, s) {
  const u = UPGRADES[id];
  return s.upgrades[id] < u.max && s.crystals >= upgradePrice(id, s);
}

// ---- Save state --------------------------------------------------------
export function defaultState() {
  return {
    v: GAME_VERSION,
    explorer: { name: 'Captain Void', color: '#60a5fa' },
    crystals: 0,
    xp: 0,
    totalMined: 0,
    totalClicks: 0,
    autoMined: 0,
    totalBuys: 0,
    playtimeS: 0,
    bestCombo: 0,
    upgrades: { power: 0, miner: 0, core: 0, theme: 0 },
    achievements: [],
    missions: null,
    log: [],
    settings: { sound: true, particles: 'high' },
    lastSeen: Date.now()
  };
}

export const MAX_COMBO_WINDOW_MS = 2500;
export function comboMultiplier(combo) { return 1 + combo * 0.02; }

export function pushLog(s, msg) {
  s.log.unshift({ t: Date.now(), msg });
  if (s.log.length > 14) s.log.length = 14;
}

// ---- Daily missions ----------------------------------------------------
export const MISSION_TEMPLATES = [
  { id: 'mine',    label: (n) => `Mine ${fmt(n)} crystals`,      metric: 'mined', n: 250, reward: 150 },
  { id: 'clicks',  label: (n) => `Click the sphere ${fmt(n)} times`, metric: 'clicks', n: 50, reward: 120 },
  { id: 'xp',      label: (n) => `Earn ${fmt(n)} XP`,            metric: 'xp', n: 120, reward: 140 },
  { id: 'total',   label: (n) => `Mine ${fmt(n)} crystals overall`, metric: 'total', n: 5000, reward: 400 },
  { id: 'combo',   label: (n) => `Hit a ${n}-click combo`,       metric: 'combo', n: 20, reward: 200 },
  { id: 'buys',    label: (n) => `Buy ${n} upgrades`,            metric: 'buys', n: 3, reward: 180 }
];

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

export function dailyMissions(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const seed = hashStr('sphere-' + day);
  const picks = [];
  for (let i = 0; i < 3; i++) {
    const t = MISSION_TEMPLATES[(seed + i * 7) % MISSION_TEMPLATES.length];
    const nScale = 1 + (Math.floor(seed / 100) % 5) * 0.25;
    const n = Math.max(5, Math.round(t.n * nScale));
    const reward = Math.round(t.reward * (0.8 + 0.2 * ((seed + i) % 3)));
    picks.push({ key: t.id + '-' + day, tpl: t.id, n, reward, claimed: false });
  }
  return picks;
}

export function ensureMissions(s, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  if (!s.missions || !s.missions[0] || !s.missions[0].key.endsWith('-' + day)) {
    s.missions = dailyMissions(now);
  }
  return s.missions;
}

export function missionProgress(s, m) {
  switch (m.tpl) {
    case 'mine': return (s.session && s.session.mined) || 0;
    case 'clicks': return (s.session && s.session.clicks) || 0;
    case 'xp': return (s.session && s.session.xp) || 0;
    case 'total': return s.totalMined;
    case 'combo': return s.bestCombo;
    case 'buys': return (s.session && s.session.buys) || 0;
  }
  return 0;
}

// ---- Achievements ------------------------------------------------------
export const ACHIEVEMENTS = [
  { id: 'first', icon: '✨', title: 'First Strike', desc: 'Mine your first crystal', cond: s => s.totalMined >= 1 },
  { id: 'century', icon: '💎', title: 'Century', desc: 'Mine 100 crystals', cond: s => s.totalMined >= 100 },
  { id: 'master', icon: '👑', title: 'Master Miner', desc: 'Mine 1,000 crystals', cond: s => s.totalMined >= 1000 },
  { id: 'baron', icon: '💰', title: 'Crystal Baron', desc: 'Mine 100,000 crystals', cond: s => s.totalMined >= 100000 },
  { id: 'mogul', icon: '🏦', title: 'Galactic Mogul', desc: 'Mine 1,000,000 crystals', cond: s => s.totalMined >= 1e6 },
  { id: 'rapid', icon: '🖱️', title: 'Rapid Fire', desc: 'Click 25 times', cond: s => s.totalClicks >= 25 },
  { id: 'machine', icon: '⚡', title: 'Machine Gun', desc: 'Click 1,000 times', cond: s => s.totalClicks >= 1000 },
  { id: 'fire', icon: '🔥', title: 'On Fire', desc: 'Reach a 20-click combo', cond: s => s.bestCombo >= 20 },
  { id: 'unstoppable', icon: '🌋', title: 'Unstoppable', desc: 'Reach a 50-click combo', cond: s => s.bestCombo >= 50 },
  { id: 'rookie', icon: '🛰️', title: 'Drone Rookie', desc: 'Own an auto-miner', cond: s => s.upgrades.miner >= 1 },
  { id: 'fleet', icon: '🛸', title: 'Fleet Commander', desc: 'Own 5 auto-miners', cond: s => s.upgrades.miner >= 5 },
  { id: 'armada', icon: '🚀', title: 'Armada', desc: 'Own 10 auto-miners', cond: s => s.upgrades.miner >= 10 },
  { id: 'rising', icon: '📈', title: 'Rising Star', desc: 'Reach level 3', cond: s => levelFromXp(s.xp).level >= 3 },
  { id: 'constellation', icon: '🌠', title: 'Constellation', desc: 'Reach level 7', cond: s => levelFromXp(s.xp).level >= 7 },
  { id: 'legend', icon: '👽', title: 'Legend of the Void', desc: 'Reach level 15', cond: s => levelFromXp(s.xp).level >= 15 },
  { id: 'makeover', icon: '🎨', title: 'Makeover', desc: 'Unlock a new theme', cond: s => s.upgrades.theme >= 1 },
  { id: 'prismatic', icon: '🌈', title: 'Prismatic', desc: 'Unlock every theme', cond: s => s.upgrades.theme >= THEMES.length - 1 },
  { id: 'loadout', icon: '🧰', title: 'Loadout', desc: 'Buy every upgrade type', cond: s => s.upgrades.power >= 1 && s.upgrades.miner >= 1 && s.upgrades.core >= 1 }
];

export function newlyUnlocked(s) {
  return ACHIEVEMENTS.filter(a => !s.achievements.includes(a.id) && a.cond(s)).map(a => a.id);
}

// ---- Formatting --------------------------------------------------------
export function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n >= 1e15) return (n / 1e15).toFixed(2) + 'Q';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

export function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
