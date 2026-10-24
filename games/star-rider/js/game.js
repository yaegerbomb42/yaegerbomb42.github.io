// ============================================================
//  STAR-RIDER - a fast, juicy arena survival game
//  Move with WASD/arrows. Weapons auto-fire. Survive to 10:00.
// ============================================================
(function () {
'use strict';

// ---------------- Constants & helpers ----------------
const TAU = Math.PI * 2;
const WIN_TIME = 600; // 10 minutes to boss
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
const lerp = (a, b, t) => a + (b - a) * t;
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const TAU_HALF = Math.PI;

// ---------------- Canvas & Post-Processing ----------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const caCanvas = document.createElement('canvas');
const caCtx = caCanvas.getContext('2d');
let W = 0, H = 0;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W; canvas.height = H;
  caCanvas.width = W; caCanvas.height = H;
}
window.addEventListener('resize', resize);
resize();

// ---------------- DOM ----------------
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), menu: $('menu-screen'),
  // Legacy fog-modal (#levelup-screen) retained as the supply-cache backdrop —
  // chest choices still overlay it, so the handle stays live post-dock-migration.
  levelup: $('levelup-screen'),
  // WS-B non-blocking dock (left-edge HUD). ui.levelupHud/cards are state-change-only.
  // ui.cards points at the non-blocking dock's card list (#levelup-cards). Legacy
  // #cards is retained in the DOM for the test harness — fall back to it so the
  // harness's light DOM stub (which only registers #cards) still resolves a node.
  levelupHud: $('levelup-hud'), cards: $('levelup-cards') || $('cards'),
  gameover: $('gameover-screen'), victory: $('victory-screen'), pause: $('pause-screen'),
  meta: $('meta-screen'), settings: $('settings-screen'),
  touchControls: $('touch-controls'),
  xpBar: $('xp-bar'), levelText: $('level-text'), timer: $('timer'),
  killCount: $('kill-count'), hpBar: $('hp-bar'),
  gameoverTitle: $('gameover-title'), gameoverStats: $('gameover-stats'), gameoverShards: $('gameover-shards'),
  victoryStats: $('victory-stats'), victoryShards: $('victory-shards'), highScoreLine: $('high-score-line'),
  metaShardsVal: $('meta-shards-val'), metaStatCards: $('meta-stat-cards'), metaWeaponCards: $('meta-weapon-cards'),
  masterVolInput: $('setting-master-vol'), sfxVolInput: $('setting-sfx-vol'), musicVolInput: $('setting-music-vol'),
  valMasterVol: $('val-master-vol'), valSfxVol: $('val-sfx-vol'), valMusicVol: $('val-music-vol'),
  screenshakeInput: $('setting-screenshake'), reducedFlashInput: $('setting-reduced-flash'),
  dvorakInput: $('setting-dvorak'),
  shakeScaleInput: $('setting-shake-scale'), valShakeScale: $('val-shake-scale'),
  pauseHudBtn: $('pause-hud-btn'), touchDashBtn: $('touch-dash-btn'),
  joystickBase: $('joystick-base'), joystickKnob: $('joystick-knob'),
  dailyCard: $('daily-modifier-card'), dailyTag: $('daily-mode-tag'), dailyDateVal: $('daily-date-val'),
  dailyMutatorsContainer: $('daily-mutators-container'), modeDailyBtn: $('mode-daily-btn'),
  modeCustomBtn: $('mode-custom-btn'), modeStandardBtn: $('mode-standard-btn'),
  customSeedWrap: $('custom-seed-wrap'), customSeedInput: $('custom-seed-input'),
  hudModifierBadge: $('hud-modifier-badge'), hudModifierIcon: $('hud-modifier-icon'),
  hudModifierText: $('hud-modifier-text'), hudModifierSeed: $('hud-modifier-seed'),
  codex: $('codex-screen'), codexContent: $('codex-content'), codexBack: $('codex-back-btn'),
  pauseCodexBtn: $('pause-codex-btn'),
  trophies: $('trophies-screen'),
  crash: $('crash-screen'), crashSummary: $('crash-summary'), crashDetails: $('crash-details'),
  crashCopyBtn: $('crash-copy-btn'), crashRestartBtn: $('crash-restart-btn'),
};

// ---------------- Global Crash Handler & Telemetry Debugger ----------------
let lastCrashReport = '';
// Rolling telemetry ring: last N flagged subsystems + entity snapshot + FPS EMA.
const _telemetry = {
  fps: 60, frameMs: 16.7, worstFrameMs: 0, worstFrameAt: 0,
  ring: [], ringMax: 24,
  errors: [], errMax: 8,
  mark(label) {
    this.ring.push(label);
    if (this.ring.length > this.ringMax) this.ring.shift();
  },
  logError(scope, e) {
    const entry = `[${scope}] ${e && e.message ? e.message : String(e)}`;
    this.errors.push(entry);
    if (this.errors.length > this.errMax) this.errors.shift();
  },
  tickPerformance(frameMs) {
    this.frameMs = frameMs;
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, frameMs)) * 0.05;
    if (frameMs > this.worstFrameMs) { this.worstFrameMs = frameMs; this.worstFrameAt = (typeof time !== 'undefined' ? time : 0); }
    if (this.worstFrameAt !== (typeof time !== 'undefined' ? time : 0) && (typeof time !== 'undefined' ? time : 0) - this.worstFrameAt > 5) this.worstFrameMs *= 0.9; // decay so spikes fade
  },
  snapshot() {
    const entCounts = (typeof enemies !== 'undefined' && typeof gems !== 'undefined' && typeof projectiles !== 'undefined')
      ? `enemies:${enemies.length} gems:${gems.length} proj:${projectiles.length} particles:${(typeof particles !== 'undefined' ? particles.length : 0)} hazards:${(typeof hazards !== 'undefined' ? hazards.length : 0)} planets:${(typeof PLANETS !== 'undefined' ? PLANETS.length : 0)}`
      : 'entities N/A';
    return `FPS:${this.fps.toFixed(1)} frameMs:${this.frameMs.toFixed(1)} worst:${this.worstFrameMs.toFixed(1)}ms | ${entCounts}\nRecent marks: ${this.ring.join(' → ')}\nRecent errors: ${this.errors.length ? this.errors.join(' | ') : 'none'}`;
  },
};
function triggerCrashDebugger(msg, url, line, col, err) {
  try {
    const stack = err && err.stack ? err.stack : `Error: ${msg}\n    at ${url}:${line}:${col}`;
    const timestamp = new Date().toISOString();
    const gameTime = typeof time !== 'undefined' ? time.toFixed(1) + 's' : 'unknown';
    const enemyCount = typeof enemies !== 'undefined' ? enemies.length : 0;
    const killsCount = typeof kills !== 'undefined' ? kills : 0;
    const playerHp = typeof player !== 'undefined' ? `${player.hp}/${player.maxHp}` : 'N/A';
    const playerLv = typeof player !== 'undefined' ? player.level : 'N/A';
    const mode = typeof runMode !== 'undefined' ? runMode : 'N/A';
    const playerPos = typeof player !== 'undefined' ? `(${Math.round(player.x)},${Math.round(player.y)})` : 'N/A';

    lastCrashReport = `=== STAR-RIDER CRASH REPORT ===
Timestamp: ${timestamp}
Time: ${gameTime} | Mode: ${mode} | Level: ${playerLv} | Kills: ${killsCount} | Enemies: ${enemyCount} | HP: ${playerHp} | Pos: ${playerPos}

Telemetry:
${_telemetry.snapshot()}

Message: ${msg}
Location: ${url}:${line}:${col}

Stack Trace:
${stack}`;

    console.error(lastCrashReport);

    if (ui.crash && ui.crashDetails) {
      ui.crashSummary.textContent = `Crash occurred at ${gameTime} (Kills: ${killsCount}, Level: ${playerLv}). ${msg}`;
      ui.crashDetails.textContent = lastCrashReport;
      ui.crash.classList.remove('hidden');
    }
  } catch (e) {
    console.error('Failed to trigger crash UI:', e);
  }
}

window.addEventListener('error', function (e) {
  triggerCrashDebugger(e.message, e.filename, e.lineno, e.colno, e.error);
});
window.addEventListener('unhandledrejection', function (e) {
  const err = e.reason || {};
  triggerCrashDebugger(err.message || String(err), err.fileName || 'promise', err.lineNumber || 0, 0, err);
});

if (ui.crashCopyBtn) {
  ui.crashCopyBtn.onclick = () => {
    if (navigator.clipboard && lastCrashReport) {
      navigator.clipboard.writeText(lastCrashReport).then(() => {
        ui.crashCopyBtn.textContent = 'COPIED!';
        setTimeout(() => { ui.crashCopyBtn.textContent = 'COPY REPORT'; }, 2000);
      }).catch(() => {
        prompt('Copy crash report:', lastCrashReport);
      });
    } else {
      prompt('Copy crash report:', lastCrashReport);
    }
  };
}
if (ui.crashRestartBtn) {
  ui.crashRestartBtn.onclick = () => {
    window.location.reload();
  };
}

// ---------------- Safe persistence helpers (WS-G) ----------------
// Forward-compatible JSON round-trips: safeLoad merges stored values onto the
// defaults so old saves stay valid after new fields are added; safeSave never
// throws (private-mode quota / serialization edge cases are non-fatal).
function safeLoad(key, defaults) {
  try {
    const raw = localStorage.getItem(key);
    return Object.assign({}, defaults, raw ? JSON.parse(raw) : {});
  } catch (e) { return Object.assign({}, defaults); }
}
function safeSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

// ---------------- Settings System ----------------
let settings = {
  masterVol: 80, sfxVol: 80, musicVol: 50,
  screenshake: true, reducedFlash: false,
  dvorak: false, shakeScale: 0,
};
try {
  const savedSettings = JSON.parse(localStorage.getItem('neonSurvivorsSettings') || '{}');
  settings = Object.assign(settings, savedSettings);
} catch (e) {}

function saveSettings() {
  try { localStorage.setItem('neonSurvivorsSettings', JSON.stringify(settings)); } catch (e) {}
  applySettings();
}

function applySettings() {
  AudioSys.setMasterVolume(settings.masterVol / 100);
  AudioSys.setSfxVolume(settings.sfxVol / 100);
  AudioSys.setMusicVolume(settings.musicVol / 100);
}

function initSettingsUI() {
  ui.masterVolInput.value = settings.masterVol;
  ui.valMasterVol.textContent = settings.masterVol + '%';
  ui.sfxVolInput.value = settings.sfxVol;
  ui.valSfxVol.textContent = settings.sfxVol + '%';
  ui.musicVolInput.value = settings.musicVol;
  ui.valMusicVol.textContent = settings.musicVol + '%';
  ui.screenshakeInput.checked = !!settings.screenshake;
  ui.reducedFlashInput.checked = !!settings.reducedFlash;
  if (ui.dvorakInput) ui.dvorakInput.checked = !!settings.dvorak;
  if (ui.shakeScaleInput) { ui.shakeScaleInput.value = Math.round(settings.shakeScale * 100); ui.valShakeScale.textContent = Math.round(settings.shakeScale * 100) + '%'; }

  ui.masterVolInput.oninput = (e) => {
    settings.masterVol = parseInt(e.target.value, 10);
    ui.valMasterVol.textContent = settings.masterVol + '%';
    saveSettings();
  };
  ui.sfxVolInput.oninput = (e) => {
    settings.sfxVol = parseInt(e.target.value, 10);
    ui.valSfxVol.textContent = settings.sfxVol + '%';
    saveSettings();
  };
  ui.musicVolInput.oninput = (e) => {
    settings.musicVol = parseInt(e.target.value, 10);
    ui.valMusicVol.textContent = settings.musicVol + '%';
    saveSettings();
  };
  if (ui.shakeScaleInput) {
    ui.shakeScaleInput.oninput = (e) => {
      settings.shakeScale = parseInt(e.target.value, 10) / 100;
      ui.valShakeScale.textContent = Math.round(settings.shakeScale * 100) + '%';
      saveSettings();
    };
  }
  ui.screenshakeInput.onchange = (e) => {
    settings.screenshake = e.target.checked;
    saveSettings();
  };
  ui.reducedFlashInput.onchange = (e) => {
    settings.reducedFlash = e.target.checked;
    saveSettings();
  };
  if (ui.dvorakInput) {
    ui.dvorakInput.onchange = (e) => {
      settings.dvorak = e.target.checked;
      saveSettings();
      showFloatingShard(settings.dvorak ? 'DVORAK CONTROLS (,AOE)' : 'QWERTY CONTROLS (WASD)');
    };
  }
}
applySettings();

// ---------------- Meta Progression System ----------------
let meta = safeLoad('neonSurvivorsMeta', {
  shards: 0,
  hpRank: 0,
  speedRank: 0,
  unlockedWeapons: ['bolt'],
  startingWeapon: 'bolt',
});
if (!Array.isArray(meta.unlockedWeapons)) meta.unlockedWeapons = ['bolt'];

function saveMeta() {
  safeSave('neonSurvivorsMeta', meta);
  if (typeof achievementsData !== 'undefined') {
    achievementsData.stats.totalShards = Math.max(achievementsData.stats.totalShards || 0, meta.shards || 0);
    saveAchievements();
    checkAchievements();
  }
}

// ---------------- Achievements & Trophy System ----------------
const ACHIEVEMENT_DEFS = [
  { id: 'first_blood', name: 'FIRST BLOOD', desc: 'Defeat your first enemy.', icon: '⚔️' },
  { id: 'slayer_1000', name: 'SLAYER 1000', desc: 'Defeat 1,000 total enemies.', icon: '☠️', goal: 1000, statKey: 'totalKills' },
  { id: 'slayer_5000', name: 'APEX PREDATOR', desc: 'Defeat 5,000 total enemies.', icon: '💀', goal: 5000, statKey: 'totalKills' },
  { id: 'boss_killer', name: 'BOSS KILLER', desc: 'Defeat a mini-boss or main boss.', icon: '👑' },
  { id: 'master_weaver', name: 'MASTER WEAVER', desc: 'Reach a 50x combo streak.', icon: '⚡', goal: 50, statKey: 'maxCombo' },
  { id: 'survivor_10m', name: 'SURVIVOR 10M', desc: 'Survive for 10:00 minutes in a run.', icon: '⏱️', goal: 600, statKey: 'maxSurviveTime' },
  { id: 'shard_collector', name: 'SHARD COLLECTOR', desc: 'Collect 500 total Star Shards.', icon: '💎', goal: 500, statKey: 'totalShards' },
  { id: 'level_20', name: 'OVERCHARGED', desc: 'Reach Level 20 in a single run.', icon: '🌟', goal: 20, statKey: 'maxLevel' },
  { id: 'arsenal_master', name: 'ARSENAL MASTER', desc: 'Equip 4 or more weapons simultaneously.', icon: '🛠️' },
  { id: 'dash_master', name: 'SPEED DEMON', desc: 'Perform 50 dashes.', icon: '💨', goal: 50, statKey: 'totalDashes' },
  { id: 'untouchable', name: 'UNTOUCHABLE', desc: 'Survive 3 minutes without taking damage.', icon: '🛡️' },
  { id: 'victorious', name: 'NEON LEGEND', desc: 'Achieve victory by defeating the final boss.', icon: '🏆' },
  // W-series: achievements bound to the new progression / enemy systems
  { id: 'auto_forge', name: 'AUTO-FORGE ONLINE', desc: 'Let the AUTO-FORGE upgrade a weapon for free.', icon: '⚙️', goal: 1, statKey: 'forgeProcs' },
  { id: 'void_harvest', name: 'VOID HARVEST', desc: 'Pull 100 gems with the VOID VACUUM surge.', icon: '🌀', goal: 100, statKey: 'surgePulled' },
  { id: 'weaver_slayer', name: 'WEAVER SLAYER', desc: 'Defeat 10 Serpentine Weavers.', icon: '〰', goal: 10, statKey: 'weaverKills' },
  { id: 'do_not_blink', name: 'DO NOT BLINK', desc: 'Defeat 10 Phantoms.', icon: '👁', goal: 10, statKey: 'phantomKills' },
  { id: 'mitosis_denied', name: 'MITOSIS DENIED', desc: 'Defeat 10 Splitters.', icon: '🧬', goal: 10, statKey: 'splitterKills' },
  { id: 'run_continued', name: 'SECOND WIND', desc: 'Resume a saved run with CONTINUE.', icon: '💾' },
];

let achievementsData = {
  unlocked: {},
  stats: {
    totalKills: 0,
    totalDashes: 0,
    totalShards: 0,
    maxCombo: 0,
    maxSurviveTime: 0,
    maxLevel: 0,
    bossKills: 0,
    victories: 0,
    forgeProcs: 0,
    surgePulled: 0,
    weaverKills: 0,
    phantomKills: 0,
    splitterKills: 0,
    runsContinued: 0,
  }
};

function loadAchievements() {
  try {
    const raw = localStorage.getItem('neonSurvivorsAchievements');
    if (raw) {
      const parsed = JSON.parse(raw);
      achievementsData.unlocked = (parsed && typeof parsed === 'object' && parsed.unlocked) || {};
      achievementsData.stats = Object.assign(achievementsData.stats, (parsed && typeof parsed === 'object' && parsed.stats) || {});
    }
  } catch (e) {}
}

function saveAchievements() {
  safeSave('neonSurvivorsAchievements', achievementsData);
}

loadAchievements();

function checkAchievements() {
  const stats = achievementsData.stats;
  for (const ach of ACHIEVEMENT_DEFS) {
    if (achievementsData.unlocked[ach.id]) continue;
    let isUnlocked = false;

    if (ach.id === 'first_blood') isUnlocked = stats.totalKills >= 1;
    else if (ach.id === 'slayer_1000') isUnlocked = stats.totalKills >= 1000;
    else if (ach.id === 'slayer_5000') isUnlocked = stats.totalKills >= 5000;
    else if (ach.id === 'boss_killer') isUnlocked = stats.bossKills >= 1;
    else if (ach.id === 'master_weaver') isUnlocked = stats.maxCombo >= 50;
    else if (ach.id === 'survivor_10m') isUnlocked = stats.maxSurviveTime >= 600;
    else if (ach.id === 'shard_collector') isUnlocked = stats.totalShards >= 500;
    else if (ach.id === 'level_20') isUnlocked = stats.maxLevel >= 20;
    else if (ach.id === 'arsenal_master') isUnlocked = (typeof player !== 'undefined' && player && player.weapons && player.weapons.length >= 4);
    else if (ach.id === 'dash_master') isUnlocked = stats.totalDashes >= 50;
    else if (ach.id === 'untouchable') isUnlocked = (typeof time !== 'undefined' && time >= 180 && player && !player.tookDamageThisRun);
    else if (ach.id === 'victorious') isUnlocked = stats.victories >= 1;
    else if (ach.id === 'auto_forge') isUnlocked = stats.forgeProcs >= 1;
    else if (ach.id === 'void_harvest') isUnlocked = stats.surgePulled >= 100;
    else if (ach.id === 'weaver_slayer') isUnlocked = stats.weaverKills >= 10;
    else if (ach.id === 'do_not_blink') isUnlocked = stats.phantomKills >= 10;
    else if (ach.id === 'mitosis_denied') isUnlocked = stats.splitterKills >= 10;
    else if (ach.id === 'run_continued') isUnlocked = stats.runsContinued >= 1;

    if (isUnlocked) {
      unlockAchievement(ach);
    }
  }
}

function unlockAchievement(ach) {
  if (achievementsData.unlocked[ach.id]) return;
  achievementsData.unlocked[ach.id] = Date.now();
  saveAchievements();
  showAchievementToast(ach);
  if (typeof AudioSys !== 'undefined' && AudioSys.SFX && AudioSys.SFX.milestone) {
    AudioSys.SFX.milestone();
  }
}

function showAchievementToast(ach) {
  const container = $('achievement-toast-container') || document.body;
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.innerHTML = `
    <div class="toast-icon">${ach.icon}</div>
    <div class="toast-content">
      <div class="toast-header">🏆 ACHIEVEMENT UNLOCKED!</div>
      <div class="toast-title">${ach.name}</div>
      <div class="toast-desc">${ach.desc}</div>
    </div>
  `;
  container.appendChild(toast);
  if (typeof setTimeout !== 'undefined') {
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }
}

function renderTrophiesScreen() {
  const listEl = $('trophies-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  
  const total = ACHIEVEMENT_DEFS.length;
  let unlockedCount = 0;
  
  for (const ach of ACHIEVEMENT_DEFS) {
    const isUnlocked = !!achievementsData.unlocked[ach.id];
    if (isUnlocked) unlockedCount++;

    let progressHtml = '';
    if (!isUnlocked && ach.goal && ach.statKey) {
      const curVal = Math.min(ach.goal, achievementsData.stats[ach.statKey] || 0);
      const pct = Math.floor((curVal / ach.goal) * 100);
      progressHtml = `
        <div class="trophy-progress-bar">
          <div class="trophy-progress-fill" style="width: ${pct}%"></div>
        </div>
      `;
    }

    let dateStr = '';
    if (isUnlocked) {
      const ts = achievementsData.unlocked[ach.id];
      if (typeof ts === 'number') {
        const d = new Date(ts);
        dateStr = `UNLOCKED: ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
        dateStr = 'UNLOCKED';
      }
    }

    const card = document.createElement('div');
    card.className = `trophy-card ${isUnlocked ? 'unlocked' : 'locked'}`;
    card.innerHTML = `
      <div class="icon-box">${ach.icon}</div>
      <div class="details">
        <div class="trophy-card-title">${ach.name}</div>
        <div class="desc">${ach.desc}</div>
        ${progressHtml}
        <div class="status-tag">${isUnlocked ? dateStr : 'LOCKED'}</div>
      </div>
    `;
    listEl.appendChild(card);
  }

  const pctTotal = Math.floor((unlockedCount / total) * 100);
  if ($('trophies-unlocked-count')) $('trophies-unlocked-count').textContent = unlockedCount;
  if ($('trophies-total-count')) $('trophies-total-count').textContent = total;
  if ($('trophies-percent')) $('trophies-percent').textContent = pctTotal + '%';
}


const META_DEFS = {
  stats: [
    { id: 'hpRank', name: 'HULL FORGING', desc: '+10 Max HP per rank', maxRank: 5, baseCost: 50, costMult: 2, icon: '❤' },
    { id: 'speedRank', name: 'THROTTLE BOOSTER', desc: '+5% Move Speed per rank', maxRank: 5, baseCost: 50, costMult: 2, icon: '≫' },
  ],
  weapons: [
    { id: 'bolt', name: 'Neon Bolt', cost: 0 },
    { id: 'saws', name: 'Orbit Saws', cost: 150 },
    { id: 'nova', name: 'Nova Pulse', cost: 200 },
    { id: 'tesla', name: 'Tesla Arc', cost: 250 },
    { id: 'lance', name: 'Rail Lance', cost: 300 },
    { id: 'drones', name: 'Seeker Drones', cost: 350 },
    { id: 'frost', name: 'Freeze Ray', cost: 400 },
    { id: 'prism', name: 'Arc Prism', cost: 450 },
  ]
};

function renderMetaScreen() {
  ui.metaShardsVal.textContent = meta.shards;
  ui.metaStatCards.innerHTML = '';
  for (const stat of META_DEFS.stats) {
    const curRank = meta[stat.id] || 0;
    const cost = Math.floor(stat.baseCost * Math.pow(stat.costMult, curRank));
    const isMax = curRank >= stat.maxRank;
    const el = document.createElement('div');
    el.className = 'meta-card';
    el.innerHTML = `
      <div class="name">${stat.icon} ${stat.name}</div>
      <div class="desc">${stat.desc}</div>
      <div class="rank">Rank: ${curRank} / ${stat.maxRank}</div>
    `;
    const btn = document.createElement('button');
    btn.className = 'meta-card-btn';
    btn.disabled = isMax || meta.shards < cost;
    btn.textContent = isMax ? 'MAX' : `BUY (${cost} 💎)`;
    btn.onclick = () => {
      if (!isMax && meta.shards >= cost) {
        meta.shards -= cost;
        meta[stat.id] = curRank + 1;
        saveMeta();
        AudioSys.SFX.gem();
        renderMetaScreen();
      }
    };
    el.appendChild(btn);
    ui.metaStatCards.appendChild(el);
  }
  ui.metaWeaponCards.innerHTML = '';
  for (const w of META_DEFS.weapons) {
    const isUnlocked = meta.unlockedWeapons.includes(w.id);
    const isSelected = meta.startingWeapon === w.id;
    const def = WEAPON_DEFS[w.id];
    const el = document.createElement('div');
    el.className = 'meta-card' + (isSelected ? ' selected' : '');
    el.innerHTML = `
      <div class="name">${def.icon} ${w.name}</div>
      <div class="desc">${def.desc}</div>
    `;
    const btn = document.createElement('button');
    btn.className = 'meta-card-btn';
    btn.disabled = isSelected;
    btn.textContent = isSelected ? 'EQUIPPED' : isUnlocked ? 'EQUIP' : `UNLOCK (${w.cost} 💎)`;
    btn.onclick = () => {
      if (isUnlocked) {
        meta.startingWeapon = w.id;
        saveMeta();
        AudioSys.SFX.shoot();
        renderMetaScreen();
      } else if (meta.shards >= w.cost) {
        meta.shards -= w.cost;
        meta.unlockedWeapons.push(w.id);
        meta.startingWeapon = w.id;
        saveMeta();
        AudioSys.SFX.chest();
        renderMetaScreen();
      }
    };
    el.appendChild(btn);
    ui.metaWeaponCards.appendChild(el);
  }
}

// ---------------- Input & Touch Controls ----------------
let minimapVisible = true; // toggled with N key
const keys = {};
let touchVector = { x: 0, y: 0 };
let joystickTouchId = null;
let joystickStartPos = { x: 0, y: 0 };

function initTouchControls() {
  const nav = (typeof navigator !== 'undefined') ? navigator : null;
  const isTouchDevice = ('ontouchstart' in window) || (!!nav && (nav.maxTouchPoints || 0) > 0);
  if (isTouchDevice) {
    ui.touchControls.classList.remove('hidden');
  }

  window.addEventListener('touchstart', () => {
    ui.touchControls.classList.remove('hidden');
  }, { passive: true });

  const jBase = ui.joystickBase;
  const jKnob = ui.joystickKnob;

  jBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joystickTouchId !== null) return;
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    const rect = jBase.getBoundingClientRect();
    joystickStartPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateJoystickPos(touch.clientX, touch.clientY);
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId) {
        updateJoystickPos(touch.clientX, touch.clientY);
        break;
      }
    }
  }, { passive: true });

  const endJoystick = (e) => {
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId) {
        joystickTouchId = null;
        touchVector = { x: 0, y: 0 };
        jKnob.style.transform = `translate(0px, 0px)`;
        break;
      }
    }
  };

  window.addEventListener('touchend', endJoystick, { passive: true });
  window.addEventListener('touchcancel', endJoystick, { passive: true });

  function updateJoystickPos(clientX, clientY) {
    const dxReal = clientX - joystickStartPos.x;
    const dyReal = clientY - joystickStartPos.y;
    const dist = Math.hypot(dxReal, dyReal);
    const maxR = 40;
    const clampedR = Math.min(dist, maxR);
    const angle = Math.atan2(dyReal, dxReal);
    const kx = Math.cos(angle) * clampedR;
    const ky = Math.sin(angle) * clampedR;
    jKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    touchVector = { x: kx / maxR, y: ky / maxR };
  }

  ui.touchDashBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (state === 'playing' && player.dashCd <= 0) {
      player.dashT = 0.14; player.dashCd = 2.2; player.iframe = Math.max(player.iframe, 0.22);
      player.dodgeT = 0.4;
      AudioSys.SFX.dash();
    }
  }, { passive: false });
}
initTouchControls();

window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  if ((e.key === 'Escape' || e.key.toLowerCase() === 'p') && (state === 'playing' || state === 'paused')) togglePause();
  if (e.key.toLowerCase() === 'm') { AudioSys.init(); const m = AudioSys.toggleMute(); showFloatingShard(m ? 'MUTED' : 'SOUND ON'); }
  if (e.key.toLowerCase() === 'n') { minimapVisible = !minimapVisible; showFloatingShard(minimapVisible ? 'MINIMAP ON' : 'MINIMAP OFF'); }
  if (e.key === 'F3') { e.preventDefault(); const _dbg = (typeof debugOverlay !== 'undefined') ? debugOverlay : window.__debugOverlay; if (_dbg) { _dbg.toggle(); showFloatingShard(_dbg.visible ? 'DEBUG ON' : 'DEBUG OFF'); } }
  // Non-blocking dock hotkeys: 1-4 picks the card while the run keeps going.
  if (levelupOpen && state === 'playing' && e.key >= '1' && e.key <= '4') {
    const c = levelupChoices[parseInt(e.key, 10) - 1];
    if (c) (c.pact ? applyPactChoice(c) : c.chest ? applyChestChoice(c) : applyLevelUpChoice(c));
  }
  if (state === 'menu' && e.key === 'Enter') startGame();
  // Ship customization hotkeys
  if (e.key === '[') { cycleShipPalette(false); showFloatingShard(`SHIP: ${shipPalette.name}`); }
  if (e.key === ']') { cycleShipPalette(true); showFloatingShard(`SHIP: ${shipPalette.name}`); }
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// ---------------- Shapes registry ----------------
const SHAPES = {
  dot: [], tri: [], quad: [], penta: [], boss1: [], boss2: [], boss3: [],
  sniper: [], healer: [], bomber: [], swarm: [], lurker: [],
  weaver: [], bulwark: [], necro: [], mirage: [], leech: [], carrier: [],
  splitter: [], phantom: [],
  player: [], heart: [], star: [], diamond: []
};
function pt(x, y, c) { return { x, y, c }; }
function polyPoints(cx, cy, r, n, rot) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + i / n * TAU;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}
function fillShape(cx, cy, r, n, rot, c, pts) {
  polyPoints(cx, cy, r, n, rot).forEach(p => pts.push(pt(p.x, p.y, c)));
}
function linePoints(cx, cy, x2, y2, c, pts) {
  pts.push(pt(cx, cy, c), pt(x2, y2, c));
}

// ---------------- Fake-3D shading (low cost) ----------------
// Single directional key light from up-left. Each drawn vertex is tinted toward
// light (faces pointing up/left) or toward shadow (down/right) so hulls read as
// beveled volumetric chunks instead of flat sprites. Colors are pre-shaded at
// init into a lookup ramp — the per-frame path only does an index lookup.
const LIGHT_X = -0.62, LIGHT_Y = -0.79; // normalized up-left key light
function hexToRgb(c) {
  const h = c.replace('#', '');
  const v = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  const n = parseInt(v, 16);
  return (isNaN(n) ? 0xffffff : n);
}
function shadeColor(c, f) {
  // f in [-1,1]: + = toward light (brighten), - = toward shadow (darken)
  const n = hexToRgb(c);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { const d = 1 + f; r *= d; g *= d; b *= d; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
// Per-shape normalised radius so the light term is resolution-independent.
function applyShapeShading(shapeArr, radius) {
  if (!shapeArr || !shapeArr.length) return shapeArr;
  for (let i = 0; i < shapeArr.length; i++) {
    const p = shapeArr[i];
    if (typeof p.c !== 'string' || p.c[0] !== '#') { p.litC = p.c; continue; }
    // Normalized position within the shape's bounding circle
    const nx = p.x / (radius || 1), ny = p.y / (radius || 1);
    let dot = nx * LIGHT_X + ny * LIGHT_Y;      // -1..1 facing light?
    dot = Math.max(-1, Math.min(1, dot));
    const amt = 0.42 * dot;                      // bevel strength
    p.litC = shadeColor(p.c, amt);
  }
  return shapeArr;
}
function buildShapes() {
  // player: sleek forward-swept interceptor — bright nose, cyan wings, hot engine core
  fillShape(14, 0, 5, 3, 0, '#bff', SHAPES.player);          // sharp nose tip (near-white for focus)
  fillShape(2, 0, 6, 3, 0, '#4ff', SHAPES.player);            // main fuselage delta
  fillShape(-7, -8, 5, 3, Math.PI, '#08f', SHAPES.player);    // swept port wing
  fillShape(-7, 8, 5, 3, Math.PI, '#08f', SHAPES.player);     // swept starboard wing
  fillShape(-5, 0, 3, 4, 0, '#ff8', SHAPES.player);           // engine glow core
  linePoints(-9, 0, -16 - Math.random() * 5, 0, '#0af', SHAPES.player); // exhaust trail
  // enemy shapes — designed for silhouette readability: each class reads distinct at scale
  // dot (chaser): simple round mote
  fillShape(0, 0, 7, 12, 0, '#4f8', SHAPES.dot);
  fillShape(0, 0, 4, 6, 0, '#8fb', SHAPES.dot);               // inner core for depth
  // tri (dasher): aggressive forward arrow, hot-orange
  fillShape(0, 0, 11, 3, 0, '#f94', SHAPES.tri);
  fillShape(3, 0, 5, 3, 0, '#fc7', SHAPES.tri);               // bright tip spike
  // quad (tank drone): hollow square shell, violet
  fillShape(0, 0, 14, 4, 0, '#c6f', SHAPES.quad);
  fillShape(0, 0, 14, 4, Math.PI / 4, '#a4d', SHAPES.quad);   // rotated inner square → 8-pt plate
  // penta (heavy): armored pentagon, hot pink + bright core
  fillShape(0, 0, 17, 5, 0, '#f4c', SHAPES.penta);
  fillShape(0, 0, 9, 5, Math.PI / 5, '#f7d', SHAPES.penta);   // rotated inner plate
  fillShape(0, 0, 4, 5, 0, '#fdf', SHAPES.penta);             // white-hot core
  fillShape(0, 0, 40, 6, 0, '#f33', SHAPES.boss1);
  fillShape(0, 0, 34, 6, 0, '#f88', SHAPES.boss1);
  fillShape(0, 0, 46, 8, 0, '#ff3', SHAPES.boss2);
  fillShape(0, 0, 40, 8, Math.PI / 8, '#f66', SHAPES.boss2);
  fillShape(0, 0, 52, 10, 0, '#f0f', SHAPES.boss3);
  fillShape(0, 0, 46, 10, Math.PI / 10, '#60f', SHAPES.boss3);
  // new enemy shapes
  fillShape(0, 0, 9, 6, 0, '#6df', SHAPES.sniper);
  fillShape(0, 0, 5, 3, 0, '#fff', SHAPES.sniper);
  fillShape(0, 0, 11, 4, 0, '#6f6', SHAPES.healer);
  fillShape(0, 0, 11, 4, Math.PI / 4, '#4c4', SHAPES.healer);
  fillShape(0, 0, 12, 8, 0, '#fa2', SHAPES.bomber);
  fillShape(0, 0, 8, 8, Math.PI / 8, '#f80', SHAPES.bomber);
  // swarm: tiny hexagonal nanite shape (red-hued so it reads as an enemy, not an XP gem)
  fillShape(0, 0, 4, 6, 0, '#f66', SHAPES.swarm);
  fillShape(0, 0, 2, 3, 0, '#f33', SHAPES.swarm);
  // lurker: angular void maw (dark violet twin spikes)
  fillShape(0, 0, 12, 3, 0, '#a4f', SHAPES.lurker);
  fillShape(0, 0, 8, 3, Math.PI, '#60a', SHAPES.lurker);
  // weaver: neon-teal star-spinner (five-point pentagram + core)
  fillShape(0, 0, 10, 5, 0, '#6fd', SHAPES.weaver);
  fillShape(0, 0, 6, 5, Math.PI / 5, '#4ac', SHAPES.weaver);
  fillShape(0, 0, 2.5, 4, 0, '#eff', SHAPES.weaver);
  // bulwark: hexagonal shield-shell tank (bright violet rim)
  fillShape(0, 0, 18, 6, 0, '#86e', SHAPES.bulwark);
  fillShape(0, 0, 12, 6, Math.PI / 6, '#c6f', SHAPES.bulwark);
  // necro: grave vortex (jade diamond ring + core)
  fillShape(0, 0, 13, 4, 0, '#5d8', SHAPES.necro);
  fillShape(0, 0, 7, 4, Math.PI / 4, '#3f6', SHAPES.necro);
  fillShape(0, 0, 3, 3, 0, '#dfe', SHAPES.necro);
  // mirage: fractured magenta phase-shard (twin offset diamonds)
  fillShape(0, 0, 10, 4, 0, '#f0f', SHAPES.mirage);
  fillShape(-4, -2, 6, 4, Math.PI / 4, '#f6f', SHAPES.mirage);
  // leech: acid-green blood tick (small hooked barb)
  fillShape(0, 0, 5, 3, 0, '#6f6', SHAPES.leech);
  fillShape(2, 0, 2, 4, 0, '#afa', SHAPES.leech);
  // carrier: lumbering amber brood-shell (armored hex + inner bile)
  fillShape(0, 0, 19, 8, 0, '#fb4', SHAPES.carrier);
  fillShape(0, 0, 12, 4, Math.PI / 4, '#c72', SHAPES.carrier);
  fillShape(0, 0, 5, 3, 0, '#fe8', SHAPES.carrier);
  // pickups
  fillShape(0, 0, 5, 4, 0, '#4ff', SHAPES.diamond);
  const h = SHAPES.heart;
  [[0,-3],[3,-6],[6,-3],[6,0],[3,3],[0,6],[-3,3],[-6,0],[-6,-3],[-3,-6]].forEach(p => h.push(pt(p[0]*1.1, p[1]*1.1, '#f44')));
  fillShape(0, 0, 8, 5, 0, '#ff4', SHAPES.star);
  fillShape(0, 0, 4, 5, 0, '#fa0', SHAPES.star);
}
buildShapes();

// ---------------- Game state ----------------
let state = 'menu'; // menu | playing | paused | gameover | victory  (level-up is now non-blocking: see levelupOpen flag)
let time = 0, lastTs = 0;
// WS-6: siphon tendril + absorb-rate state (gem vacuum juice)
let _surgeCount = 0, _gemAbsorbRate = 0, _gemAbsorbCount = 0, _absorbedThisSec = 0;
let timeScale = 1, hitStop = 0;
let camX = 0, camY = 0, shake = 0;
let kills = 0, gemsCollected = 0;
let pendingLevels = 0;
let levelupOpen = false;   // non-blocking level-up UI live (game keeps running)
let levelupChoices = [];   // current dock options (for auto-pick)
let levelupTimer = 0;      // seconds until auto-pick fires
let frameCount = 0;
let runSeed = 0; // for per-run variance in cosmetic effects
let combo = 0;
let comboTimer = 0;
let comboBest = 0;
let killMilestone = 0; // 100, 250, 500, 1000...
const KILL_MILESTONES = [100, 250, 500, 1000, 2000, 5000];
// Combo-tiers referenced in registerKill (previously referenced but undeclared —
// the ReferenceError was being swallowed by the frame-loop try/catch). Declared
// here so combo juice + WS-E milestone feed work in live play.
const COMBO_TIERS = [10, 25, 50, 100, 250, 500];
// ---------------- WS-4: Neon Fever Mode ----------------
// Crossing a fever kill-streak threshold triggers a 5s fever: +50% attack
// speed, 2x XP gems, a rainbow screen bloom (#fever-overlay on #game-container),
// and a screen-clearing 300px shockwave detonation on exit. Overlay class is
// toggled ONLY on state enter/exit — zero per-frame DOM writes.
const FEVER_THRESHOLDS = [100, 250, 500];
const FEVER_DURATION = 5.0;
const FEVER_CD_MUL = 0.5;      // attack cooldowns halved → +50% attack speed
const FEVER_XP_MUL = 2;        // XP gem drop multiplier
let feverMode = false;
let feverTimer = 0;            // seconds remaining in the current fever
let feverApplied = false;      // track cdMul state to prevent compounding
const feverHit = { 100: false, 250: false, 500: false }; // once-per-run per threshold
let _feverOverlayEl = null;    // cached #game-container node
let bossIntro = { active: false, t: 0, name: '', subtext: '' };

// ---------------- Seeded RNG & Daily Modifier System ----------------
let rngState = (Date.now() >>> 0) || 1;
let isSeededRun = false;
let currentRunSeedStr = '';
let currentRunSeedInt = 0;
let runMode = 'daily'; // 'daily' | 'custom' | 'standard'

function srand() {
  // mulberry32
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function seedRng(seed) {
  rngState = (seed >>> 0) || 1;
}

const rng = () => isSeededRun ? srand() : Math.random();
const rand = (a, b) => a + rng() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(rng() * arr.length)];

function hashSeedStr(str) {
  const s = String(str || '').trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0) || 1337;
}

function getDailyDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MUTATIONS = [
  {
    id: 'glass',
    name: 'Glass Cannon',
    icon: '⚡',
    desc: '+100% weapon damage, -50% max HP',
    badgeColor: '#ff4466',
    apply: () => { player.weaponDamageMul *= 2.0; player.maxHpMul *= 0.5; }
  },
  {
    id: 'magnet',
    name: 'Magnet Chaos',
    icon: '🧲',
    desc: '+300% pickup range',
    badgeColor: '#44ffff',
    apply: () => { player.magnetMul *= 4.0; }
  },
  {
    id: 'swarm',
    name: 'Hyper Swarm',
    icon: '🦂',
    desc: '+30% enemy speed, +50% XP drops',
    badgeColor: '#ffaa22',
    apply: () => { player.enemySpeedMul *= 1.3; player.xpBonus += 0.5; }
  },
  {
    id: 'chrono',
    name: 'Chrono Shift',
    icon: '⏱',
    desc: '+25% move speed, -20% weapon cooldowns',
    badgeColor: '#aa66ff',
    apply: () => { player.speedMul *= 1.25; player.cdMul *= 0.8; }
  },
  {
    id: 'titan',
    name: 'Titan Protocol',
    icon: '🛡',
    desc: '+100% max HP, +30% enemy HP',
    badgeColor: '#44ff88',
    apply: () => { player.maxHpMul *= 2.0; player.enemyHpMul *= 1.3; }
  },
  {
    id: 'vampire',
    name: 'Vampire Curse',
    icon: '🩸',
    desc: 'No passive regen, +2 HP restored on every kill',
    badgeColor: '#ff2244',
    apply: () => { player.regen = 0; player.vampirism = true; }
  },
  {
    id: 'overcharge',
    name: 'Overcharge',
    icon: '🔋',
    desc: '+50% weapon damage, +15% cooldowns',
    badgeColor: '#ffff44',
    apply: () => { player.weaponDamageMul *= 1.5; player.cdMul *= 1.15; }
  },
  {
    id: 'void',
    name: 'Void Rift',
    icon: '🌀',
    desc: '+30% enemy damage, +100% Star Shards earned',
    badgeColor: '#cc44ff',
    apply: () => { player.enemyDamageMul *= 1.3; player.shardMul *= 2.0; }
  }
];

let activeMutations = [];

// ---------------- Codex / Bestiary ----------------
// Player-collected knowledge across all runs. Persists in localStorage.
let codex = safeLoad('neonSurvivorsCodex', { encountered: {}, unlockedWeapons: {}, lifetimeWeaponDamage: {} });
if (!codex.lifetimeWeaponDamage) codex.lifetimeWeaponDamage = {};
function saveCodex() {
  safeSave('neonSurvivorsCodex', codex);
}
// Best-effort save when the tab is closed mid-run — covers any writes that happened
// since the last periodic save
window.addEventListener('beforeunload', () => {
  saveCodex();
  saveRunHistory();
  safeSave('neonSurvivorsBest', best);
  safeSave('neonSurvivorsMeta', meta);
  safeSave('neonSurvivorsSettings', settings);
  saveRunSave(); // mid-run snapshot (no-op unless playing)
});

// ---------------- Damage-dealt breakdown per weapon (current run + lifetime) ----------------
let weaponDamageStats = {}; // weaponId -> { damage, kills }
function resetWeaponDamageStats() { weaponDamageStats = {}; }

// WS-E: per-weapon kill "heat" — kills in the last 10s / 10, clamped 0..1.
// Kill history lives in a module-level fixed 64-slot ring of { t, id } — no
// push/splice, no per-frame allocation. Weapons read their own heat each tick.
const HEAT_RING_SIZE = 64;
const HEAT_WINDOW = 10;      // seconds
const HEAT_FULL = 10;        // kills in window that saturate heat
const killRing = new Array(HEAT_RING_SIZE);
for (let i = 0; i < HEAT_RING_SIZE; i++) killRing[i] = { t: -999, id: '' };
let killRingIdx = 0;
function recordWeaponHeatKill(weaponId) {
  const slot = killRing[killRingIdx];
  slot.t = time; slot.id = weaponId;
  killRingIdx = (killRingIdx + 1) & (HEAT_RING_SIZE - 1);
}
function weaponHeat(weaponId) {
  let n = 0;
  const cutoff = time - HEAT_WINDOW;
  for (let i = 0; i < HEAT_RING_SIZE; i++) {
    const s = killRing[i];
    if (s.id === weaponId && s.t >= cutoff) n++;
  }
  return clamp(n / HEAT_FULL, 0, 1);
}
function topKillWeaponId() {
  let bestId = null, bestKills = -1;
  for (const id in weaponDamageStats) {
    const k = weaponDamageStats[id].kills;
    if (k > bestKills) { bestKills = k; bestId = id; }
  }
  return bestId;
}

// WS-E chest smart-feed: +1 level to the highest-kill owned weapon still below
// L5 (kill ties → owned-first). Returns the fed weapon, or null when every owned
// weapon is already maxed (caller falls back to shards / evolve behavior).
function smartChestFeed() {
  const bestId = topKillWeaponId();
  let target = null;
  for (const w of player.weapons) {
    if (w.level >= 5) continue;
    if (w.id === bestId) { target = w; break; }
    if (!target) target = w; // fallback: first growable weapon if scores only on unowned
  }
  if (!target) return null; // all L5 — caller does evolve/shard fallback
  const def = WEAPON_DEFS[target.id];
  addWeapon(target.id);
  showFloatingShard(`BOOSTED: ${def.name.toUpperCase()}`);
  addFloatText(player.x, player.y - 40, `BOOST: ${def.name} L${target.level}`, '#fa4', true);
  if (AudioSys.SFX.chest) AudioSys.SFX.chest();
  return target;
}

function trackWeaponDamage(weaponId, amount, isKill) {
  if (!weaponDamageStats[weaponId]) weaponDamageStats[weaponId] = { damage: 0, kills: 0 };
  weaponDamageStats[weaponId].damage += amount;
  if (isKill) { weaponDamageStats[weaponId].kills++; recordWeaponHeatKill(weaponId); }
  // Lifetime persistence (across runs) — write deferred to reduce localStorage hits
  if (!codex.lifetimeWeaponDamage[weaponId]) codex.lifetimeWeaponDamage[weaponId] = { damage: 0, kills: 0 };
  codex.lifetimeWeaponDamage[weaponId].damage += amount;
  if (isKill) {
    codex.lifetimeWeaponDamage[weaponId].kills++;
    // periodic flush — every 25 lifetime kills saves the running total
    if (codex.lifetimeWeaponDamage[weaponId].kills % 25 === 0) saveCodex();
    forgeProgress(weaponId);
  }
}

// ---------------- AUTO-FORGE (W3): kill-driven free weapon auto-levels ----------------
// Every kill attributed to a weapon feeds a shared forge meter. When it fills, the
// lowest-level owned weapon (<L5) is upgraded for free and an overcharge burst
// detonates at the killing blow. This makes sustained killing level your build
// hands-free, on top of (never replacing) the level-up card dock.
function forgeThreshold() { return Math.max(14, 26 - (player.forgeRank || 0) * 3); }
function forgeProgress(sourceWeaponId) {
  if (player.forgeKills < 0 || player.forgeRank <= 0) return; // locked until card picked
  player.forgeKills++;
  const need = forgeThreshold();
  if (player.forgeKills >= need) {
    // upgrade the lowest-level owned weapon that can still grow
    let target = null;
    for (const w of player.weapons) if (w.level < 5 && (!target || w.level < target.level)) target = w;
    if (target) {
      player.forgeKills = 0;
      const def = WEAPON_DEFS[target.id];
      addWeapon(target.id);
      if (typeof achievementsData !== 'undefined') {
        achievementsData.stats.forgeProcs++;
        saveAchievements();
        checkAchievements();
      }
      showFloatingShard(`⚙ AUTO-FORGE: ${def.name.toUpperCase()} → L${target.level}`);
      addFloatText(player.x, player.y - 46, `⚙ ${def.name} L${target.level}!`, '#fa4', true);
      if (AudioSys.SFX.milestone) AudioSys.SFX.milestone();
      shake = Math.max(shake, 7);
      hitStop = Math.max(hitStop, 0.08);
      // overcharge burst: radial shockwave + spark fan, scales with forge rank
      const burstR = 130 + (player.forgeRank - 1) * 35;
      pushShockwave({ x: player.x, y: player.y, r: 10, maxR: burstR, speed: 1050, damage: 30 + target.level * 10, knock: true, color: '#fa4' });
      for (let i = 0; i < 16; i++) pushParticle({ type: 'shard', x: player.x, y: player.y, vx: rand(-300, 300), vy: rand(-300, 300), life: 0.4, maxLife: 0.4, color: pick(['#fa4', '#ff4', '#fff']), size: rand(2, 4) });
    } else {
      // all weapons maxed — bank the charge as a burst of bonus XP instead
      player.forgeKills = 0;
      player.xp += 10;
      addFloatText(player.x, player.y - 46, '⚙ FORGE FULL: +10 XP', '#fa4');
    }
  }
}
function getLifetimeWeaponDamageBreakdown() {
  const out = [];
  let total = 0;
  for (const id in codex.lifetimeWeaponDamage) total += codex.lifetimeWeaponDamage[id].damage;
  for (const id in codex.lifetimeWeaponDamage) {
    const def = (typeof WEAPON_DEFS !== 'undefined' && WEAPON_DEFS[id]) ? WEAPON_DEFS[id] : { name: id, icon: '•' };
    const entry = codex.lifetimeWeaponDamage[id];
    out.push({
      id, name: def.name, icon: def.icon,
      damage: entry.damage, kills: entry.kills,
      share: total > 0 ? (entry.damage / total) : 0,
    });
  }
  out.sort((a, b) => b.damage - a.damage);
  return { entries: out, total };
}
function getWeaponDamageBreakdown() {
  // returns [{ id, name, damage, kills, percentOfTotal }] sorted by damage desc
  let total = 0;
  for (const k in weaponDamageStats) total += weaponDamageStats[k].damage;
  const out = [];
  for (const id in weaponDamageStats) {
    const def = (typeof WEAPON_DEFS !== 'undefined' && WEAPON_DEFS[id]) ? WEAPON_DEFS[id] : { name: id, icon: '•' };
    out.push({
      id, name: def.name, icon: def.icon,
      damage: weaponDamageStats[id].damage,
      kills: weaponDamageStats[id].kills,
      share: total > 0 ? (weaponDamageStats[id].damage / total) : 0,
    });
  }
  out.sort((a, b) => b.damage - a.damage);
  return { entries: out, total };
}
function recordEncounter(type) {
  if (!codex.encountered[type]) {
    codex.encountered[type] = { kills: 0, firstSeen: Date.now() };
    saveCodex();
  }
}
function recordWeaponUnlock(id) {
  if (!codex.unlockedWeapons[id]) {
    codex.unlockedWeapons[id] = true;
    saveCodex();
  }
}

const CODEX = {
  enemies: [
    { id: 'dot',    name: 'GLYPH',        icon: '●', color: '#4f8', tip: 'The basic seeker. Weak alone, deadly in swarms.' },
    { id: 'tri',    name: 'DART',         icon: '▲', color: '#f94', tip: 'Quick dasher. Telegraph its charge and sidestep.' },
    { id: 'quad',   name: 'WARDEN',       icon: '◆', color: '#c6f', tip: 'Slow and sturdy. Use piercing weapons to cut through.' },
    { id: 'penta',  name: 'SPAWNER',      icon: '⬟', color: '#f4c', tip: 'Splits into Darts on death. Clear the fragments!' },
    { id: 'sniper', name: 'LOCKPOINT',    icon: '◈', color: '#6df', tip: 'Holds range and aims telegraphed shots. Dodge perpendicular.' },
    { id: 'healer', name: 'MENDICANT',    icon: '✚', color: '#6f6', tip: 'Aura heals nearby allies. Priority target!' },
    { id: 'bomber', name: 'VOLATILE',     icon: '⊗', color: '#fa2', tip: 'Charges and detonates. Kill at a distance or dash away.' },
    { id: 'swarm',  name: 'NANITE',       icon: '·', color: '#f66', tip: 'Fragile but relentless. Spawns in dense bursts. Use area weapons.' },
    { id: 'lurker', name: 'VOID MAW',     icon: '◣', color: '#a4f', tip: 'Submerges and ambushes. Untargetable while burrowed — punish the breach telegraph.' },
    { id: 'weaver', name: 'SPINSTRESS',   icon: '✳', color: '#6fd', tip: 'Kites at range and spins slowing webs. Her trail is a trap — never chase in a straight line.' },
    { id: 'splitter', name: 'FISSION CELL', icon: '⬢', color: '#fa7', tip: 'Divides into 2 smaller copies on death, twice. Focus-fire or wipe the whole family with AoE before it buds.' },
    { id: 'phantom', name: 'PHASE WRAITH', icon: '◇', color: '#d6f', tip: 'Blinks to your flank every few seconds, untargetable mid-blink. Hold fire for the reappear flash.' },
    { id: 'bulwark', name: 'AEGIS WALL',  icon: '⬡', color: '#86e', tip: 'Frontal shield absorbs most damage. Flank it or use piercing/shockwave attacks.' },
    { id: 'necro',  name: 'GRAVE CALLER', icon: '⚿', color: '#5d8', tip: 'Channels to resurrect fallen allies. Silence it first or the fight snowballs.' },
    { id: 'boss1',  name: 'WARDEN MK.I',  icon: '⬢', color: '#f33', tip: 'First elite. Learns charging attacks. Keep moving.' },
    { id: 'boss2',  name: 'WARDEN MK.II', icon: '⬣', color: '#f66', tip: 'Bigger, meaner. Watch for chained dashes.' },
    { id: 'boss3',  name: 'THE ARCHITECT',icon: '⬤', color: '#f0f', tip: 'Final guardian. Bring max-level weapons or perish.' },
  ],
};

function selectMutatorsForSeed(seedInt) {
  let tempState = (seedInt >>> 0) || 1;
  const tempSrand = () => {
    tempState |= 0; tempState = (tempState + 0x6D2B79F5) | 0;
    let t = Math.imul(tempState ^ (tempState >>> 15), 1 | tempState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const pool = [...MUTATIONS];
  const idx1 = Math.floor(tempSrand() * pool.length);
  const m1 = pool.splice(idx1, 1)[0];
  const idx2 = Math.floor(tempSrand() * pool.length);
  const m2 = pool[idx2];
  return [m1, m2];
}

function renderDailyModifierUI() {
  if (!ui.dailyDateVal) return;
  const dateStr = getDailyDateString();
  ui.dailyDateVal.textContent = dateStr;

  if (runMode === 'daily') {
    ui.dailyTag.textContent = '📅 DAILY MODIFIER';
    currentRunSeedStr = dateStr;
    currentRunSeedInt = hashSeedStr(dateStr);
    activeMutations = selectMutatorsForSeed(currentRunSeedInt);
    if (ui.customSeedWrap) ui.customSeedWrap.classList.add('hidden');
  } else if (runMode === 'custom') {
    ui.dailyTag.textContent = '🎲 CUSTOM SEEDED RUN';
    const customVal = (ui.customSeedInput ? ui.customSeedInput.value.trim() : '') || 'NEON2026';
    currentRunSeedStr = customVal;
    currentRunSeedInt = hashSeedStr(customVal);
    activeMutations = selectMutatorsForSeed(currentRunSeedInt);
    if (ui.customSeedWrap) ui.customSeedWrap.classList.remove('hidden');
  } else {
    ui.dailyTag.textContent = '⚔ STANDARD RUN';
    currentRunSeedStr = 'STANDARD';
    currentRunSeedInt = 0;
    activeMutations = [];
    if (ui.customSeedWrap) ui.customSeedWrap.classList.add('hidden');
  }

  if (ui.modeDailyBtn) ui.modeDailyBtn.classList.toggle('active', runMode === 'daily');
  if (ui.modeCustomBtn) ui.modeCustomBtn.classList.toggle('active', runMode === 'custom');
  if (ui.modeStandardBtn) ui.modeStandardBtn.classList.toggle('active', runMode === 'standard');

  if (ui.dailyMutatorsContainer) {
    ui.dailyMutatorsContainer.innerHTML = '';
    if (activeMutations.length === 0) {
      const el = document.createElement('div');
      el.className = 'mutator-item';
      el.style.borderLeftColor = '#888';
      el.innerHTML = `
        <div class="mutator-icon">⚔</div>
        <div class="mutator-info">
          <div class="mutator-name" style="color:#aaa;">STANDARD ARENA</div>
          <div class="mutator-desc">Standard survival rules. No active mutations.</div>
        </div>
      `;
      ui.dailyMutatorsContainer.appendChild(el);
    } else {
      for (const m of activeMutations) {
        const el = document.createElement('div');
        el.className = 'mutator-item';
        el.style.borderLeftColor = m.badgeColor || '#4ff';
        el.innerHTML = `
          <div class="mutator-icon">${m.icon}</div>
          <div class="mutator-info">
            <div class="mutator-name" style="color:${m.badgeColor || '#4ff'}">${m.name}</div>
            <div class="mutator-desc">${m.desc}</div>
          </div>
        `;
        ui.dailyMutatorsContainer.appendChild(el);
      }
    }
  }
}

function initDailyModifierControls() {
  if (!ui.modeDailyBtn) return;
  ui.modeDailyBtn.onclick = () => { runMode = 'daily'; renderDailyModifierUI(); };
  ui.modeCustomBtn.onclick = () => { runMode = 'custom'; renderDailyModifierUI(); };
  ui.modeStandardBtn.onclick = () => { runMode = 'standard'; renderDailyModifierUI(); };
  if (ui.customSeedInput) ui.customSeedInput.oninput = () => { if (runMode === 'custom') renderDailyModifierUI(); };
  renderDailyModifierUI();
}

function updateHUDModifierBadge() {
  if (!ui.hudModifierBadge) return;
  if (runMode !== 'standard' && activeMutations.length > 0) {
    ui.hudModifierBadge.classList.remove('hidden');
    ui.hudModifierIcon.textContent = activeMutations.map(m => m.icon).join(' ');
    ui.hudModifierText.textContent = activeMutations.map(m => m.name).join(' + ');
    ui.hudModifierSeed.textContent = '#' + currentRunSeedStr;
  } else {
    ui.hudModifierBadge.classList.add('hidden');
  }
}

// ---------------- Player ----------------
const player = {
  x: 0, y: 0, vx: 0, vy: 0, r: 14, ang: 0,
  hp: 100, maxHp: 100, speed: 200, level: 1, xp: 0, xpNeed: 5,
  magnet: 60, armor: 0, regen: 0, xpBonus: 0, cdMul: 1,
  contactCd: 0, iframe: 0, weapons: [], dashCd: 0, dashT: 0,
  luck: 0,
  weaponDamageMul: 1, enemyDamageMul: 1, enemyHpMul: 1, enemySpeedMul: 1,
  enemySpawnMul: 1, magnetMul: 1, speedMul: 1, maxHpMul: 1,
  vampirism: false, shardMul: 1,
  critChance: 0.05, critMul: 1.5, enemyRegenMul: 0,
  magnetSurge: 0, autoForge: 0, _forgeClock: 0,
  dodgeT: 0,
};
function resetPlayer() {
  const hpBonus = (meta.hpRank || 0) * 10;
  const speedBonus = 1 + (meta.speedRank || 0) * 0.05;
  Object.assign(player, {
    x: 0, y: 0, vx: 0, vy: 0, hp: 100 + hpBonus, maxHp: 100 + hpBonus, speed: 200 * speedBonus,
    level: 1, xp: 0, xpNeed: 5, magnet: 60, armor: 0, regen: 0,
    xpBonus: 0, cdMul: 1, contactCd: 0, iframe: 0, weapons: [], dashCd: 0, dashT: 0,
    luck: 0,
    weaponDamageMul: 1, enemyDamageMul: 1, enemyHpMul: 1, enemySpeedMul: 1,
    enemySpawnMul: 1, magnetMul: 1, speedMul: 1, maxHpMul: 1,
    vampirism: false, shardMul: 1,
    critChance: 0.05, critMul: 1.5, enemyRegenMul: 0,
    shield: null,
    forgeKills: 0, // AUTO-FORGE progress toward next free weapon level (-1 = locked)
    forgeRank: 0,  // AUTO-FORGE card picks — reduces kills-to-level and boosts burst
    dodgeT: 0,     // WS-1 precision-dodge cooldown
    pacts: [],          // WS-5 active Void Pacts taken this run (run-scoped; reset each run)
    pactLifesteal: 0,   // WS-5 Soul Tithe: instant heal fraction of damage dealt
    pactDashLockT: 0,   // WS-5 Adrenaline Void: >0 disables dash while active
  });
}
function applyMutations() {
  if (runMode === 'standard' || activeMutations.length === 0) return;
  for (const m of activeMutations) {
    m.apply();
  }
  const baseHp = player.maxHp;
  player.maxHp = Math.round(baseHp * player.maxHpMul);
  player.hp = player.maxHp;
  player.speed = Math.round(player.speed * player.speedMul);
  player.magnet = Math.round(player.magnet * player.magnetMul);
}

// ---------------- High-Performance Object Pools ----------------
// Pre-allocated object pools for Particles, Floating Texts, Shockwaves, and Projectiles
// Eliminates Garbage Collection allocations during gameplay.

const enemies = [], projectiles = [], gems = [], particles = [], shockwaves = [], floatTexts = [], hazards = [];
const MAX_ENEMIES = 400, MAX_GEMS = 900, MAX_HITBOX_R = 60;
const CORPSE_WINDOW = 5.0; // seconds a kill leaves a corpse while a Grave Caller is active
const MAX_PARTICLES_CAP = 500, MAX_PROJECTILES_CAP = 300;
const MAX_SHOCKWAVES_CAP = 100, MAX_FLOAT_TEXTS_CAP = 80;

const particlePool = [];
const projectilePool = [];
const shockwavePool = [];
const floatTextPool = [];

(function initPools() {
  for (let i = 0; i < MAX_PARTICLES_CAP; i++) {
    particlePool.push({ type: 'shard', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '', size: 0, w: 0, x2: 0, y2: 0 });
  }
  for (let i = 0; i < MAX_PROJECTILES_CAP; i++) {
    projectilePool.push({
      x: 0, y: 0, vx: 0, vy: 0, r: 0, damage: 0, pierce: 0, homing: false, homingT: 0,
      life: 0, color: '', hitSet: new Set(), hostile: false, isClusterChild: false,
      chainOnHit: null, clusterSplit: null, isQuantumBolt: false, isSplitChild: false,
      isMegalodonBlade: false, startX: 0, startY: 0, ang: 0, dist: 0, maxDist: 0, speed: 0, returning: false
    });
  }
  for (let i = 0; i < MAX_SHOCKWAVES_CAP; i++) {
    shockwavePool.push({
      x: 0, y: 0, r: 0, maxR: 0, speed: 0, damage: 0, hitSet: new Set(),
      cosmetic: false, hostile: false, color: null, t: 0, nova: false, knock: false,
      delayed: 0, frostShatter: false, supernova: false
    });
  }
  for (let i = 0; i < MAX_FLOAT_TEXTS_CAP; i++) {
    floatTextPool.push({ x: 0, y: 0, text: '', color: '', life: 0, maxLife: 0, big: false });
  }
})();

function getParticle() {
  return particlePool.length > 0
    ? particlePool.pop()
    : { type: 'shard', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '', size: 0, w: 0, x2: 0, y2: 0 };
}

function releaseParticle(p) {
  if (!p) return;
  p.type = 'shard'; p.x = 0; p.y = 0; p.vx = 0; p.vy = 0;
  p.life = 0; p.maxLife = 0; p.color = ''; p.size = 0; p.w = 0; p.x2 = 0; p.y2 = 0;
  particlePool.push(p);
}

function pushParticle(cfg) {
  if (particles.length >= MAX_PARTICLES_CAP) {
    let idx = particles.findIndex(x => x.type === 'shard');
    if (idx < 0) idx = 0;
    const oldest = particles[idx];
    particles[idx] = particles[particles.length - 1];
    particles.pop();
    releaseParticle(oldest);
  }
  const p = getParticle();
  p.type = cfg.type || 'shard';
  p.x = cfg.x || 0;
  p.y = cfg.y || 0;
  p.vx = cfg.vx || 0;
  p.vy = cfg.vy || 0;
  p.life = cfg.life || 0.4;
  p.maxLife = cfg.maxLife || cfg.life || 0.4;
  p.color = cfg.color || '#fff';
  p.size = cfg.size || 2;
  p.w = cfg.w || 2;
  p.x2 = cfg.x2 || 0;
  p.y2 = cfg.y2 || 0;
  particles.push(p);
  return p;
}

function getProjectile() {
  if (projectilePool.length > 0) {
    const p = projectilePool.pop();
    if (!p.hitSet || typeof p.hitSet.clear !== 'function') p.hitSet = new Set();
    else p.hitSet.clear();
    return p;
  }
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: 0, damage: 0, pierce: 0, homing: false, homingT: 0,
    life: 0, color: '', hitSet: new Set(), hostile: false, isClusterChild: false,
    chainOnHit: null, clusterSplit: null, isQuantumBolt: false, isSplitChild: false,
    isMegalodonBlade: false, startX: 0, startY: 0, ang: 0, dist: 0, maxDist: 0, speed: 0, returning: false
  };
}

function releaseProjectile(p) {
  if (!p) return;
  // Pool hygiene: a projectile's hitSet may have been torn away by a foreign
  // code path. Re-initialize rather than assume, so recycling never throws.
  if (!p.hitSet || typeof p.hitSet.clear !== 'function') p.hitSet = new Set();
  else p.hitSet.clear();
  p.chainOnHit = null;
  p.clusterSplit = null;
  p.isClusterChild = false;
  p.isQuantumBolt = false;
  p.isSplitChild = false;
  p.isMegalodonBlade = false;
  p.hostile = false;
  p.homing = false;
  projectilePool.push(p);
}

function pushProjectile(cfg) {
  if (projectiles.length >= MAX_PROJECTILES_CAP) {
    const oldest = projectiles.shift();
    releaseProjectile(oldest);
  }
  const p = getProjectile();
  p.x = cfg.x || 0;
  p.y = cfg.y || 0;
  p.vx = cfg.vx || 0;
  p.vy = cfg.vy || 0;
  p.r = cfg.r || 4;
  p.damage = cfg.damage || 0;
  p.pierce = cfg.pierce || 0;
  p.homing = !!cfg.homing;
  p.homingT = cfg.homingT || 0;
  p.life = cfg.life || 1;
  p.color = cfg.color || '#fff';
  p.hostile = !!cfg.hostile;
  p.isClusterChild = !!cfg.isClusterChild;
  p.chainOnHit = cfg.chainOnHit || null;
  p.clusterSplit = cfg.clusterSplit || null;
  p.isQuantumBolt = !!cfg.isQuantumBolt;
  p.isSplitChild = !!cfg.isSplitChild;
  p.isMegalodonBlade = !!cfg.isMegalodonBlade;
  p.startX = cfg.startX || 0;
  p.startY = cfg.startY || 0;
  p.ang = cfg.ang || 0;
  p.dist = cfg.dist || 0;
  p.maxDist = cfg.maxDist || 0;
  p.speed = cfg.speed || 0;
  p.returning = !!cfg.returning;
  projectiles.push(p);
  return p;
}

function getShockwave() {
  if (shockwavePool.length > 0) {
    const s = shockwavePool.pop();
    if (!s.hitSet || typeof s.hitSet.clear !== 'function') s.hitSet = new Set();
    else s.hitSet.clear();
    return s;
  }
  return {
    x: 0, y: 0, r: 0, maxR: 0, speed: 0, damage: 0, hitSet: new Set(),
    cosmetic: false, hostile: false, color: null, t: 0, nova: false, knock: false,
    delayed: 0, frostShatter: false, supernova: false
  };
}

function releaseShockwave(s) {
  if (!s) return;
  if (!s.hitSet || typeof s.hitSet.clear !== 'function') s.hitSet = new Set();
  else s.hitSet.clear();
  s.cosmetic = false;
  s.hostile = false;
  s.color = null;
  s.nova = false;
  s.knock = false;
  s.delayed = 0;
  s.frostShatter = false;
  s.supernova = false;
  s.stun = 0;
  shockwavePool.push(s);
}

function pushShockwave(cfg) {
  if (shockwaves.length >= MAX_SHOCKWAVES_CAP) {
    const oldest = shockwaves.shift();
    releaseShockwave(oldest);
  }
  const s = getShockwave();
  s.x = cfg.x || 0;
  s.y = cfg.y || 0;
  s.r = cfg.r || 8;
  s.maxR = cfg.maxR || 100;
  s.speed = cfg.speed || 700;
  s.damage = cfg.damage || 0;
  s.cosmetic = !!cfg.cosmetic;
  s.hostile = !!cfg.hostile;
  s.color = cfg.color || null;
  s.t = cfg.t || 0;
  s.nova = !!cfg.nova;
  s.knock = !!cfg.knock;
  s.delayed = cfg.delayed || 0;
  s.frostShatter = !!cfg.frostShatter;
  s.supernova = !!cfg.supernova;
  s.stun = cfg.stun || 0;
  shockwaves.push(s);
  return s;
}

function getFloatText() {
  return floatTextPool.length > 0
    ? floatTextPool.pop()
    : { x: 0, y: 0, text: '', color: '', life: 0, maxLife: 0, big: false, anchor: null, __linkedEnemy: null };
}

function releaseFloatText(t) {
  if (!t) return;
  t.text = '';
  t.anchor = null;
  t.__linkedEnemy = null;
  floatTextPool.push(t);
}

window.PoolManager = {
  getParticle, releaseParticle, pushParticle,
  getProjectile, releaseProjectile, pushProjectile,
  getShockwave, releaseShockwave, pushShockwave,
  getFloatText, releaseFloatText, addFloatText: (x, y, text, color, big) => addFloatText(x, y, text, color, big),
  particlePool, projectilePool, shockwavePool, floatTextPool
};

// ---------------- Spatial Hash Grid ----------------
class SpatialHash {
  constructor(cellSize = 120) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }
  clear() {
    this.grid.clear();
  }
  key(cx, cy) {
    return `${cx},${cy}`;
  }
  insert(entity) {
    const cx = Math.floor(entity.x / this.cellSize);
    const cy = Math.floor(entity.y / this.cellSize);
    const k = this.key(cx, cy);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(entity);
  }
  query(x, y, radius) {
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    const results = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const k = this.key(cx, cy);
        const cell = this.grid.get(k);
        if (cell) {
          for (let i = 0; i < cell.length; i++) results.push(cell[i]);
        }
      }
    }
    return results;
  }
}
const enemyGrid = new SpatialHash(120);

// [WS-7] Squad AI helpers — formations, flank angles, shield-line queries.
// All neighbor lookups route through enemyGrid (broadphase) — no O(N²) loops.
let squadSeq = 0;
function angleWrap(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
// V-shaped charging wave: 8-12 members behind a leader, aimed at the player.
function spawnSquadFormation(type) {
  const n = randInt(8, 12);
  const d = Math.hypot(W, H) / 2 + 60;
  const baseAng = rand(0, TAU);
  const lx = player.x + Math.cos(baseAng) * d;
  const ly = player.y + Math.sin(baseAng) * d;
  const squadId = ++squadSeq;
  const spread = 0.62; // half-angle between the two V arms
  let spawned = 0;
  for (let i = 0; i < n; i++) {
    const k = Math.ceil(i / 2);
    const side = i % 2 === 1 ? 1 : -1;
    const a = baseAng + Math.PI + side * spread; // arms point back away from player
    const px = lx + Math.cos(a) * k * 24;
    const py = ly + Math.sin(a) * k * 24;
    const e = spawnEnemy(type, px, py);
    if (!e) break;
    e.squadId = squadId;
    e.squadRole = i === 0 ? 'leader' : 'wing';
    e.squadIdx = k;
    e.squadSide = i === 0 ? 0 : side;
    spawned++;
  }
  return spawned;
}
// Phantom flank waypoint: 120° behind the player's heading, biased to the
// side of least resistance (fewer nearby allies → freer approach lane).
function computeFlankPoint(e, radius) {
  const heading = player.ang || 0;
  const base = heading + Math.PI * (2 / 3); // 120° off the rear
  const side = e.squadSide || (e.squadSide = pick([-1, 1]));
  const r = radius || 250;
  return { x: player.x + Math.cos(base) * r * side, y: player.y + Math.sin(base) * r * side, side };
}
// Bulwark escort: nearest healer/sniper within guard range via broadphase.
function findShieldAnchor(e) {
  const near = enemyGrid.query(e.x, e.y, 280);
  let best = null, bestD2 = 280 * 280;
  for (const o of near) {
    if (o === e || o.spawnT > 0 || o.hp <= 0 || o.deadT) continue;
    if (o.type !== 'healer' && o.type !== 'sniper') continue;
    const dx = o.x - e.x, dy = o.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = o; }
  }
  return best;
}

// ---------------- Run History (last N runs) ----------------
let runHistory = [];
try {
  const rawRH = localStorage.getItem('neonSurvivorsRunHistory');
  if (rawRH != null) { const saved = JSON.parse(rawRH); if (Array.isArray(saved)) runHistory = saved; }
} catch (e) {}
function saveRunHistory() {
  safeSave('neonSurvivorsRunHistory', runHistory);
}
function recordRunInHistory(outcome) {
  const entry = {
    t: Date.now(),
    outcome, // 'victory' | 'defeat'
    time: Math.floor(time),
    level: player.level,
    kills,
    gems: gemsCollected,
    comboBest,
    shards: calculateEarnedShards(),
    seed: currentRunSeedStr || 'standard',
    mode: runMode || 'standard',
    mutators: (activeMutations || []).map(m => m.name),
    weapons: player.weapons.map(w => `${w.id}L${w.level}`).join('+'),
  };
  runHistory.unshift(entry);
  if (runHistory.length > 5) runHistory.length = 5;
  saveRunHistory();
  renderRunHistoryPanel();
}
function renderRunHistoryPanel() {
  const el = $('run-history-panel');
  if (!el) return;
  el.innerHTML = runHistory.length === 0 ? '' : `<div class="rh-title-block">RECENT RUNS</div>` + runHistory.map(r => {
    const icon = r.outcome === 'victory' ? '👑' : '☠';
    const date = new Date(r.t);
    const dateStr = `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    const modeTag = r.mode === 'daily' ? '📅' : r.mode === 'custom' ? '🎲' : '⚔';
    return `
      <div class="rh-row ${r.outcome}">
        <div class="rh-icon">${icon}</div>
        <div class="rh-info">
          <div class="rh-title">${modeTag} ${r.outcome.toUpperCase()} — ${fmtTime(r.time)} · LV ${r.level} · ${r.kills} kills</div>
          <div class="rh-meta">${dateStr} · ${r.mutators.length > 0 ? r.mutators.join(' + ') : r.seed} · +${r.shards}💎</div>
        </div>
      </div>
    `;
  }).join('');
}

// ---------------- High score ----------------
let best = safeLoad('neonSurvivorsBest', { time: 0, level: 0, kills: 0 });
renderHighScore();
function renderHighScore() {
  if (best.time > 0) ui.highScoreLine.textContent = `Best: ${fmtTime(best.time)} | Level ${best.level} | ${best.kills} kills`;
}

// ---------------- Seed Board (per-seed local leaderboard) ----------------
let seedBoard = {};
{
  const sb = safeLoad('neonSurvivorsSeedBoard', {});
  if (sb && typeof sb === 'object' && !Array.isArray(sb)) seedBoard = sb;
}
function saveSeedBoard() { safeSave('neonSurvivorsSeedBoard', seedBoard); }
function seedBoardKey() { return (currentRunSeedStr || 'STANDARD') + '|' + (runMode || 'standard'); }
function seedBoardEntry() {
  return seedBoard[seedBoardKey()] || { attempts: 0, victories: 0, bestTime: 0, bestKills: 0, bestLevel: 0 };
}
function updateSeedBoard(outcome) {
  const key = seedBoardKey();
  const b = seedBoard[key] || { attempts: 0, victories: 0, bestTime: 0, bestKills: 0, bestLevel: 0 };
  b.attempts++;
  if (outcome === 'victory') b.victories++;
  b.bestTime = Math.max(b.bestTime, Math.floor(time));
  b.bestKills = Math.max(b.bestKills, kills);
  b.bestLevel = Math.max(b.bestLevel, player.level);
  seedBoard[key] = b;
  saveSeedBoard();
  renderSeedBoards();
}
function seedBoardLine(b) {
  if (!b.attempts) return '';
  return `SEED #${currentRunSeedStr || 'STANDARD'} — ${b.attempts} run${b.attempts !== 1 ? 's' : ''} · ${b.victories} win${b.victories !== 1 ? 's' : ''} · best ${fmtTime(b.bestTime)} / ${b.bestKills} kills`;
}
function renderSeedBoards() {
  const b = seedBoardEntry();
  // Menu panel: stat cards
  const el = $('seed-board-panel');
  if (el) {
    el.innerHTML = !b.attempts ? '' :
      `<div class="sb-title-block">GRID RECORD — THIS SEED</div><div class="sb-grid">` +
      `<div class="sb-card"><div class="sb-label">Attempts</div><div class="sb-val">${b.attempts}</div></div>` +
      `<div class="sb-card sb-win"><div class="sb-label">Wins</div><div class="sb-val">${b.victories}</div></div>` +
      `<div class="sb-card sb-gold"><div class="sb-label">Best Time</div><div class="sb-val">${b.bestTime ? fmtTime(b.bestTime) : '—'}</div></div>` +
      `<div class="sb-card sb-gold"><div class="sb-label">Best Kills</div><div class="sb-val">${b.bestKills || '—'}</div></div>` +
      `<div class="sb-card"><div class="sb-label">Best Level</div><div class="sb-val">${b.bestLevel || '—'}</div></div>` +
      `</div>`;
  }
  // End-screen one-liners
  const line = seedBoardLine(b);
  const go = $('go-seedboard'); if (go) go.textContent = line;
  const v = $('v-seedboard'); if (v) v.textContent = line;
}

function fmtTime(s) {
  s = Math.floor(s);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ---------------- Enemy types ----------------
const ENEMY_TYPES = {
  dot:    { hp: 8,    speed: 70,  damage: 8,  r: 7,  xp: 1, tier: 0 },
  tri:    { hp: 14,   speed: 120, damage: 12, r: 10, xp: 2, tier: 1, dashy: true },
  quad:   { hp: 45,   speed: 50,  damage: 16, r: 13, xp: 4, tier: 2 },
  penta:  { hp: 90,   speed: 55,  damage: 22, r: 17, xp: 8, tier: 3, split: true },
  sniper: { hp: 26,   speed: 42,  damage: 6,  r: 9,  xp: 5, tier: 2, sniper: true },
  healer: { hp: 35,   speed: 60,  damage: 5,  r: 11, xp: 6, tier: 2, healer: true },
  bomber: { hp: 22,   speed: 130, damage: 26, r: 12, xp: 4, tier: 2, bomber: true },
  swarm:  { hp: 3,    speed: 175, damage: 4,  r: 4,  xp: 0.5, tier: 0, swarm: true },
  lurker: { hp: 40,   speed: 60,  damage: 20, r: 12, xp: 7, tier: 2, lurker: true },
  weaver: { hp: 30,   speed: 150, damage: 10, r: 9,  xp: 5, tier: 1, weaver: true },
  splitter:{ hp: 60,   speed: 66,  damage: 14, r: 13, xp: 6, tier: 2, splitter: true },
  phantom: { hp: 36,   speed: 96,  damage: 13, r: 11, xp: 6, tier: 2, phantom: true },
  bulwark:{ hp: 140,  speed: 34,  damage: 22, r: 18, xp: 9, tier: 3, bulwark: true },
  necro:  { hp: 55,   speed: 46,  damage: 12, r: 13, xp: 10, tier: 3, necro: true },
  mirage: { hp: 55,   speed: 105, damage: 14, r: 11, xp: 6, tier: 2, mirage: true },
  leech:  { hp: 16,   speed: 235, damage: 6,  r: 6,  xp: 4, tier: 1, leech: true },
  carrier:{ hp: 190,  speed: 34,  damage: 18, r: 19, xp: 10, tier: 3, carrier: true },
  stalker:{ hp: 34,   speed: 165, damage: 14, r: 10, xp: 6, tier: 1, stalker: true },
  blink:  { hp: 24,   speed: 120, damage: 10, r: 9,  xp: 7, tier: 2, blink: true },
  warden: { hp: 85,   speed: 46,  damage: 18, r: 15, xp: 11, tier: 3, warden: true },
  boss1:  { hp: 900,  speed: 45,  damage: 30, r: 40, xp: 50, boss: true },
  boss2:  { hp: 2000, speed: 40,  damage: 35, r: 46, xp: 80, boss: true },
  boss3:  { hp: 4500, speed: 36,  damage: 40, r: 52, xp: 150, boss: true },
};
let bossSpawned = false;
let miniSpawnT1 = false;
let miniSpawnT2 = false;

function scaleEnemy(hp, dmg) {
  const t = Math.min(1, time / WIN_TIME);
  return { hp: hp * (1 + t * 2.2 + time / 600), dmg: dmg * (1 + t * 0.8) };
}

function spawnEnemy(type, x, y, elite) {
  if (enemies.length >= MAX_ENEMIES) return null;
  const def = ENEMY_TYPES[type];
  const s = scaleEnemy(def.hp, def.damage);
  const hpMul = elite ? 3.2 : 1;
  const e = {
    type, x, y, vx: 0, vy: 0,
    hp: s.hp * hpMul * player.enemyHpMul, maxHp: s.hp * hpMul * player.enemyHpMul,
    speed: def.speed * rand(0.9, 1.1) * (elite ? 0.92 : 1) * player.enemySpeedMul,
    damage: s.dmg * player.enemyDamageMul, r: def.r * (elite ? 1.5 : 1),
    xp: def.xp * (elite ? 4 : 1),
    stunT: 0,
    hitT: 0, ang: rand(0, TAU), spin: rand(-1.5, 1.5),
    stunT: 0,
    dashT: rand(0.5, 1.5), dashing: false, spawnT: 0.6, spawnT0: 0.6, elite: !!elite,
    boss: def.boss, tier: def.tier || 0,
    wobble: rand(0, TAU),
  };
  // Spawn flare: materialize burst scaled to the enemy's mass so heavier arrivals
  // read louder. Cheap radial shards + an expanding nova ring; skips when far off-screen.
  e.spawnFlare = { t: 0.45, maxT: 0.45, x, y };
  const flareCol = (SHAPES[type] && SHAPES[type] !== SHAPES.dot) ? (SHAPES[type][0] ? SHAPES[type][0].c : '#f66') : '#4f8';
  const flareN = Math.min(12, 4 + Math.round(e.r * 0.5));
  for (let k = 0; k < flareN; k++) {
    const a = (k / flareN) * TAU + rand(-0.3, 0.3);
    const sp = rand(60, 150) * (elite ? 1.5 : 1);
    pushParticle({ type: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, maxLife: 0.35, color: flareCol, size: rand(1.5, 3) });
  }
  pushShockwave({ x, y, r: 4, maxR: e.r + 26, speed: 300, damage: 0, cosmetic: true, color: flareCol });
  // Elites project a buff aura — categorized at spawn for visual + behavior (WS-10 expanded)
  if (elite && !def.boss) {
    e.auraType = pick(['fortify', 'swift', 'rage', 'molten', 'vortex', 'reflective', 'chrono']);
    e.auraR = e.auraType === 'vortex' ? 140 : e.auraType === 'chrono' ? 120 : 160;
    e.auraPulse = rand(0, TAU);
    e.affixCd = 0;
  }
  recordEncounter(type);
  if (type === 'sniper') { e.shootCd = rand(1.5, 2.5); e.holdDist = rand(300, 400); }
  if (type === 'healer') { e.healCd = rand(0.5, 1); e.auraR = 170; }
  if (type === 'lurker') { e.lurkState = 'stalk'; e.lurkT = rand(1.4, 2.4); e.sub = false; }
  if (type === 'necro') { e.channelCd = 3.0; e.channelT = 0; e.channelTarget = null; e.auraR = 240; }
  if (type === 'mirage') { e.blinkT = rand(1.8, 2.5); e.glitchT = 0; }
  if (type === 'weaver') { e.webT = rand(1.2, 2.2); }
  if (type === 'splitter') { e.splitGen = e.splitGen || 0; }
  if (type === 'phantom') { e.blinkT = rand(2.5, 4); e.phasing = 0; }
  if (type === 'leech') { e.latched = false; e.latchT = 0; e.latchDmg = 0; e.latchTick = 0; }
  if (type === 'carrier') { e.broodT = rand(1.5, 3); }
  if (type === 'stalker') { e.flankSide = pick([-1, 1]); e.strafeT = rand(1.2, 2.4); }
  if (type === 'blink') { e.blinkCd = 0; }
  if (type === 'warden') { e.shieldAng = rand(0, TAU); e.shields = 3; }
  enemies.push(e);
  return e;
}

function spawnEnemyAtEdge(type, elite) {
  const ang = rand(0, TAU);
  const dist = Math.hypot(W, H) / 2 + 80;
  spawnEnemy(type, player.x + Math.cos(ang) * dist, player.y + Math.sin(ang) * dist, elite);
}

// ---------------- Spawning director ----------------
let waveCooldowns = { basic: 0, tri: 0, quad: 0, penta: 0, ring: 0, elite: 0, special: 0, supply: 0, swarm: 0, squad: 25 };
let supplyDropT = 90;
function updateSpawning(dt) {
  if (state !== 'playing') return;
  const t = time;
  for (const k in waveCooldowns) waveCooldowns[k] -= dt;

  // base trickle
  if (waveCooldowns.basic <= 0) {
    const rate = Math.max(0.35, 1.6 - t / 300) / Math.max(1, player.enemySpawnMul);
    waveCooldowns.basic = rate;
    const n = (1 + Math.floor(t / 150)) * player.enemySpawnMul;
    for (let i = 0; i < n; i++) spawnEnemyAtEdge('dot');
  }
  // triangles
  if (t > 60 && waveCooldowns.tri <= 0) {
    waveCooldowns.tri = Math.max(3, 6.5 - t / 200);
    const n = 2 + Math.floor(t / 180);
    for (let i = 0; i < n; i++) spawnEnemyAtEdge('tri');
  }
  // quads
  if (t > 150 && waveCooldowns.quad <= 0) {
    waveCooldowns.quad = Math.max(4, 9 - t / 250);
    for (let i = 0; i < 1 + Math.floor(t / 240); i++) spawnEnemyAtEdge('quad');
  }
  // pentas
  if (t > 270 && waveCooldowns.penta <= 0) {
    waveCooldowns.penta = Math.max(6, 14 - t / 300);
    spawnEnemyAtEdge('penta');
  }
  // special units
  if (t > 120 && waveCooldowns.special <= 0) {
    waveCooldowns.special = rand(12, 20);
    const roll = rand(0, 1);
    if (roll < 0.28) spawnEnemyAtEdge('sniper');
    else if (roll < 0.52) spawnEnemyAtEdge('healer');
    else if (roll < 0.76) spawnEnemyAtEdge('bomber');
    else if (t > 420 && roll > 0.93) spawnEnemyAtEdge('carrier'); // brood-mother joins late
    else if (t > 380 && roll > 0.90) spawnEnemyAtEdge('warden');
    else if (t > 330 && roll > 0.88) spawnEnemyAtEdge('leech');
    else if (t > 290 && roll > 0.86) spawnEnemyAtEdge('blink');
    else if (t > 250 && roll > 0.82) spawnEnemyAtEdge('stalker');
    else if (t > 300 && roll > 0.84) spawnEnemyAtEdge('weaver'); // weavers spin webs after 300s
    else if (t > 240 && roll > 0.80) spawnEnemyAtEdge('phantom'); // phantoms phase in after 240s
    else if (t > 150 && roll > 0.76) spawnEnemyAtEdge('splitter'); // splitters bud after 150s
    else if (t > 150 && roll > 0.80) spawnEnemyAtEdge('mirage');
    else if (t > 200) spawnEnemyAtEdge('lurker'); // lurkers join after 200s
    else spawnEnemyAtEdge('sniper');
  }
  // swarm burst events — dense clusters of small enemies (late-game: mixed pods)
  if (t > 90 && waveCooldowns.swarm <= 0) {
    waveCooldowns.swarm = rand(22, 38);
    const burstType = t > 300 ? pick(['swarm', 'swarm', 'splitter', 'phantom']) : 'swarm';
    const n = burstType === 'swarm' ? randInt(6, 12) : randInt(2, 3);
    const spawnAng = rand(0, TAU);
    const d = Math.hypot(W, H) / 2 + 50;
    for (let i = 0; i < n; i++) {
      const jitter = (i / n) * TAU;
      spawnEnemy(burstType, player.x + Math.cos(spawnAng + jitter * 0.3) * (d + rand(-30, 30)), player.y + Math.sin(spawnAng + jitter * 0.3) * (d + rand(-30, 30)));
    }
  }
  // [WS-7] squad V-formation charging waves — wedge of swarmers aimed at the player
  if (t > 150 && waveCooldowns.squad <= 0) {
    waveCooldowns.squad = rand(30, 45);
    if (enemies.length < MAX_ENEMIES - 14) {
      const spawned = spawnSquadFormation('swarm');
      if (spawned > 0) {
        pushShockwave({ x: player.x, y: player.y, r: 10, maxR: 90, speed: 500, damage: 0, cosmetic: true, color: '#4ff' });
        showFloatingShard('⚠ SQUAD INBOUND');
      }
    }
  }
  // standard ring waves
  if (t > 120 && waveCooldowns.ring <= 0) {
    waveCooldowns.ring = rand(35, 55);
    const n = 14 + Math.floor(t / 60);
    const type = t > 300 ? pick(['tri', 'quad', 'dot', 'dot']) : 'dot';
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      const d = Math.hypot(W, H) / 2 + 60;
      spawnEnemy(type, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d);
    }
  }
  // elites
  if (t > 90 && waveCooldowns.elite <= 0) {
    waveCooldowns.elite = rand(40, 65);
    const type = t > 330 ? pick(['penta', 'quad', 'quad', 'sniper', 'splitter', 'phantom']) : pick(['tri', 'quad', 'dot', 'dot']);
    spawnEnemyAtEdge(type, true);
  }
  // supply drop event — rarity rolled at spawn, drives visuals + loot
  supplyDropT -= dt;
  if (supplyDropT <= 0) {
    supplyDropT = rand(80, 120);
    const a = rand(0, TAU);
    const d = rand(80, 220);
    const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
    // rarity roll: weighted by player luck stat (affects rare+epic thresholds)
    const luck = player.luck || 0;
    const luckBonus = luck * 4; // luck is already a fractional stat (0.02 per rank typical) — amplify
    const roll = rand(0, 1);
    let rarity = 'common';
    if (roll < 0.08 + luckBonus) rarity = 'epic';
    else if (roll < 0.30 + luckBonus * 2) rarity = 'rare';
    hazards.push({ type: 'supply', x, y, t: 2.4, r: 46, rarity });
    showFloatingShard(rarity === 'epic' ? '★ EPIC SUPPLY DROP ★' : rarity === 'rare' ? '◆ RARE SUPPLY DROP ◆' : 'SUPPLY DROP INBOUND');
    AudioSys.SFX.bossWarn();
  }
  // WS-9 Shard Pylon periodic spawn (~every 45s)
  if (!waveCooldowns.pylon) waveCooldowns.pylon = 20;
  waveCooldowns.pylon -= dt;
  if (waveCooldowns.pylon <= 0) {
    waveCooldowns.pylon = rand(35, 55);
    if (hazards.length < 35) {
      const pa = rand(0, TAU), pd = rand(120, 280);
      hazards.push({ type: 'pylon', x: player.x + Math.cos(pa) * pd, y: player.y + Math.sin(pa) * pd, hp: 50, maxHp: 50, element: pick(['frost', 'fire']) });
    }
  }
  // final boss
  if (t >= WIN_TIME && !bossSpawned) {
    bossSpawned = true;
    spawnEnemyAtEdge('boss3');
    AudioSys.SFX.bossRoar();
    AudioSys.setBossMode(true);
    triggerBossIntro('THE ARCHITECT', 'FINAL GUARDIAN OF THE GRID');
    shake = 18;
  }
  // mini bosses — crossed-threshold check (robust at any fps)
  if (!miniSpawnT1 && t >= 180) { miniSpawnT1 = true; AudioSys.SFX.bossWarn(); spawnEnemyAtEdge('boss1'); triggerBossIntro('WARDEN MK.I', 'ELITE PROTOCOL ENGAGED'); }
  if (!miniSpawnT2 && t >= 420) { miniSpawnT2 = true; AudioSys.SFX.bossWarn(); spawnEnemyAtEdge('boss2'); triggerBossIntro('WARDEN MK.II', 'THREAT LEVEL: CRITICAL'); }
}

function triggerBossIntro(name, subtext) {
  bossIntro = { active: true, t: 0, name, subtext };
  hitStop = Math.max(hitStop, 0.45);
  shake = Math.max(shake, 18);
}

// ============================================================
// WS-5 Void Cursed Shrines & Pacts
// A Void Shrine is a ground glyph hazard that surfaces every ~150s (accelerating
// once the player has bound 3+ pacts). Walking over it opens a NON-BLOCKING
// 2-choice Void Pact dock — the run keeps simulating while the player decides.
// Pacts are high-risk / high-reward: each trades a real upside for a real curse.
// Active pacts live on player.pacts and are broken down in the run recap.
// ============================================================
let shrineSpawnT = 150;      // countdown to next shrine (run-time seconds)
let pendingShrineOffer = false; // shrine walked-over while dock busy → surface ASAP
let shrineOfferOnScreen = false; // a pact dock is currently showing (blocks shrine respawn)

function buildPactPool() {
  // `pact: true` marks these as Void Pact choices for the picker/auto-resolve path.
  return [
    { kind: 'pact', id: 'glassCannon', icon: '⚔', name: 'GLASS CANNON', desc: '+40% weapon damage · −30% max HP', pact: true,
      apply: () => { player.weaponDamageMul *= 1.40; player.maxHp = Math.max(1, Math.round(player.maxHp * 0.70)); player.hp = Math.min(player.hp, player.maxHp); } },
    { kind: 'pact', id: 'adrenaline', icon: '≫', name: 'ADRENALINE VOID', desc: '+50% speed · taking damage seals dash 4s', pact: true,
      apply: () => { player.speed = Math.round(player.speed * 1.50); } },
    { kind: 'pact', id: 'soulTithe', icon: '❥', name: 'SOUL TITHE', desc: '4% lifesteal · −20% max HP', pact: true,
      apply: () => { player.pactLifesteal += 0.04; player.maxHp = Math.max(1, Math.round(player.maxHp * 0.80)); player.hp = Math.min(player.hp, player.maxHp); } },
    { kind: 'pact', id: 'voidMagnet', icon: '◇', name: 'VOID MAGNET', desc: '+70% pickup range · +30% damage taken', pact: true,
      apply: () => { player.magnet = Math.round(player.magnet * 1.70); player.enemyDamageMul = (player.enemyDamageMul || 1) * 1.30; } },
    { kind: 'pact', id: 'bloodSurge', icon: '✦', name: 'BLOOD SURGE', desc: '+25% attack rate · −15% damage', pact: true,
      apply: () => { player.cdMul = (player.cdMul || 1) * 0.75; player.weaponDamageMul *= 0.85; } },
  ];
}

function presentShrineChoices() {
  // Non-blocking: reuse the same dock the level-up/cache offers use. If a pact
  // dock is already showing, do nothing. If the dock is busy with a level/cache
  // offer, bank the pact and surface it the moment the dock frees (never lost).
  if (shrineOfferOnScreen) return;
  if (levelupOpen) { pendingShrineOffer = true; return; }
  const choices = weightedSample(buildPactPool(), 2);
  levelupChoices = choices;
  levelupTimer = 10.0;           // longer fuse than cache — the curse deserves a read
  levelupOpen = true;
  shrineOfferOnScreen = true;
  pendingShrineOffer = false;
  ui.cards.innerHTML = '';
  for (let ci = 0; ci < choices.length; ci++) {
    const c = choices[ci];
    const el = document.createElement('div');
    el.className = 'card new-card';
    el.innerHTML = `<div class="keycap">${ci + 1}</div><div class="icon">${c.icon}</div><div class="name">${c.name}</div><div class="desc">${c.desc}</div><div class="lvl">VOID PACT</div>`;
    el.onclick = () => { applyPactChoice(c); };
    ui.cards.appendChild(el);
  }
  const chestOverlay = ui.levelup || $('levelup-screen');
  if (chestOverlay) { chestOverlay.classList.remove('hidden'); ui.levelup = chestOverlay; }
  const hudDock = ui.levelupHud || $('levelup-hud');
  if (hudDock) hudDock.classList.remove('hidden');
  if (ui.hud) ui.hud.classList.remove('hidden');
  const badge = $('levelup-pending');
  if (badge) { badge.textContent = 'VOID PACT'; badge.classList.remove('hidden'); }
  const timerEl = $('levelup-timer');
  if (timerEl) timerEl.style.width = '100%';
  showFloatingShard('✦ VOID SHRINE AWAKENS ✦');
  shake = Math.max(shake, 4);
  if (AudioSys.SFX.bossWarn) AudioSys.SFX.bossWarn(); else if (AudioSys.SFX.chest) AudioSys.SFX.chest();
}

function applyPactChoice(c) {
  if (!c) return;
  if (c.apply) c.apply();
  player.pacts.push({ id: c.id, name: c.name, icon: c.icon, desc: c.desc, time: Math.round(time) });
  if (AudioSys.SFX.evolve) AudioSys.SFX.evolve();
  addFloatText(player.x, player.y - 32, c.name + '!', '#b2f', true);
  shake = Math.max(shake, 6);
  hitStop = Math.max(hitStop, 0.10);
  showFloatingShard('✦ PACT BOUND: ' + c.name.toUpperCase() + ' ✦');
  // ritual detonation ring + void shard burst (cosmetic)
  pushShockwave({ x: player.x, y: player.y, r: 10, maxR: 120, speed: 700, damage: 0, cosmetic: true, color: '#b2f' });
  for (let i = 0; i < 18; i++) {
    const a = rand(0, TAU);
    pushParticle({ type: 'shard', x: player.x, y: player.y, vx: Math.cos(a) * rand(120, 260), vy: Math.sin(a) * rand(120, 260), life: 0.5, maxLife: 0.5, color: pick(['#b2f', '#82e', '#fff']), size: rand(2, 4) });
  }
  shrineOfferOnScreen = false;
  dismissLevelupUI();
  if (typeof checkAchievements === 'function') checkAchievements();
  // A queued level-up may have banked behind the pact — re-surface it now.
  if (pendingLevels > 0) resumeLevelUpQueue();
}

function updateVoidShrines(dt) {
  // Don't spawn while a pact dock is live or one is waiting to surface.
  if (shrineOfferOnScreen || pendingShrineOffer) return;
  // Soft-cap: avoid piling up shrines alongside dense hazard fields.
  const shrineCount = hazards.reduce((n, h) => n + (h.type === 'shrine' ? 1 : 0), 0);
  if (shrineCount >= 2) return;
  shrineSpawnT -= dt;
  if (shrineSpawnT <= 0) {
    const interval = player.pacts.length >= 3 ? rand(70, 100) : rand(120, 180);
    shrineSpawnT = interval;
    const a = rand(0, TAU), d = rand(180, 340);
    if (hazards.length < 40) {
      hazards.push({ type: 'shrine', x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d, r: 46, t: 60, pulse: 0 });
      showFloatingShard('✦ A VOID SHRINE RISES NEARBY ✦');
      if (AudioSys.SFX.bossWarn) AudioSys.SFX.bossWarn();
    }
  }
}

function buildPactRecap() {
  if (!player.pacts || player.pacts.length === 0) return '';
  const rows = player.pacts.map(p => `<span class="recap-weapon" style="border-color:#b2f;color:#d6beff">${p.icon} ${p.name}</span>`).join(' &nbsp; ');
  return `<div class="recap-line" style="color:#b2f">Void Pacts <b>${player.pacts.length}</b></div><div class="recap-row">${rows}</div>`;
}

// ---------------- Hazards (supply drop, bomber explosions) ----------------
function updateHazards(dt) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.t -= dt;
    if (h.type === 'supply') {
      if (h.t <= 0) {
        hazards.splice(i, 1);
        const rarity = h.rarity || 'common';
        // Rarity-scaled loot bundle
        if (rarity === 'epic') {
          spawnPickup('chest', h.x, h.y);
          spawnPickup('chest', h.x + 32, h.y - 18);
          spawnPickup('overcharge', h.x - 32, h.y - 18);
          spawnPickup('warp', h.x + 30, h.y + 14);
          showFloatingShard('★ EPIC CACHE ★');
          AudioSys.SFX.evolve();
        } else if (rarity === 'rare') {
          spawnPickup('chest', h.x, h.y);
          spawnPickup('overcharge', h.x + 24, h.y + 6);
          spawnPickup('heart', h.x + 6, h.y - 28);
          showFloatingShard('◆ RARE CACHE ◆');
          AudioSys.SFX.chest();
        } else {
          spawnPickup('chest', h.x, h.y);
          spawnPickup('heart', h.x + 24, h.y + 6);
          spawnPickup('heart', h.x - 24, h.y + 6);
          AudioSys.SFX.chest();
        }
        // cosmetic nova ring colored by rarity
        const ringColor = rarity === 'epic' ? '#f4f' : rarity === 'rare' ? '#4df' : '#ff4';
        pushShockwave({ x: h.x, y: h.y, r: 8, maxR: h.r * (rarity === 'epic' ? 2.4 : rarity === 'rare' ? 1.9 : 1.6), speed: 700, damage: 0, cosmetic: true, color: ringColor });
      }
    } else if (h.type === 'boom') {
      if (h.t <= 0) {
        hazards.splice(i, 1);
        pushShockwave({ x: h.x, y: h.y, r: 10, maxR: h.r, speed: 1100, damage: h.dmg, hostile: true });
        AudioSys.SFX.shockwave();
        shake = Math.max(shake, 8);
        for (let k = 0; k < 14; k++) pushParticle({ type: 'shard', x: h.x, y: h.y, vx: rand(-380, 380), vy: rand(-380, 380), life: 0.4, maxLife: 0.4, color: '#fa2', size: rand(2, 5) });
      }
    } else if (h.type === 'stormZone') {
      h.hitCd = (h.hitCd || 0) - dt;
      if (h.hitCd <= 0) {
        h.hitCd = 0.15;
        for (const e of enemies) {
          if (e.spawnT > 0) continue;
          if ((e.x - h.x) ** 2 + (e.y - h.y) ** 2 < h.r * h.r) {
            damageEnemy(e, h.damage, '#ff4');
            applyShock(e, 2.0, 22);
            e.slowT = Math.max(e.slowT || 0, 0.4);
          }
        }
      }
      if (Math.random() < 0.3) {
        pushParticle({ type: 'shard', x: h.x + rand(-h.r, h.r), y: h.y + rand(-h.r, h.r), vx: rand(-40, 40), vy: rand(-40, 40), life: 0.2, maxLife: 0.2, color: '#ff4', size: rand(1.5, 3) });
      }
      if (h.t <= 0) hazards.splice(i, 1);
    } else if (h.type === 'fireWall') {
      // INFERNO BEAM lingering fire wall: ticking AoE DoT + ember motes (fire+ice tint).
      h.t -= dt;
      h.hitCd = (h.hitCd || 0) - dt;
      if (h.hitCd <= 0) {
        h.hitCd = 0.25;
        for (const e of enemies) {
          if (e.spawnT > 0) continue;
          if ((e.x - h.x) ** 2 + (e.y - h.y) ** 2 < h.r * h.r) {
            damageEnemy(e, h.damage, '#f84', 'frost');
            e.burnT = Math.max(e.burnT || 0, 0.4);
          }
        }
      }
      if (Math.random() < 0.5) {
        pushParticle({ type: 'shard', x: h.x + rand(-h.r, h.r), y: h.y + rand(-h.r, h.r), vx: rand(-30, 30), vy: rand(-70, -20), life: 0.35, maxLife: 0.35, color: pick(['#f84', '#fd4', '#0cf']), size: rand(2, 4) });
      }
      if (h.t <= 0) hazards.splice(i, 1);
    } else if (h.type === 'pylon') {
      // WS-9 Destructible Shard Pylon: check projectile/shockwave hits
      if (h.hp <= 0) {
        hazards.splice(i, 1);
        // Detonate elemental explosion hazard field
        pushShockwave({ x: h.x, y: h.y, r: 10, maxR: 140, speed: 800, damage: 45, color: h.element === 'frost' ? '#00ffff' : '#ff4400' });
        AudioSys.SFX.shockwave();
        shake = Math.max(shake, 10);
        if (hazards.length < 40) {
          hazards.push({ type: 'stormZone', x: h.x, y: h.y, t: 6.0, r: 140, damage: 18, element: h.element });
        }
        for (let k = 0; k < 16; k++) {
          pushParticle({ type: 'shard', x: h.x, y: h.y, vx: rand(-300, 300), vy: rand(-300, 300), life: 0.45, maxLife: 0.45, color: h.element === 'frost' ? '#00ffff' : '#ff4400', size: rand(2.5, 5) });
        }
      }
    } else if (h.type === 'web') {
      // Weaver web: passive slow zone (player slow applied in updatePlayer); just ages out
      if (h.t <= 0) hazards.splice(i, 1);
    } else if (h.type === 'shrine') {
      // WS-5 Void Shrine: pulsing glyph that ages out, emits void wisps, and opens a
      // non-blocking pact dock when the player walks over it.
      h.pulse = (h.pulse || 0) + dt;
      if (Math.random() < dt * 6) {
        const a = rand(0, TAU);
        pushParticle({ type: 'shard', x: h.x + Math.cos(a) * h.r * 0.7, y: h.y + Math.sin(a) * h.r * 0.7, vx: Math.cos(a) * rand(-16, 16), vy: Math.sin(a) * rand(-16, 16) - 22, life: 0.55, maxLife: 0.55, color: pick(['#b2f', '#82e', '#d4f']), size: rand(1.6, 3.2) });
      }
      const pr = player.r + h.r;
      if (state === 'playing' && dist2(player, h) < pr * pr) {
        presentShrineChoices();
        hazards.splice(i, 1);
        continue;
      }
      if (h.t <= 0) hazards.splice(i, 1);
    }
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;

    if (p.isMegalodonBlade) {
      if (!p.returning) {
        p.dist += p.speed * dt;
        p.x = p.startX + Math.cos(p.ang) * p.dist;
        p.y = p.startY + Math.sin(p.ang) * p.dist;
        if (p.dist >= p.maxDist) p.returning = true;
      } else {
        const dx = player.x - p.x, dy = player.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 25) {
          projectiles[i] = projectiles[projectiles.length - 1];
          projectiles.pop();
          releaseProjectile(p);
          continue;
        }
        p.x += (dx / d) * p.speed * 1.2 * dt;
        p.y += (dy / d) * p.speed * 1.2 * dt;
      }
      for (const e of enemies) {
        if (e.spawnT > 0 || (p.hitCdMap && p.hitCdMap.get(e) > frameCount)) continue;
        const rr = e.r + p.r;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
          if (!p.hitCdMap) p.hitCdMap = new Map();
          p.hitCdMap.set(e, frameCount + 15);
          damageEnemy(e, p.damage, '#ffd700', p.weaponId);
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          e.vx += Math.cos(a) * 220; e.vy += Math.sin(a) * 220;
        }
      }
      // Spectral jaws twin-particle trail (cyan + gold) while the blade flies.
      if (frameCount % 3 === 0) {
        pushParticle({ type: 'shard', x: p.x + rand(-6, 6), y: p.y + rand(-6, 6), vx: rand(-50, 50), vy: rand(-50, 50), life: 0.3, maxLife: 0.3, color: pick(['#4ff', '#ffd700']), size: rand(2, 4) });
      }
      if (p.life <= 0) {
        projectiles[i] = projectiles[projectiles.length - 1];
        projectiles.pop();
        releaseProjectile(p);
        continue;
      }
      continue;
    }

    // homing behavior
    if (p.homing && p.homingT > 0) {
      p.homingT -= dt;
      const t = nearestEnemy(p.x, p.y, 800);
      if (t) {
        const desired = angleTo(p, t);
        const cur = Math.atan2(p.vy, p.vx);
        let diff = desired - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const turn = clamp(diff, -4.2 * dt, 4.2 * dt);
        const sp = Math.hypot(p.vx, p.vy) + 900 * dt;
        const na = cur + turn;
        const ns = Math.min(sp, 640);
        p.vx = Math.cos(na) * ns; p.vy = Math.sin(na) * ns;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.isPlasmaSingularity) {
      // Gravitational pull: attract enemies inward toward sphere core
      const pr2 = (p.pullR || 200) * (p.pullR || 200);
      for (const e of enemies) {
        if (e.spawnT > 0 || e.boss) continue;
        const dx = p.x - e.x, dy = p.y - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < pr2 && d2 > 16) {
          const d = Math.sqrt(d2);
          const pull = (1 - d / (p.pullR || 200)) * 480 * dt;
          e.vx += (dx / d) * pull;
          e.vy += (dy / d) * pull;
        }
      }
    }
    if (p.life <= 0) {
      projectiles[i] = projectiles[projectiles.length - 1];
      projectiles.pop();
      releaseProjectile(p);
      continue;
    }

    if (p.hostile) {
      const pr = player.r + p.r + 2;
      if (dist2(p, player) < pr * pr && player.iframe <= 0) {
        damagePlayer(p.damage);
        projectiles[i] = projectiles[projectiles.length - 1];
        projectiles.pop();
        releaseProjectile(p);
      }
      continue;
    }

    let hit = false;
    // Spatial-hash: only test enemies in nearby cells instead of the full swarm.
    // Query just past the projectile radius; rr check below still gates the hit.
    const nearProj = enemyGrid.query(p.x, p.y, p.r + 64);
    for (const e of nearProj) {
      if (e.spawnT > 0 || e.sub || p.hitSet.has(e)) continue;
      const rr = e.r + p.r + 2;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
        p.hitSet.add(e);
        damageEnemy(e, p.damage, p.color, p.weaponId || '_projectile');

        if (p.chainOnHit || p.color === '#ff4') {
          applyShock(e, 2.0, 22);
        }
        if (p.isQuantumBolt || p.color === '#c6f' || p.color === '#a855f7') {
          applyVoidDecay(e, 4.0, 1.4);
        }

        // Quantum Storm split on impact
        if (p.isQuantumBolt && !p.isSplitChild) {
          const curAng = Math.atan2(p.vy, p.vx);
          for (const angleOffset of [-0.45, 0.45]) {
            const splitA = curAng + angleOffset;
            const spd = 750;
            pushProjectile({
              x: p.x, y: p.y,
              vx: Math.cos(splitA) * spd, vy: Math.sin(splitA) * spd,
              r: 4, damage: p.damage * 0.55, pierce: 2,
              life: 0.9, color: '#00ffff',
              isSplitChild: true, weaponId: p.weaponId,
            });
          }
        }

        if (p.chainOnHit) {
          let best = null, bd = p.chainOnHit.radius * p.chainOnHit.radius;
          for (const o of enemies) {
            if (o === e || o.spawnT > 0 || p.hitSet.has(o)) continue;
            const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
            if (d < bd) { bd = d; best = o; }
          }
          if (best) {
            p.hitSet.add(best);
            spawnLightning(e.x, e.y, best.x, best.y);
            damageEnemy(best, p.chainOnHit.damage, '#8ff', p.weaponId || 'bolt');
            applyShock(best, 2.0, 18);
          }
        }
        if (p.clusterSplit && !p.isClusterChild) {
          for (let k = 0; k < 4; k++) {
            const a = rand(0, TAU);
            pushProjectile({
              x: p.x, y: p.y,
              vx: Math.cos(a) * 360, vy: Math.sin(a) * 360,
              r: 3, damage: p.clusterSplit.damage, pierce: 0, homing: true, homingT: 1.2,
              life: 1.4, color: '#ffd700', isClusterChild: true, weaponId: p.weaponId,
            });
          }
        }
        AudioSys.SFX.hit();
        if (p.pierce > 0) p.pierce--;
        else { hit = true; }
        break;
      }
    }
    if (hit) {
      for (let k = 0; k < 4; k++) pushParticle({ type: 'shard', x: p.x, y: p.y, vx: rand(-140, 140), vy: rand(-140, 140), life: 0.2, maxLife: 0.2, color: p.color, size: rand(1.5, 3) });
      projectiles[i] = projectiles[projectiles.length - 1];
      projectiles.pop();
      releaseProjectile(p);
    }
  }
}

// ---------------- Weapon Definitions & Engine ----------------
const WEAPON_DEFS = {
  bolt: {
    icon: '⚡', name: 'Neon Bolt', desc: 'Fires fast neon bolts at nearby enemies',
    element: 'arc',
    cds: [0.4, 0.35, 0.3, 0.25, 0.2],
    damages: [12, 16, 22, 28, 36],
    pierces: [0, 0, 1, 1, 2],
    count: [1, 2, 2, 3, 4],
    // WS-3 Tier-6: SUPER OVERCHARGE — unlocked at L5-evolved once the synergy
    // passive is owned (critChance > base ≈ Deadeye/Target Lock taken).
    super: { name: 'Megalodon Overcharge', colors: ['#4ff', '#ffd700'] },
  },
  saws: {
    icon: '🪚', name: 'Orbit Saws', desc: 'Rotating blades orbiting player',
    element: 'slash',
    counts: [2, 3, 4, 5, 6],
    radii: [70, 80, 90, 100, 110],
    damages: [8, 12, 16, 22, 28],
    super: { name: 'Hyper Saws', colors: ['#fa4', '#fd4'] },
  },
  nova: {
    icon: '💥', name: 'Nova Pulse', desc: 'Expanding pulse ring damaging nearby enemies',
    element: 'fire',
    cds: [2.5, 2.2, 1.9, 1.6, 1.3],
    damages: [25, 40, 60, 85, 120],
    radii: [140, 160, 180, 200, 230],
  },
  tesla: {
    icon: '⚡', name: 'Tesla Arc', desc: 'Arcing electric discharge chaining between foes',
    element: 'arc',
    cds: [1.8, 1.5, 1.3, 1.1, 0.9],
    damages: [18, 26, 36, 48, 65],
    chains: [2, 3, 4, 5, 6],
  },
  lance: {
    icon: '🎯', name: 'Rail Lance', desc: 'High-velocity piercing laser beam',
    element: 'void',
    cds: [2.0, 1.7, 1.4, 1.2, 1.0],
    damages: [35, 55, 80, 110, 150],
  },
  drones: {
    icon: '🛸', name: 'Seeker Drones', desc: 'Homing drones seeking dense enemy clusters',
    element: 'slash',
    cds: [2.6, 2.3, 2.0, 1.7, 1.4],
    damages: [10, 15, 21, 28, 38],
    count: [1, 2, 2, 3, 3],
  },
  frost: {
    icon: '❄️', name: 'Freeze Ray', desc: 'Continuous freezing cone slowing and damaging enemies',
    element: 'ice',
    ranges: [200, 225, 255, 290, 330],
    apertures: [0.45, 0.52, 0.6, 0.7, 0.8],
    dps: [6, 10, 15, 23, 34],
    slowDur: [0.35, 0.45, 0.55, 0.7, 0.85],
    tickRate: [0.14, 0.13, 0.12, 0.11, 0.1],
    // Visual effect parameters
    particleRate: [0.04, 0.035, 0.03, 0.025, 0.02],
    particleColors: ['#8ff', '#aaf', '#ccf', '#eef', '#fff'],
    particleSizes: [1.5, 1.8, 2.0, 2.2, 2.5],
    super: { name: 'Inferno Beam', colors: ['#f84', '#0cf'] },
  },
  prism: {
    icon: '🔺', name: 'Arc Prism', desc: 'Orbiting prismatic shards refracting arcs to nearby foes',
    element: 'arc',
    counts: [1, 2, 2, 3, 3],          // orbiting shards
    radii: [64, 70, 76, 82, 88],       // orbit radius
    cds: [2.3, 2.0, 1.75, 1.5, 1.2],   // zap cooldown per shard
    damages: [16, 24, 34, 46, 60],     // damage per refracted arc
    beams: [1, 1, 2, 2, 3],            // targets struck per shard zap
  },
  plasma: {
    icon: '🌀', name: 'Plasma Singularity', desc: 'Fires heavy gravitational plasma spheres that pull and crush foes',
    element: 'void',
    cds: [3.2, 2.8, 2.4, 2.0, 1.6],
    damages: [40, 65, 95, 135, 185],
    radii: [18, 22, 26, 30, 36],
    pulls: [180, 210, 240, 270, 310],
    super: { name: 'Vortex Collapse', colors: ['#a6f', '#00ffff'] },
  },
  beam: {
    icon: '⚡', name: 'Quantum Beam', desc: 'Continuous sweeping death ray searing enemies in an arc',
    element: 'fire',
    cds: [4.0, 3.5, 3.0, 2.5, 2.0],
    damages: [12, 18, 26, 36, 50],
    arcs: [0.8, 1.0, 1.2, 1.4, 1.6],
    ranges: [280, 320, 360, 400, 450],
    super: { name: 'Hypernova Ray', colors: ['#ff4400', '#ffff00'] },
  }
};

// Elemental palette + glyphs — single source of truth for UI + future effects
const ELEMENT_INFO = {
  fire:  { glyph: '🔥', color: '#f84', label: 'FIRE' },
  ice:   { glyph: '❄️', color: '#0cf', label: 'ICE' },
  arc:   { glyph: '⚡', color: '#fd4', label: 'ARC' },
  void:  { glyph: '🌑', color: '#a6f', label: 'VOID' },
  slash: { glyph: '⚔️', color: '#fa4', label: 'SLASH' },
};

function nearestEnemy(x, y, maxDist = 9999) {
  let closest = null, minDist2 = maxDist * maxDist;
  for (const e of enemies) {
    if (e.spawnT > 0 || e.sub || e.phasing) continue;
    const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d2 < minDist2) { minDist2 = d2; closest = e; }
  }
  return closest;
}

// WS-3 synergy check: base critChance is 0 (resetPlayer) and base cdMul is 1;
// any src that raised critChance or lowered cdMul counts as owning the passive.
function synergyOwned(id) {
  if (id === 'bolt') return (player.critChance || 0) > 0;
  if (id === 'saws') return (player.cdMul || 1) < 1;
  if (id === 'frost') return (player.autoForge || 0) > 0;
  if (id === 'plasma') return (player.magnetSurge || 0) > 0;
  if (id === 'beam') return (player.weaponDamageMul || 1) > 1.2;
  return false;
}
const SUPER_DMG_MUL = 1.4; // WS-3: +40% damage while SUPER OVERCHARGE active

function updateWeapons(dt) {
  for (const w of player.weapons) {
    const def = WEAPON_DEFS[w.id];
    if (!def) continue;
    // Tier-6 SUPER OVERCHARGE: L5-evolved + synergy passive owned.
    w.super = !!(w.evolved && w.level >= 5 && def.super && synergyOwned(w.id));
    const superDmgMul = w.super ? SUPER_DMG_MUL : 1;

    // WS-E: single-pass heat refresh (O(weapons) per frame, no allocation).
    // Damage/cooldown reads below use w.heat + w.milestoneBoost read-only.
    w.heat = weaponHeat(w.id);
    const heatDmgMul = 1 + 0.15 * w.heat + (w.milestoneBoost || 0);
    const heatCdMul = 1 - 0.10 * w.heat;

    if (w.id === 'saws') {
      w.ang = (w.ang || 0) + dt * 2.8;
      const n = def.counts[w.level - 1];
      const radius = def.radii[w.level - 1];
      const dmg = def.damages[w.level - 1] * heatDmgMul * superDmgMul;
      w.hitCd = (w.hitCd || 0) - dt;
      if (w.hitCd <= 0) {
        w.hitCd = 0.15 * heatCdMul;
        for (let s = 0; s < n; s++) {
          const a = w.ang + s / n * TAU;
          const sx = player.x + Math.cos(a) * radius;
          const sy = player.y + Math.sin(a) * radius;
          for (const e of enemies) {
            if (e.spawnT > 0) continue;
            if ((e.x - sx) ** 2 + (e.y - sy) ** 2 < (e.r + 14) ** 2) {
              damageEnemy(e, dmg, '#fa4', w.id);
              // HYPER SAWS: contact snaps a chain-lightning arc into the next foe.
              if (w.super) {
                let best = null, bd = 200 * 200;
                for (const o of enemies) {
                  if (o === e || o.spawnT > 0) continue;
                  const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
                  if (d2 < bd) { bd = d2; best = o; }
                }
                if (best) {
                  spawnLightning(e.x, e.y, best.x, best.y);
                  damageEnemy(best, dmg * 0.5, '#fd4', w.id);
                  applyShock(best, 1.5, 16);
                }
              }
            }
          }
        }
      }
      continue;
    }

    if (w.id === 'prism') {
      // Orbiting shards that periodically refract a bolt into nearby enemies.
      w.ang = (w.ang || 0) + dt * 2.2;
      w.cd = (w.cd || 0) - dt;
      const n = def.counts[w.level - 1];
      const radius = def.radii[w.level - 1];
      const dmg = def.damages[w.level - 1] * heatDmgMul;
      const beams = def.beams[w.level - 1];
      const shardPos = [];
      for (let s = 0; s < n; s++) {
        const a = w.ang + s / n * TAU;
        shardPos.push({ x: player.x + Math.cos(a) * radius, y: player.y + Math.sin(a) * radius, a });
      }
      // Light contact damage so the orbiting body isn't purely decorative.
      for (const sp of shardPos) {
        const near = enemyGrid.query(sp.x, sp.y, 24);
        for (const e of near) {
          if (e.spawnT > 0) continue;
          if ((e.x - sp.x) ** 2 + (e.y - sp.y) ** 2 < (e.r + 9) ** 2 && !(e.pHitCd > 0)) {
            e.pHitCd = 0.25;
            damageEnemy(e, dmg * 0.35, '#8ff', w.id);
          }
        }
      }
      if (w.cd <= 0) {
        w.cd = def.cds[w.level - 1] * player.cdMul * heatCdMul;
        let fired = false;
        for (const sp of shardPos) {
          const near = enemyGrid.query(sp.x, sp.y, 460);
          const cands = [];
          for (const e of near) {
            if (e.spawnT > 0) continue;
            const d2 = (e.x - sp.x) ** 2 + (e.y - sp.y) ** 2;
            if (d2 < 460 * 460) cands.push([d2, e]);
          }
          if (!cands.length) continue;
          cands.sort((a, b) => a[0] - b[0]);
          for (let k = 0; k < Math.min(beams, cands.length); k++) {
            const tgt = cands[k][1];
            spawnLightning(sp.x, sp.y, tgt.x, tgt.y);
            damageEnemy(tgt, dmg, '#8ff', w.id);
            applyShock(tgt, 1.2, 14);
            fired = true;
          }
        }
        if (fired && AudioSys.SFX.prism) AudioSys.SFX.prism();
      }
      continue;
    }

    if (w.id === 'frost') {
      const target = nearestEnemy(player.x, player.y, 400);
      w.aimA = target ? angleTo(player, target) : (player.ang || 0);
      const range = def.ranges[w.level - 1];
      const aperture = def.apertures[w.level - 1];
      const dps = def.dps[w.level - 1] * heatDmgMul * superDmgMul;
      w.tickCd = (w.tickCd || 0) - dt;
      if (w.tickCd <= 0) {
        w.tickCd = 0.1 * heatCdMul;
        const near = enemyGrid.query(player.x, player.y, range + 30);
        for (const e of near) {
          if (e.spawnT > 0) continue;
          const d = Math.hypot(e.x - player.x, e.y - player.y);
          if (d <= range + e.r) {
            const aToE = Math.atan2(e.y - player.y, e.x - player.x);
            let diff = aToE - w.aimA;
            while (diff > Math.PI) diff -= TAU;
            while (diff < -Math.PI) diff += TAU;
            if (Math.abs(diff) <= aperture / 2 + 0.2) {
              // INFERNO BEAM: super state swaps ice-blue hits for plasma orange;
              // freeze is suppressed so the fire walls own the DoT lane.
              damageEnemy(e, dps * 0.1, w.super ? '#f84' : '#8ff', w.id);
              if (!w.super) {
                applyFreeze(e, w.evolved ? 1.8 : 1.2, 0.55);
                e.slowT = Math.max(e.slowT || 0, 0.4);
              }
            }
          }
        }
      }
      // INFERNO BEAM: rake the cone and leave two lingering fire walls.
      if (w.super) {
        w.wallCd = (w.wallCd || 0) - dt;
        if (w.wallCd <= 0) {
          w.wallCd = 0.4;
          for (const dd of [0.45, 0.8]) {
            const a = w.aimA + rand(-aperture / 2, aperture / 2);
            hazards.push({ type: 'fireWall', x: player.x + Math.cos(a) * range * dd, y: player.y + Math.sin(a) * range * dd, t: 3.0, r: 32, damage: dps * 0.06 });
          }
          if (hazards.length > 120) hazards.splice(0, hazards.length - 120);
        }
      }
      continue;
    }

    w.cd = (w.cd || 0) - dt;
    if (w.cd > 0) continue;

    const baseCd = def.cds ? def.cds[w.level - 1] : 1.5;
    w.cd = baseCd * player.cdMul * heatCdMul;

    if (w.id === 'bolt') {
      const cnt = def.count[w.level - 1];
      const dmg = def.damages[w.level - 1] * heatDmgMul;
      const prc = def.pierces[w.level - 1];
      const target = nearestEnemy(player.x, player.y, 600);
      const baseAng = target ? angleTo(player, target) : (player.ang || 0);
      if (w.super) {
        // MEGALODON OVERCHARGE: triple spectral jaws — fan of 3 boomerang blades.
        // Budgeted: the blade update loop's per-enemy Set scan is O(N) alloc per
        // blade per frame at pierce=99; a shared cap keeps the sim honest.
        let blades = 0;
        for (const q of projectiles) if (q.isMegalodonBlade) blades++;
        for (let i = 0; i < 3 && blades < 6; i++, blades++) {
          const a = baseAng + (i - 1) * 0.22;
          pushProjectile({
            x: player.x, y: player.y,
            vx: Math.cos(a) * 0, vy: Math.sin(a) * 0,
            r: 12, damage: dmg * superDmgMul, pierce: 99, life: 3.2, color: '#ffd700', weaponId: w.id,
            isMegalodonBlade: true, startX: player.x, startY: player.y, ang: a,
            maxDist: 380, speed: 620,
          });
        }
      } else {
        for (let i = 0; i < cnt; i++) {
          const spread = cnt === 2 ? 0.08 : 0.18;
          const a = baseAng + (cnt > 1 ? (i - (cnt - 1) / 2) * spread : 0);
          pushProjectile({
            x: player.x, y: player.y,
            vx: Math.cos(a) * 550, vy: Math.sin(a) * 550,
            r: cnt === 2 ? 6 : 4, damage: dmg, pierce: prc, life: 1.2, color: '#4ff', weaponId: w.id,
          });
        }
      }
      AudioSys.SFX.shoot();
    } else if (w.id === 'nova') {
      const dmg = def.damages[w.level - 1] * heatDmgMul;
      const maxR = def.radii[w.level - 1];
      pushShockwave({ x: player.x, y: player.y, r: 10, maxR, speed: 650, damage: dmg, nova: true, knock: true });
      AudioSys.SFX.nova();
    } else if (w.id === 'tesla') {
      const dmg = def.damages[w.level - 1] * heatDmgMul;
      const maxChains = def.chains[w.level - 1];
      const firstTarget = nearestEnemy(player.x, player.y, 450);
      if (firstTarget) {
        spawnLightning(player.x, player.y, firstTarget.x, firstTarget.y);
        damageEnemy(firstTarget, dmg, '#8ff', w.id);
        applyShock(firstTarget, 2.0, 22);
        let current = firstTarget;
        const hitSet = new Set([firstTarget]);
        for (let c = 1; c < maxChains; c++) {
          let next = null, bd = 200 * 200;
          for (const e of enemies) {
            if (hitSet.has(e) || e.spawnT > 0) continue;
            const d2 = (e.x - current.x) ** 2 + (e.y - current.y) ** 2;
            if (d2 < bd) { bd = d2; next = e; }
          }
          if (next) {
            hitSet.add(next);
            spawnLightning(current.x, current.y, next.x, next.y);
            damageEnemy(next, dmg * 0.8, '#8ff', w.id);
            applyShock(next, 2.0, 18);
            current = next;
          } else break;
        }
        AudioSys.SFX.tesla();
      }
    } else if (w.id === 'lance') {
      const dmg = def.damages[w.level - 1] * heatDmgMul;
      const target = nearestEnemy(player.x, player.y, 800);
      const a = target ? angleTo(player, target) : (player.ang || 0);
      pushProjectile({
        x: player.x, y: player.y,
        vx: Math.cos(a) * 1100, vy: Math.sin(a) * 1100,
        r: 6, damage: dmg, pierce: 99, life: 1.5, color: '#f4f', weaponId: w.id,
      });
      AudioSys.SFX.lance();
    } else if (w.id === 'plasma') {
      const dmg = def.damages[w.level - 1] * heatDmgMul * superDmgMul;
      const pullR = def.pulls[w.level - 1];
      const target = nearestEnemy(player.x, player.y, 700);
      const a = target ? angleTo(player, target) : (player.ang || 0);
      // Suite-perf guard: each singularity runs an O(N) gravity pass per frame;
      // cap concurrent spheres so MAX_ENEMIES soaks can't quadratic-lock the sim.
      let singular = 0;
      for (const q of projectiles) if (q.isPlasmaSingularity) singular++;
      if (singular < 3) pushProjectile({
        x: player.x, y: player.y,
        vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
        r: def.radii[w.level - 1], damage: dmg, pierce: 99, life: 3.5,
        color: w.super ? '#00ffff' : '#a6f', weaponId: w.id,
        isPlasmaSingularity: true, pullR: pullR, super: w.super
      });
      AudioSys.SFX.nova();
    } else if (w.id === 'beam') {
      const dmg = def.damages[w.level - 1] * heatDmgMul * superDmgMul;
      const target = nearestEnemy(player.x, player.y, def.ranges[w.level - 1]);
      const a = target ? angleTo(player, target) : (player.ang || 0);
      const beamR = def.ranges[w.level - 1];
      for (const e of enemies) {
        if (e.spawnT > 0) continue;
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d <= beamR + e.r) {
          const aToE = Math.atan2(e.y - player.y, e.x - player.x);
          let diff = aToE - a;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          if (Math.abs(diff) <= def.arcs[w.level - 1] / 2) {
            damageEnemy(e, dmg, w.super ? '#ffff00' : '#ff4400', w.id);
            if (w.super) e.burnT = Math.max(e.burnT || 0, 1.2);
          }
        }
      }
      pushShockwave({ x: player.x, y: player.y, r: 10, maxR: beamR, speed: 1200, damage: 0, cosmetic: true, color: w.super ? '#ffff00' : '#ff4400' });
      AudioSys.SFX.lance();
    } else if (w.id === 'drones') {
      const cnt = def.count[w.level - 1];
      const dmg = def.damages[w.level - 1] * heatDmgMul;
      for (let i = 0; i < cnt; i++) {
        const a = rand(0, TAU);
        pushProjectile({
          x: player.x, y: player.y,
          vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
          r: 4, damage: dmg, pierce: 0, homing: true, homingT: 1.2, life: 1.8, color: '#fa4', weaponId: w.id,
        });
      }
      AudioSys.SFX.drone();
    }
  }
}

function spawnLightning(x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const segments = Math.max(3, Math.floor(dist / 20));
  let curX = x1, curY = y1;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const nxtX = x1 + (x2 - x1) * t + (i < segments ? rand(-12, 12) : 0);
    const nxtY = y1 + (y2 - y1) * t + (i < segments ? rand(-12, 12) : 0);
    pushParticle({ type: 'shard', x: (curX + nxtX) / 2, y: (curY + nxtY) / 2, vx: 0, vy: 0, life: 0.15, maxLife: 0.15, color: '#8ff', size: 3 });
    curX = nxtX; curY = nxtY;
  }
}

function spawnGem(x, y, value) {
  if (gems.length >= MAX_GEMS) return;
  gems.push({ type: 'gem', x, y, value: value || 1, bobT: rand(0, TAU), age: 0 });
}

function spawnPickup(type, x, y) {
  if (gems.length >= MAX_GEMS) return;
  gems.push({ type, x, y, value: 0, bobT: rand(0, TAU), age: 0 });
}

function updatePickups(dt) {
  // WS-6: track gems surging under magnet pull this frame (for siphon tendrils)
  // and a 1s EMA of absorb rate driving the gemVacuum pitch ramp.
  _surgeCount = 0;
  _absorbedThisSec += dt;
  if (_absorbedThisSec >= 1) {
    _gemAbsorbRate = _gemAbsorbRate * 0.5 + _gemAbsorbCount * 0.5;
    _gemAbsorbCount = 0;
    _absorbedThisSec = 0;
  }
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    g.bobT += dt * 3;
    g.age = (g.age || 0) + dt;
    const d2 = dist2(g, player);
    const reach = player.magnet + (g.type !== 'gem' ? 60 : 0);
    g._surge = false;

    // Instant XP collection: gems immediately vacuum to the player with zero delay.
    // Aged gems (>6s on the ground) get a speed floor so stragglers never stall.
    const autoVacuum = g.type === 'gem';
    if (autoVacuum || d2 < reach * reach) {
      const d = Math.sqrt(d2);
      let base = Math.max(750, 1100 - d * 0.8) + player.magnetSurge * 260;
      if (autoVacuum && g.age > 6) base = Math.max(base, 1200);
      g.x += (player.x - g.x) / (d || 1) * base * dt;
      g.y += (player.y - g.y) / (d || 1) * base * dt;
      // WS-6: this gem is actively surging — flag it for tendril rendering (cap 24/frame).
      if (_surgeCount < 24) { g._surge = true; _surgeCount++; }
    }

    const pr = player.r + 8;
    if (dist2(g, player) < pr * pr) {
      gems.splice(i, 1);
      if (g.type === 'gem') {
        gemsCollected += g.value;
        const xpEarned = g.value * (1 + player.xpBonus);
        player.xp += xpEarned;
        if (player.magnetSurge > 0 && typeof achievementsData !== 'undefined') {
          achievementsData.stats.surgePulled += g.value;
          if (achievementsData.stats.surgePulled === 100 || achievementsData.stats.surgePulled % 200 === 0) saveAchievements();
        }
        if (g.value >= 5) addFloatText(g.x, g.y, '+' + Math.round(xpEarned) + ' XP', '#4ff');
        if (AudioSys.SFX.gem) AudioSys.SFX.gem();
        // 7.4 Vacuum dopamine: scaled sparkle SFX + a tiny absorb pop so streamed-in
        // gems still feel like individual pickups instead of silent counter bumps.
        _gemAbsorbCount++;
        if (AudioSys.SFX.gemVacuum) AudioSys.SFX.gemVacuum(g.value, 1 + Math.min(1.5, _gemAbsorbRate * 0.25));
        // WS-A combo feed: absorbing gems while a combo is live extends the window
        // (never starts one, caps at full) — collection sustains kill flow.
        if (comboTimer > 0) comboTimer = Math.min(2.0, comboTimer + 0.07);
        if (g.value >= 4) {
          pushParticle({ type: 'shard', x: g.x, y: g.y, vx: rand(-90, 90), vy: rand(-90, 90), life: 0.28, maxLife: 0.28, color: g.value >= 8 ? '#fa4' : '#4ff', size: rand(2, 4) });
        }
        if (player.xp >= player.xpNeed) {
          levelUp();
        }
      } else if (g.type === 'heart') {
        player.hp = Math.min(player.maxHp, player.hp + 30);
        addFloatText(g.x, g.y, '+30 HP', '#f66');
        if (AudioSys.SFX.heart) AudioSys.SFX.heart();
      } else if (g.type === 'shock') {
        pushShockwave({ x: player.x, y: player.y, r: 10, maxR: 450, speed: 1200, damage: 60, nova: true, knock: true });
        if (AudioSys.SFX.shockwave) AudioSys.SFX.shockwave();
        } else if (g.type === 'overcharge') {
          // OVERCHARGE PICKUP: Instantly grants 2.5s of maximum weapon heat + 50% damage boost
          for (const w of player.weapons) w.heat = 1.0;
          showFloatingShard('⚡ MAX OVERCHARGE ⚡');
          addFloatText(g.x, g.y, 'OVERCHARGE!', '#ff4', true);
          if (AudioSys.SFX.milestone) AudioSys.SFX.milestone();
          pushShockwave({ x: player.x, y: player.y, r: 10, maxR: 240, speed: 1000, damage: 80, nova: true, color: '#ff4' });
        } else if (g.type === 'warp') {
          // WARP ANOMALY: Teleports player safely 400px away towards open space + freezes screen foes for 2s
          const freeAng = rand(0, TAU);
          player.x += Math.cos(freeAng) * 350;
          player.y += Math.sin(freeAng) * 350;
          for (const e of enemies) { applyFreeze(e, 2.0); }
          showFloatingShard('🌀 SPACE WARP!');
          addFloatText(player.x, player.y, 'WARPED & FROZEN', '#4ff', true);
          if (AudioSys.SFX.phantomBlink) AudioSys.SFX.phantomBlink();
          pushShockwave({ x: player.x, y: player.y, r: 10, maxR: 160, speed: 800, cosmetic: true, color: '#4ff' });
        } else if (g.type === 'chest') {
        // 7.8 Supply chest → POWER-UP CHOICE (non-blocking). Reuses the level-up
        // dock so the run never pauses. If the dock is busy (level-up live) or the
        // run isn't active, fall back to the legacy shard grant so no loot is lost.
        if (state === 'playing' && !levelupOpen) {
          presentChestChoices();
        } else {
          const earned = randInt(15, 30);
          meta.shards += earned;
          saveMeta();
          showFloatingShard(`CHEST! +${earned} SHARDS 💎`);
          if (AudioSys.SFX.chest) AudioSys.SFX.chest();
        }
      } else if (g.type === 'shield') {
        player.shield = { hits: 1, t: 7.0 };
        showFloatingShard('◈ SHIELD ACTIVE ◈');
        addFloatText(player.x, player.y - 24, '+SHIELD 7s', '#4df');
        if (AudioSys.SFX.magnet) AudioSys.SFX.magnet();
        pushShockwave({ x: player.x, y: player.y, r: 6, maxR: 60, speed: 500, damage: 0, cosmetic: true, color: '#4df' });
      } else if (g.type === 'nuke') {
        // NUKE! Clear all non-boss enemies on screen with massive explosion
        showFloatingShard('☢ NUKE DETONATED! ☢');
        if (AudioSys.SFX.bossRoar) AudioSys.SFX.bossRoar();
        if (AudioSys.SFX.shockwave) AudioSys.SFX.shockwave();
        shake = Math.max(shake, 30);
        hitStop = Math.max(hitStop, 0.5);
        // Massive expanding shockwave from player
        pushShockwave({ x: player.x, y: player.y, r: 20, maxR: 2000, speed: 1600, damage: 99999, nova: true, knock: true });
        // Kill all non-boss enemies
        let nukeKills = 0;
        for (let k = enemies.length - 1; k >= 0; k--) {
          const ne = enemies[k];
          if (ne.boss) continue;
          if (ne.spawnT > 0) continue;
          // Explosion particles per enemy
          for (let p = 0; p < 6; p++) {
            pushParticle({ type: 'shard', x: ne.x, y: ne.y, vx: rand(-300, 300), vy: rand(-300, 300), life: 0.5, maxLife: 0.5, color: pick(['#f0f', '#ff4', '#f44', '#fff']), size: rand(2, 5) });
          }
          damageEnemy(ne, 99999, '#f0f', 'nuke');
          nukeKills++;
        }
        // Central explosion burst
        for (let p = 0; p < 60; p++) {
          const a = rand(0, TAU);
          const sp = rand(200, 600);
          pushParticle({ type: 'shard', x: player.x, y: player.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 0.9), maxLife: 0.9, color: pick(['#f0f', '#ff4', '#f44', '#fff', '#4ff']), size: rand(3, 7) });
        }
        addFloatText(player.x, player.y - 40, `NUKE! ${nukeKills} KILLED!`, '#f0f', true);
      }
    }
  }
}

// ---------------- Helper & System Actions ----------------
// WS-4 fever lifecycle. Enter/exit toggle the overlay class once; updateFever
// only counts down sim-time and fires the exit detonation. cdMul is reassigned
// (never compounding) so re-entrant thresholds within one 5s window refresh the
// timer without stacking multipliers.
function enterFever(nowCombo) {
  feverMode = true;
  feverTimer = FEVER_DURATION;
  if (!feverApplied) { player.cdMul *= FEVER_CD_MUL; feverApplied = true; }
  if (!_feverOverlayEl) _feverOverlayEl = $('game-container');
  if (_feverOverlayEl && _feverOverlayEl.classList) _feverOverlayEl.classList.add('fever-overlay');
  AudioSys.SFX.feverStart?.();
  addFloatText(player.x, player.y - 84, '★ STAR OVERDRIVE ★', '#f0f', true);
  shake = Math.max(shake, 10);
}
function exitFever() {
  feverMode = false;
  feverTimer = 0;
  if (feverApplied) { player.cdMul /= FEVER_CD_MUL; feverApplied = false; }
  if (_feverOverlayEl && _feverOverlayEl.classList) _feverOverlayEl.classList.remove('fever-overlay');
  pushShockwave({ x: player.x, y: player.y, r: 12, maxR: 300, speed: 1400, damage: 120, knock: true, color: '#f0f' });
  AudioSys.SFX.shockwave?.();
  for (const e of enemies) {
    if (e.spawnT > 0) continue;
    const a = Math.atan2(e.y - player.y, e.x - player.x);
    e.vx += Math.cos(a) * 900; e.vy += Math.sin(a) * 900;
  }
  addFloatText(player.x, player.y - 64, 'DETONATION!', '#ff4', true);
  shake = Math.max(shake, 16);
}
function updateFever(dt) {
  if (!feverMode) return;
  feverTimer -= dt;
  if (feverTimer <= 0) exitFever();
}

function registerKill(e) {
  kills++;
  if (comboTimer > 0) combo++; else combo = 1;
  comboTimer = 2.0;
  if (combo > comboBest) comboBest = combo;

  // Combo-tier juice: distinct escalating streak callouts at 10/25/50/100/250/500
  // (separate from the kill-count milestones below — pitch rises with tier)
  for (let ct = 0; ct < COMBO_TIERS.length; ct++) {
    if (combo === COMBO_TIERS[ct]) {
      AudioSys.SFX.comboUp(ct + 1);
      addFloatText(player.x, player.y - 52, 'STREAK x' + combo + ' 🔥', '#fa4', combo >= 100);
      shake = Math.max(shake, combo >= 100 ? 7 : 3);
      // WS-E milestone feed: at 25/50/100 combo, the run's top-kill weapon banks a
      // permanent +5% damage for the rest of the run (capped +15%, additive to heat).
      if (combo === 25 || combo === 50 || combo === 100) {
        const w = player.weapons.find(wp => wp.id === topKillWeaponId());
        if (w) {
          w.milestoneBoost = Math.min(0.15, (w.milestoneBoost || 0) + 0.05);
          if (AudioSys.SFX.milestone) AudioSys.SFX.milestone();
          addFloatText(player.x, player.y - 64, `${WEAPON_DEFS[w.id].name} +5% DMG (RUN)`, '#ff4', true);
        }
      }
      break;
    }
  }

  // WS-4 fever trigger: crossing 100x/250x/500x (once per run each) ignites Neon Fever.
  if ((combo === 100 || combo === 250 || combo === 500) && !feverHit[combo]) {
    feverHit[combo] = true;
    enterFever(combo);
  }

  const isBoss = e && (e.boss || (e.type && e.type.startsWith('boss')));
  if (typeof achievementsData !== 'undefined') {
    achievementsData.stats.totalKills++;
    if (isBoss) achievementsData.stats.bossKills++;
    achievementsData.stats.maxCombo = Math.max(achievementsData.stats.maxCombo, combo);
    saveAchievements();
    checkAchievements();
  }

  if (killMilestone < KILL_MILESTONES.length && kills >= KILL_MILESTONES[killMilestone]) {
    const target = KILL_MILESTONES[killMilestone];
    killMilestone++;
    // Milestone chords escalate with size: huge runs get the extra shimmer layer
    (target >= 500 ? AudioSys.SFX.milestoneBig : AudioSys.SFX.milestone)();
    const bonusXp = target * 0.5;
    player.xp += bonusXp;
    addFloatText(player.x, player.y - 40, `★ MILESTONE ${target} KILLS! +${bonusXp} XP ★`, '#ff4', true);
    showFloatingShard(`★ MILESTONE: ${target} KILLS! (+${bonusXp} XP) ★`);
    if (player.xp >= player.xpNeed) levelUp();
    shake = Math.max(shake, 10);
    hitStop = Math.max(hitStop, 0.1);
  }
}

function levelUp() {
  player.level++;
  player.xp = 0;
  player.xpNeed = Math.floor(player.xpNeed * 1.35 + 4);
  if (typeof achievementsData !== 'undefined') {
    achievementsData.stats.maxLevel = Math.max(achievementsData.stats.maxLevel, player.level);
    saveAchievements();
    checkAchievements();
  }
  if (AudioSys.SFX.levelup) AudioSys.SFX.levelup();
  // WS-6: gem-splosion — cosmetic radial burst of 20 golden shards around the player
  // (particle pool is capped; pushParticle sheds oldest, so this stays frame-safe).
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU + rand(-0.15, 0.15);
    const sp = rand(220, 480);
    pushParticle({ type: 'shard', x: player.x + Math.cos(a) * 10, y: player.y + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 0.7), maxLife: 0.7, color: i % 5 === 0 ? '#fff' : '#ffd700', size: rand(2.5, 4.5) });
  }
  pushShockwave({ x: player.x, y: player.y, r: 8, maxR: 90, speed: 520, damage: 0, cosmetic: true, color: '#ffd700' });
  pendingLevels++;
  // Non-blocking: surface (or refresh) the level-up dock while gameplay continues.
  // If a choice is already on screen, the pending count simply stacks and the
  // next choice is presented right after the current one resolves.
  if (state === 'playing') {
    if (!levelupOpen) presentLevelUpChoices();
    else updateLevelupBadge();
  }
  // If the run isn't actively simulating (death/pause/menu mid-queue), the level
  // banks in pendingLevels and is re-presented by resumeLevelUpQueue() the moment
  // the run resumes — the queue can no longer strand the player on a dead dock.
}

// Re-present any banked level-up offers once a run is (re)entered. Covers the
// resume/continue seams levelUp() can't reach when state !== 'playing'.
function resumeLevelUpQueue() {
  if (state === 'playing' && pendingLevels > 0 && !levelupOpen) presentLevelUpChoices();
}

// ---------------- Level-Up Card System ----------------
// Builds the levelup card pool from the *live* player build, so weapon cards
// only appear for owned weapons (and unavailable once a weapon hits L5) and the
// new-weapon slot respects the WEAPON_DEFS registry. All choices are seeded
// deterministic via pick()/rand() so daily runs replay identically.
function buildLevelUpPool() {
  const pool = [];
  for (const w of player.weapons) {
    if (w.level < 5) {
      const def = WEAPON_DEFS[w.id];
      pool.push({ kind: 'weapon', id: w.id, icon: def.icon, name: def.name, desc: `Upgrade to L${w.level + 1}`, weight: 3 });
    }
  }
  const OWNED = new Set(player.weapons.map(w => w.id));
  const NEWABLE = Object.keys(WEAPON_DEFS).filter(id => !OWNED.has(id));
  if (NEWABLE.length && player.weapons.length < 6) {
    const nid = pick(NEWABLE);
    pool.push({ kind: 'newWeapon', id: nid, icon: WEAPON_DEFS[nid].icon, name: WEAPON_DEFS[nid].name, desc: 'NEW: ' + WEAPON_DEFS[nid].desc, weight: 2 });
  }
  // Rebalanced: raw-shard economy pulls LUCK far ahead of every other stat (DPS is
  // king for the first ~25 levels, then flat defensive HP gains sharply outscale).
  // dmg/cd punched up, hp/spd nudged down, luck grounded — narrows the tier spread
  // so off-meta picks are viable instead of noob-traps. See balance notes.
  const stats = [
    { kind: 'stat', id: 'dmg', icon: '⚔', name: 'AMPLIFIER', desc: '+14% weapon damage', apply: () => { player.weaponDamageMul *= 1.14; } },
    { kind: 'stat', id: 'cd', icon: '⏱', name: 'OVERCLOCK', desc: '-9% weapon cooldowns', apply: () => { player.cdMul *= 0.91; } },
    { kind: 'stat', id: 'hp', icon: '❤', name: 'HULL PLATE', desc: '+16 Max HP & heal 16', apply: () => { player.maxHp += 16; player.hp = Math.min(player.maxHp, player.hp + 16); } },
    { kind: 'stat', id: 'spd', icon: '≫', name: 'THRUSTERS', desc: '+5% move speed', apply: () => { player.speed = Math.round(player.speed * 1.05); } },
    { kind: 'stat', id: 'mag', icon: '◇', name: 'MAGNET COIL', desc: '+22% pickup range', apply: () => { player.magnet = Math.round(player.magnet * 1.22); } },
    { kind: 'stat', id: 'armor', icon: '⛨', name: 'AEGIS', desc: '+1 armor', apply: () => { player.armor += 1; } },
    { kind: 'stat', id: 'regen', icon: '✚', name: 'NANOBOTS', desc: '+0.8 HP/s regen', apply: () => { player.regen += 0.8; } },
    { kind: 'stat', id: 'crit', icon: '!', name: 'TARGET LOCK', desc: '+5% crit chance', apply: () => { player.critChance += 0.05; } },
    { kind: 'stat', id: 'luck', icon: '☘', name: 'LUCK MODULE', desc: '+1 luck (rarer drops)', apply: () => { player.luck += 1; } },
    // AUTO-FORGE: kills now also charge free weapon auto-levels. Each rank lowers
    // the kills-to-level threshold and widens the overcharge burst on proc.
    { kind: 'stat', id: 'forge', icon: '⚙', name: 'AUTO-FORGE', desc: player.forgeKills < 0 ? 'Kills charge FREE weapon auto-levels' : 'Forge: faster auto-levels + bigger overcharge', apply: () => {
      player.forgeRank = (player.forgeRank || 0) + 1;
      if (player.forgeKills < 0) player.forgeKills = 0; // unlock on first pick
    } },
  ];
  for (const s of stats) pool.push({ ...s, weight: 1 });
  // W2: neural vacuum — forego the "drop dwell" so every gem streams home instantly,
  // and widen the base pickup radius each rank.
  pool.push({ kind: 'stat', id: 'surge', icon: '🌀', name: 'VOID VACUUM', desc: 'Gems seek instantly · +18% pickup range', weight: 1, apply: () => { player.magnetSurge += 1; player.magnet = Math.round(player.magnet * 1.18); } });
  // W3: nanite auto-forge — every 40s the ship's fabricator upgrades your least-leveled
  // weapon for free. More ranks shorten the cycle. Never crosses into an evolution.
  pool.push({ kind: 'stat', id: 'forge', icon: '🛠', name: 'NANITE AUTO-FORGE', desc: 'Auto-upgrades a weapon every 40s (-6s per rank owned)', weight: 1, apply: () => { player.autoForge += 1; player._forgeClock = player._forgeClock || 2; } });
  return pool;
}

// W3: pick the least-leveled, non-evolving weapon and bump it one level.
// Respects the L4→L5 evolution sanctity (evolutions only ever come from card picks).
// Returns the upgraded weapon instance, or null when nothing is eligible.
function autoForgeUpgrade() {
  const cand = player.weapons.filter(w => w.level < 5 && !(w.level === 4 && !w.evolved));
  if (!cand.length) return null;
  cand.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
  const w = cand[0];
  w.level = Math.min(5, w.level + 1);
  return w;
}

function weightedSample(pool, n) {
  // Weight-agnostic: missing/NaN/negative weights normalize to 1 so pool items
  // can never produce a NaN total (which previously soft-locked the sampler on
  // the supply-chest pool and ate the level-up offer behind it).
  const out = [];
  const bag = pool.slice();
  const wOf = (c) => (Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 1);
  while (out.length < n && bag.length) {
    let total = 0;
    for (const c of bag) total += wOf(c);
    let r = rand(0, total);
    let idx = 0;
    for (; idx < bag.length; idx++) { r -= wOf(bag[idx]); if (r <= 0) break; }
    idx = Math.min(idx, bag.length - 1);
    out.push(bag.splice(idx, 1)[0]);
  }
  return out;
}

// Smart auto-pick priority: weapon upgrades > stat buffs > (never auto-pick a
// new weapon — that choice changes build identity and should stay deliberate).
// Crisis override: at low HP, defensive stats (hp/armor/regen) outrank weapons.
function autoPickPriority(c) {
  const hpPct = player.hp / player.maxHp;
  if (c.kind === 'stat' && (c.id === 'hp' || c.id === 'armor' || c.id === 'regen') && hpPct < 0.35) return 4;
  if (c.kind === 'weapon') return 3;
  if (c.kind === 'stat')   return 2;
  return 1;
}

// WS-B badge node cached at module level; re-resolve lazily if absent (harness-safe).
let levelupPendingEl = $('levelup-pending');
function updateLevelupBadge() {
  if (!levelupPendingEl) levelupPendingEl = $('levelup-pending');
  if (!levelupPendingEl) return;
  if (pendingLevels > 1) {
    levelupPendingEl.textContent = 'Lv +' + (pendingLevels - 1);
    levelupPendingEl.classList.remove('hidden');
  } else {
    levelupPendingEl.classList.add('hidden');
  }
}

// WS-B offer lifecycle. DOM writes happen HERE (offer-open) and on pick only —
// never per frame. Offer state lives in module vars so the sim stays hot.
function presentLevelUpChoices() {
  if (pendingLevels <= 0) return;
  // Gameplay is NOT paused — the dock floats at the left edge while the run continues.
  const count = clamp(2 + (player.level >= 10 ? 1 : 0) + (player.level >= 25 ? 1 : 0), 2, 4);
  const choices = weightedSample(buildLevelUpPool(), count);
  // Maxed-build guard: an empty pool (all weapons L5, etc.) used to open an
  // empty dock that never resolved — the run looked stuck. Consume the level
  // immediately and chain/dismiss instead of surfacing a dead offer.
  if (!choices.length) {
    pendingLevels--;
    addFloatText(player.x, player.y - 30, 'LEVEL ' + player.level + ' — MAXED', '#889', false);
    if (pendingLevels > 0) presentLevelUpChoices();
    else dismissLevelupUI();
    return;
  }
  levelupChoices = choices;
  levelupTimer = 8.0;            // auto-pick fallback (spec: ~8s, first card)
  levelupOpen = true;
  const cardsEl = ui.cards;
  if (cardsEl) {
    while (cardsEl.firstChild) cardsEl.removeChild(cardsEl.firstChild);
    for (let ci = 0; ci < choices.length; ci++) {
      const c = choices[ci];
      const el = document.createElement('div');
      el.className = 'card' + (c.kind === 'newWeapon' ? ' new-card' : '');
      const lvlTag = c.kind === 'weapon' ? `<div class="lvl">LEVEL ${(player.weapons.find(w => w.id === c.id) || {}).level + 1}</div>` : (c.kind === 'newWeapon' ? '<div class="lvl">NEW WEAPON</div>' : '');
      el.innerHTML = `<div class="keycap">${ci + 1}</div><div class="icon">${c.icon}</div><div class="name">${c.name}</div><div class="desc">${c.desc}</div>${lvlTag}`;
      el.onclick = () => { applyLevelUpChoice(c); };
      cardsEl.appendChild(el);
    }
  }
  if (!ui.levelupHud) ui.levelupHud = $('levelup-hud');
  if (ui.levelupHud) ui.levelupHud.classList.remove('hidden');
  if (ui.hud) ui.hud.classList.remove('hidden');
  updateLevelupBadge();
}

function dismissLevelupUI() {
  levelupOpen = false;
  levelupChoices = [];
  levelupTimer = 0;
  if (!ui.levelupHud) ui.levelupHud = $('levelup-hud');
  if (ui.levelupHud) ui.levelupHud.classList.add('hidden');
  const chestOverlay = ui.levelup || $('levelup-screen');
  if (chestOverlay) chestOverlay.classList.add('hidden');
}

function applyLevelUpChoice(c) {
  if (!c) return;
  if (c.kind === 'weapon' || c.kind === 'newWeapon') addWeapon(c.id);
  else if (c.kind === 'stat') c.apply();
  if (AudioSys.SFX.evolve) AudioSys.SFX.evolve();
  addFloatText(player.x, player.y - 30, c.name + '!', '#4ff', true);
  pendingLevels--;
  if (pendingLevels > 0) presentLevelUpChoices(); // chain queued level-ups
  else dismissLevelupUI();
  if (typeof checkAchievements === 'function') checkAchievements();
}

// ---------------- 7.8 Supply Chest Power-Up Choice ----------------
function buildChestPool() {
  // All chest choices equal-weight (1) — sampled uniformly via weightedSample().
  return [
    { kind: 'chest', id: 'heal',    icon: '❤', name: 'FIELD REPAIR',  desc: 'Restore 45% Max HP', weight: 1, apply: () => { player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.45); }, chest: true },
    { kind: 'chest', id: 'shards',  icon: '💎', name: 'SHARD CACHE',  desc: '+40 Star Shards (scales with depth)', weight: 1, apply: () => { meta.shards += Math.round(40 + player.level * 2.5); saveMeta(); }, chest: true },
    { kind: 'chest', id: 'overclk', icon: '⚡', name: 'OVERCHARGE',   desc: '-11% weapon cooldowns', weight: 1, apply: () => { player.cdMul *= 0.89; }, chest: true },
    { kind: 'chest', id: 'glass',   icon: '⚔', name: 'POWER SURGE',   desc: '+16% weapon damage', weight: 1, apply: () => { player.weaponDamageMul *= 1.16; }, chest: true },
    { kind: 'chest', id: 'plate',   icon: '⛨', name: 'HULL WEAVE',    desc: '+20 Max HP & heal', weight: 1, apply: () => { player.maxHp += 20; player.hp = Math.min(player.maxHp, player.hp + 20); }, chest: true },
    { kind: 'chest', id: 'magnet',  icon: '◇', name: 'TRACTOR CORE',  desc: '+30% pickup range', weight: 1, apply: () => { player.magnet = Math.round(player.magnet * 1.30); }, chest: true },
    { kind: 'chest', id: 'swift',   icon: '≫', name: 'AFTERBURN',     desc: '+7% move speed', weight: 1, apply: () => { player.speed = Math.round(player.speed * 1.07); }, chest: true },
    { kind: 'chest', id: 'crit',    icon: '!', name: 'DEADEYE',       desc: '+5% crit chance', weight: 1, apply: () => { player.critChance += 0.05; }, chest: true },
  ];
}
function presentChestChoices() {
  const choices = weightedSample(buildChestPool(), 3);
  levelupChoices = choices;
  levelupTimer = 8.0;
  levelupOpen = true;
  ui.cards.innerHTML = '';
  for (let ci = 0; ci < choices.length; ci++) {
    const c = choices[ci];
    const el = document.createElement('div');
    el.className = 'card new-card';
    el.innerHTML = `<div class="keycap">${ci + 1}</div><div class="icon">${c.icon}</div><div class="name">${c.name}</div><div class="desc">${c.desc}</div><div class="lvl">SUPPLY CACHE</div>`;
    el.onclick = () => { applyChestChoice(c); };
    ui.cards.appendChild(el);
  }
  // Legacy modal conflict guard: #levelup-screen is the OLD fog modal used as the
  // chest backdrop; #levelup-hud is the live non-blocking dock. Whale tail-crash
  // guard at frame() tolerates either, but resolving stale handles upfront keeps
  // both paths silent.
  const chestOverlay = ui.levelup || $('levelup-screen');
  if (chestOverlay) { chestOverlay.classList.remove('hidden'); ui.levelup = chestOverlay; }
  const hudDock = ui.levelupHud || $('levelup-hud');
  if (hudDock) hudDock.classList.remove('hidden');
  if (ui.hud) ui.hud.classList.remove('hidden');
  const badge = $('levelup-pending');
  if (badge) { badge.textContent = '◆ CACHE ◆'; badge.classList.remove('hidden'); }
  const timerEl = $('levelup-timer');
  if (timerEl) timerEl.style.width = '100%';
  if (AudioSys.SFX.chest) AudioSys.SFX.chest();
}
function applyChestChoice(c) {
  if (!c) return;
  if (c.apply) c.apply();
  if (AudioSys.SFX.evolve) AudioSys.SFX.evolve();
  addFloatText(player.x, player.y - 30, c.name + '!', '#fa4', true);
  shake = Math.max(shake, 4);
  showFloatingShard('◆ CACHE: ' + c.name.toUpperCase() + ' ◆');
  dismissLevelupUI();
  if (typeof checkAchievements === 'function') checkAchievements();
}

function addWeapon(id) {
  let w = player.weapons.find(x => x.id === id);
  if (w) {
    const prevLevel = w.level;
    w.level = Math.min(5, w.level + 1);
    // 7.5 Weapon-level flavor: every mid-tier level-up fires an element-flavored
    // celebratory burst around the player so upgrading FEELS like a power gain, not
    // a silent % bump. L5 evolve below is the big moment; these are the mid beats.
    // Cosmetic only — no gameplay stats mutated. Seeded pick() so daily runs replay.
    if (w.level > prevLevel && w.level < 5) {
      const def = WEAPON_DEFS[id];
      const elem = def && ELEMENT_INFO[def.element];
      const ecol = elem ? elem.color : '#4ff';
      shake = Math.max(shake, 3 + w.level);            // subtle ramp: L2 < L3 < L4
      hitStop = Math.max(hitStop, 0.06 + w.level * 0.02);
      AudioSys.SFX.levelup && AudioSys.SFX.levelup();
      addFloatText(player.x, player.y - 34, `${(def.name || id).toUpperCase()} L${w.level}`, ecol, true);
      const n = 10 + w.level * 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        pushParticle({ type: 'shard', x: player.x, y: player.y, vx: Math.cos(a) * rand(120, 240), vy: Math.sin(a) * rand(120, 240), life: 0.5, maxLife: 0.5, color: pick([ecol, '#fff', '#ff4']), size: rand(2, 4) });
      }
      pushShockwave({ x: player.x, y: player.y, r: 8, maxR: 60 + w.level * 20, speed: 500, damage: 0, cosmetic: true, color: ecol });
    }
    // Evolve trigger: crossing into max level awakens the weapon
    if (w.level === 5 && prevLevel === 4 && !w.evolved) {
      w.evolved = true;
      const def = WEAPON_DEFS[id];
      showFloatingShard(`${(def.name || id).toUpperCase()} EVOLVED!`);
      AudioSys.SFX.evolve();
      shake = Math.max(shake, 8);
      hitStop = Math.max(hitStop, 0.18);
      for (let i = 0; i < 24; i++) {
        pushParticle({ type: 'shard', x: player.x, y: player.y, vx: rand(-280, 280), vy: rand(-280, 280), life: 0.6, maxLife: 0.6, color: pick(['#4ff', '#f4f', '#ff4', '#fff']), size: rand(2, 5) });
      }
      // WS-3 Tier-6: if the synergy passive is already owned, SUPER OVERCHARGE
      // engages on the same beat (also re-checked every frame in updateWeapons).
      if (def.super && synergyOwned(id)) {
        w.super = true;
        showFloatingShard(`◆◆ SUPER OVERCHARGE: ${def.super.name} ◆◆`);
        shake = Math.max(shake, 14);
        hitStop = Math.max(hitStop, 0.28);
        for (let i = 0; i < 32; i++) {
          pushParticle({ type: 'shard', x: player.x, y: player.y, vx: rand(-380, 380), vy: rand(-380, 380), life: 0.8, maxLife: 0.8, color: pick(def.super.colors), size: rand(3, 6) });
        }
      }
    }
  } else {
    // Defensive cap: UI/perf budget assumes <= 6 weapons. All current sources
    // already gate at <6, but any future addWeapon caller must never overflow.
    if (player.weapons.length >= 6) return w;
    player.weapons.push({ id, level: 1, cd: 0 });
    recordWeaponUnlock(id);
  }
  if (typeof checkAchievements === 'function') checkAchievements();
  return w;
}

// ---------------- WS-1: Precision Dodge (Hyper-Dash Stun) ----------------
// Triggered when the player dashes within 30px of an enemy or hostile projectile.
// Dopamine burst: 0.15s hitstop, 3 ghost trails, EM shockwave that stuns 1.2s.
// Rate-limited to one proc per dash; pooled objects only (no per-frame allocs).
function handlePrecisionDodge() {
  hitStop = Math.max(hitStop, 0.15);
  // 3 fading neon ghost shadows (emulated via zero-velocity shards)
  for (let k = 0; k < 3; k++) {
    pushParticle({ type: 'shard', x: player.x, y: player.y, vx: 0, vy: 0, life: 0.45, maxLife: 0.45, color: '#0ff', size: player.r + k * 2 });
  }
  // EM shockwave: cosmetic ring + stun field (stun applied on ring contact)
  pushShockwave({ x: player.x, y: player.y, r: 10, maxR: 110, speed: 1000, damage: 0, color: '#00ffff', stun: 1.2 });
  addFloatText(player.x, player.y - 34, 'DODGE!', '#0ff', true);
  try { AudioSys.SFX.dodgeStun?.(); } catch (err) {}
}
function triggerPlayerDash() {
  if (player.pactDashLockT > 0) { // WS-5 Adrenaline Void penalty: dash sealed while the lock burns
    addFloatText(player.x, player.y - 24, 'DASH SEALED', '#b6f', false);
    return;
  }
  if (state === 'playing' && player.dashCd <= 0) {
    player.dashT = 0.14; player.dashCd = 2.2; player.iframe = Math.max(player.iframe, 0.22);
    player.dodgeT = 0.4;
    // Dashing shakes off latched leeches
    for (const e of enemies) {
      if (e.latched) { e.latched = false; e.latchDmg = 0; e.latchT = 0; e.latchTick = 0; e.vx += Math.cos(e.ang) * -180; e.vy += Math.sin(e.ang) * -180; }
    }
    AudioSys.SFX.dash();
    if (typeof achievementsData !== 'undefined') {
      achievementsData.stats.totalDashes++;
      saveAchievements();
      checkAchievements();
    }
  }
}

// ---------------- Elemental Status Engine ----------------
function applyBurn(e, duration = 3.0, dps = 18) {
  if (!e || e.hp <= 0) return;
  if (!e.statuses) e.statuses = {};
  const b = e.statuses.burn || { duration: 0, dps: 0, tickCd: 0 };
  b.duration = Math.max(b.duration, duration);
  b.dps = Math.max(b.dps, dps);
  b.tickCd = b.tickCd || 0.2;
  e.statuses.burn = b;
}

function applyFreeze(e, duration = 2.5, slowFactor = 0.45) {
  if (!e || e.hp <= 0) return;
  if (!e.statuses) e.statuses = {};
  const f = e.statuses.freeze || { duration: 0, slowFactor: 0.45, frozen: false };
  f.duration = Math.max(f.duration, duration);
  f.slowFactor = Math.min(f.slowFactor, slowFactor);
  if (f.duration > 1.8) f.frozen = true;
  e.statuses.freeze = f;
  e.slowT = Math.max(e.slowT || 0, duration);
  if (typeof AudioSys !== 'undefined' && AudioSys.SFX && AudioSys.SFX.freezeApply && Math.random() < 0.15) {
    AudioSys.SFX.freezeApply();
  }
}

function applyShock(e, duration = 2.0, dps = 22) {
  if (!e || e.hp <= 0) return;
  if (!e.statuses) e.statuses = {};
  const s = e.statuses.shock || { duration: 0, dps: 0, tickCd: 0 };
  s.duration = Math.max(s.duration, duration);
  s.dps = Math.max(s.dps, dps);
  s.tickCd = s.tickCd || 0.35;
  e.statuses.shock = s;
}

function applyVoidDecay(e, duration = 4.0, vulnerability = 1.35) {
  if (!e || e.hp <= 0) return;
  if (!e.statuses) e.statuses = {};
  const v = e.statuses.voidDecay || { duration: 0, vulnerability: 1.35 };
  v.duration = Math.max(v.duration, duration);
  v.vulnerability = Math.max(v.vulnerability, vulnerability);
  e.statuses.voidDecay = v;
  if (typeof AudioSys !== 'undefined' && AudioSys.SFX && AudioSys.SFX.voidDecay && Math.random() < 0.15) {
    AudioSys.SFX.voidDecay();
  }
}

function updateEnemyStatuses(e, dt) {
  if (!e || e.hp <= 0 || !e.statuses) return;
  const s = e.statuses;

  // --- Burn DoT ---
  if (s.burn && s.burn.duration > 0) {
    s.burn.duration -= dt;
    s.burn.tickCd = (s.burn.tickCd || 0.2) - dt;
    if (s.burn.tickCd <= 0) {
      s.burn.tickCd = 0.2;
      damageEnemy(e, s.burn.dps * 0.2, '#f84');
      if (Math.random() < 0.35) {
        pushParticle({ type: 'shard', x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vx: rand(-30, 30), vy: rand(-60, -10), life: 0.25, maxLife: 0.25, color: '#ff6600', size: rand(1.5, 3) });
      }
    }
  }

  // --- Freeze Slow & Freeze-Solid ---
  if (s.freeze && s.freeze.duration > 0) {
    s.freeze.duration -= dt;
    e.slowT = Math.max(e.slowT || 0, s.freeze.duration);
    if (s.freeze.frozen) {
      e.vx = 0;
      e.vy = 0;
    }
    if (Math.random() < 0.12) {
      pushParticle({ type: 'shard', x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vx: rand(-15, 15), vy: rand(-15, 15), life: 0.2, maxLife: 0.2, color: '#00f0ff', size: rand(1, 2) });
    }
  }

  // --- Shock Micro-Interruption & Chain Discharge ---
  if (s.shock && s.shock.duration > 0) {
    s.shock.duration -= dt;
    s.shock.tickCd = (s.shock.tickCd || 0.35) - dt;
    if (s.shock.tickCd <= 0) {
      s.shock.tickCd = 0.35;
      e.vx *= 0.15;
      e.vy *= 0.15;
      e.hitT = Math.max(e.hitT, 0.08);
      damageEnemy(e, s.shock.dps * 0.35, '#ffea00');
      
      // Chain discharge to up to 2 nearby enemies within 130px
      const candidates = (typeof enemyGrid !== 'undefined' && enemyGrid) ? enemyGrid.query(e.x, e.y, 130) : enemies;
      let chained = 0;
      for (const o of candidates) {
        if (o === e || o.hp <= 0 || o.spawnT > 0) continue;
        const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
        if (d2 < 130 * 130) {
          spawnLightning(e.x, e.y, o.x, o.y);
          damageEnemy(o, s.shock.dps * 0.25, '#ffea00');
          applyShock(o, 1.2, s.shock.dps);
          chained++;
          if (chained >= 2) break;
        }
      }
      if (typeof AudioSys !== 'undefined' && AudioSys.SFX && AudioSys.SFX.shockChain) {
        AudioSys.SFX.shockChain();
      }
    }
  }

  // --- Void Decay Armor Shred ---
  if (s.voidDecay && s.voidDecay.duration > 0) {
    s.voidDecay.duration -= dt;
    if (Math.random() < 0.2) {
      pushParticle({ type: 'shard', x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, maxLife: 0.3, color: '#a855f7', size: rand(1.5, 3) });
    }
  }
}

function drawEnemyStatusRings(e) {
  if (!e || !e.statuses) return;
  const t = bgPulse * 6;
  const radius = e.r;

  // 1. Burn status: Orange pulsing flame ring visual
  if (e.statuses.burn && e.statuses.burn.duration > 0) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 8 + e.x);
    const r = radius + 6 + pulse * 2;
    ctx.save();
    ctx.strokeStyle = '#ff6600';
    ctx.fillStyle = 'rgba(255, 100, 0, 0.15)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.stroke();
    ctx.fill();
    // Flame sparks around ring
    const teeth = 5;
    for (let i = 0; i < teeth; i++) {
      const fa = t * 3 + (i / teeth) * TAU;
      const fx = e.x + Math.cos(fa) * (r + 3 * Math.sin(t * 10 + i));
      const fy = e.y + Math.sin(fa) * (r + 3 * Math.sin(t * 10 + i));
      ctx.fillStyle = i % 2 === 0 ? '#ffaa00' : '#ff3300';
      ctx.fillRect(fx - 1.5, fy - 1.5, 3, 3);
    }
    ctx.restore();
  }

  // 2. Freeze status: Cyan ice ring visual
  if (e.statuses.freeze && e.statuses.freeze.duration > 0) {
    const r = radius + 4;
    ctx.save();
    ctx.strokeStyle = '#00f0ff';
    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.lineWidth = e.statuses.freeze.frozen ? 3 : 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.stroke();
    ctx.fill();
    // Ice crystals on ring
    const spikes = 6;
    for (let i = 0; i < spikes; i++) {
      const sa = (i / spikes) * TAU + (e.statuses.freeze.frozen ? 0 : t * 0.5);
      const sx1 = e.x + Math.cos(sa) * (r - 2);
      const sy1 = e.y + Math.sin(sa) * (r - 2);
      const sx2 = e.x + Math.cos(sa) * (r + 5);
      const sy2 = e.y + Math.sin(sa) * (r + 5);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Shock status: Yellow arc ring visual
  if (e.statuses.shock && e.statuses.shock.duration > 0) {
    const r = radius + 8;
    ctx.save();
    ctx.strokeStyle = '#ffea00';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffea00';
    ctx.shadowBlur = 14;
    const arcs = 4;
    const offset = Math.floor(t * 15) % 4;
    for (let i = 0; i < arcs; i++) {
      if ((i + offset) % 2 === 0) continue;
      const a1 = (i / arcs) * TAU + t * 4;
      const a2 = a1 + (TAU / arcs) * 0.65;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, a1, a2);
      ctx.stroke();
    }
    if (Math.random() < 0.4) {
      const sa = rand(0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(e.x + Math.cos(sa) * r - 1.5, e.y + Math.sin(sa) * r - 1.5, 3, 3);
    }
    ctx.restore();
  }

  // 4. Void Decay status: Purple aura visual
  if (e.statuses.voidDecay && e.statuses.voidDecay.duration > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5 + e.y * 0.1);
    const r = radius + 10;
    ctx.save();
    ctx.strokeStyle = '#a855f7';
    ctx.fillStyle = 'rgba(168, 85, 247, 0.16)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    ctx.shadowColor = '#c084fc';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + pulse * 3, -t * 2, -t * 2 + TAU);
    ctx.stroke();
    ctx.fill();
    ctx.setLineDash([]);
    const motes = 3;
    for (let i = 0; i < motes; i++) {
      const ma = -t * 3 + (i / motes) * TAU;
      const mx = e.x + Math.cos(ma) * (r - 2);
      const my = e.y + Math.sin(ma) * (r - 2);
      ctx.fillStyle = '#e9d5ff';
      ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }
    ctx.restore();
  }
}

// ---------------- Damage & death ----------------
function damageEnemy(e, dmg, color, source) {
  if (!e || e.hp <= 0) return;
  // [WS-2] Boss enrage invulnerability telegraph — incoming hits fully absorbed
  if (e.boss && e.enrageTelegraphT > 0) {
    if (Math.random() < 0.4) pushParticle({ type: 'line', x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), x2: e.x, y2: e.y, life: 0.14, maxLife: 0.14, color: '#aaffff', w: 2 });
    return;
  }
  let finalDmg = dmg;
  // Bulwark frontal shield: hits arriving from the direction it's facing are
  // mostly absorbed. Flanking, piercing AoE, shockwaves, and DoTs (no position
  // angle) bypass it. Rewards repositioning + area weapons.
  if (e.type === 'bulwark' && !e.deadT) {
    const toFx = player.x - e.x, toFy = player.y - e.y;
    const plAng = Math.atan2(toFy, toFx);
    let dd = Math.abs(plAng - (e.facing === undefined ? plAng : e.facing)) % TAU;
    if (dd > Math.PI) dd = TAU - dd;
    if (dd < 1.05) { // within ~60° frontal arc
      finalDmg *= 0.18;
      if (Math.random() < 0.3) pushParticle({ type: 'line', x: e.x + Math.cos(e.facing) * e.r, y: e.y + Math.sin(e.facing) * e.r, x2: e.x + Math.cos(e.facing + 0.5) * (e.r + 10), y2: e.y + Math.sin(e.facing + 0.5) * (e.r + 10), life: 0.12, maxLife: 0.12, color: '#86e', w: 2 });
    }
  }
  // WS-10 Reflective elite affix: 40% chance to deflect incoming hits
  if (e.elite && e.auraType === 'reflective' && Math.random() < 0.40) {
    finalDmg *= 0.3;
    for (let k = 0; k < 3; k++) {
      pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-180, 180), vy: rand(-180, 180), life: 0.2, maxLife: 0.2, color: '#ffea00', size: 2.5 });
    }
  }
  if (e.statuses && e.statuses.voidDecay && e.statuses.voidDecay.duration > 0) {
    finalDmg *= (e.statuses.voidDecay.vulnerability || 1.35);
    if (Math.random() < 0.25) {
      pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-90, 90), vy: rand(-90, 90), life: 0.25, maxLife: 0.25, color: '#c084fc', size: rand(1.5, 3.5) });
    }
  }
  if (typeof activeMutations !== 'undefined' && activeMutations && activeMutations.some(m => m.id === 'void')) {
    applyVoidDecay(e, 4.0, 1.35);
  }
  const crit = srand() < player.critChance;
  const amount = Math.round(finalDmg * player.weaponDamageMul * (crit ? player.critMul : 1));
  e.hp -= amount;
  // WS-5 Soul Tithe: a pact-fed siphon instantly converts a slice of damage dealt into hull
  if (player.pactLifesteal > 0 && amount > 0) {
    player.hp = clamp(player.hp + amount * player.pactLifesteal, 0, player.maxHp);
  }
  e.hitT = 0.08;
  trackWeaponDamage(source || '_unknown', amount, e.hp <= 0);
  addHurtText(e, amount, crit, color);
  if (crit) {
    shake = Math.max(shake, 2);
    AudioSys.SFX.crit();
    for (let ci = 0; ci < 3; ci++) {
      pushParticle({
        type: 'shard', x: e.x, y: e.y,
        vx: rand(-240, 240), vy: rand(-240, 240),
        life: 0.35, maxLife: 0.35, color: '#ff4', size: rand(1, 2.5),
      });
    }
  }
  // Overkill reward: damage far beyond the kill converts into bonus XP
  // (capped, big hits only) — makes high-end builds feel explosive instead of
  // wasteful when they one-shot trash mobs.
  if (e.hp <= 0 && !e.boss) {
    const overkill = -e.hp; // damage beyond lethal
    if (overkill >= 30 && amount >= 40) {
      const bonusXp = Math.min(6, Math.max(1, Math.floor(overkill / 25)));
      player.xp += bonusXp;
      addFloatText(e.x, e.y - 14, 'OVERKILL +' + bonusXp + ' XP', '#ff4');
      if (AudioSys.SFX.overkill) AudioSys.SFX.overkill();
      for (let ok = 0; ok < 4; ok++) {
        pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-320, 320), vy: rand(-320, 320), life: 0.4, maxLife: 0.4, color: '#ff4', size: rand(2, 4) });
      }
      if (player.xp >= player.xpNeed) levelUp();
    }
  }
  for (let i = 0; i < 3; i++) {
    pushParticle({
      type: 'shard', x: e.x, y: e.y,
      vx: rand(-160, 160), vy: rand(-160, 160),
      life: 0.3, maxLife: 0.3, color: color || '#fff', size: rand(1.5, 3.5),
    });
  }
  // Splitter lethal-telegraph: damage that would kill triggers a visible pulse
  // flag for a beat before death-resolution so the player sees the fission coming.
  if (e.type === 'splitter' && e.hp <= 0 && (e.splitGen || 0) < 2) e.splitTele = 0.4;
  if (e.hp <= 0) killEnemy(e, { amount, crit, hpBefore: e.hp + amount });
}

// WS-C killing-blow drama: kd = { amount, crit, hpBefore } of the killing hit.
// Optional — status/boss-scripted kills pass nothing and keep baseline feel.
function killEnemy(e, kd) {
  const _kdOk = !!(kd && kd.amount >= Math.max(1, kd.hpBefore || 1) * 2.5) && !e.boss;
  const _kdCrit = !!(kd && kd.crit);
  const idx = enemies.indexOf(e);
  if (idx >= 0) enemies.splice(idx, 1);
  // W-enemy kill counters drive the new trophy set (weaver/phantom/splitter)
  if (typeof achievementsData !== 'undefined') {
    const S = achievementsData.stats;
    let counted = false;
    if (e.type === 'weaver') { S.weaverKills++; counted = true; }
    else if (e.type === 'phantom') { S.phantomKills++; counted = true; }
    else if (e.type === 'splitter') { S.splitterKills++; counted = true; }
    if (counted) { saveAchievements(); checkAchievements(); }
  }
  // Codex kill tracking
  if (codex.encountered[e.type]) {
    codex.encountered[e.type].kills = (codex.encountered[e.type].kills || 0) + 1;
    if (codex.encountered[e.type].kills % 10 === 0) saveCodex();
  }
  registerKill(e);
  // Cryo Ray shatter: if the enemy was recently slowed by an evolved Freeze Ray, AoE burst
  const frostW = player.weapons.find(w => w.id === 'frost' && w.evolved);
  if (frostW && (e.slowT || 0) > 0) {
    const shatterR = 110;
    for (const o of enemies) {
      if (o.spawnT > 0 || o === e) continue;
      if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < shatterR * shatterR) {
        damageEnemy(o, 40, '#8ff', 'frost');
        o.slowT = Math.max(o.slowT || 0, 0.6);
      }
    }
    pushShockwave({ x: e.x, y: e.y, r: 8, maxR: shatterR, speed: 900, damage: 0, cosmetic: true, frostShatter: true });
    AudioSys.SFX.shatter();
    for (let k = 0; k < 5; k++) pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-200, 200), vy: rand(-200, 200), life: 0.25, maxLife: 0.25, color: '#8ff', size: rand(1.5, 3) });
  }
  (e.elite || e.boss ? AudioSys.SFX.eliteDie : AudioSys.SFX.enemyDie)();
  // WS-C: kill-feel escalation with combo streak (tiers 10/25/50) — shake & shard
  // count scale, hard-clamped (shake<=40, hitStop<=0.12) so 100x streaks stay 60fps.
  const _kdTier = combo >= 50 ? 3 : combo >= 25 ? 2 : combo >= 10 ? 1 : 0;
  AudioSys.SFX.kill?.(_kdTier);
  // Main enemy XP gem drop + extra splatter XP gems
  spawnGem(e.x + rand(-8, 8), e.y + rand(-8, 8), feverMode ? e.xp * FEVER_XP_MUL : e.xp);
  const extraGems = e.boss ? 12 : e.elite ? 6 : randInt(3, 5);
  for (let gIdx = 0; gIdx < extraGems; gIdx++) {
    spawnGem(e.x + rand(-24, 24), e.y + rand(-24, 24), Math.max(1, Math.round((e.xp || 1) * 0.25)));
  }
  const col = e.type === 'dot' ? '#4f8' : e.type === 'tri' ? '#f94' : e.type === 'quad' ? '#c6f' : e.type === 'penta' ? '#f4c' : e.type === 'sniper' ? '#6df' : e.type === 'healer' ? '#6f6' : e.type === 'bomber' ? '#fa2' : e.type === 'weaver' ? '#cfa' : e.type === 'splitter' ? '#bf6' : e.type === 'phantom' ? '#a6f' : e.type === 'bulwark' ? '#86e' : e.type === 'necro' ? '#5d8' : e.type === 'mirage' ? '#f0f' : e.type === 'leech' ? '#6f6' : e.type === 'carrier' ? '#fb4' : '#f66';
  const _killN = (e.boss ? 14 : e.elite ? 6 : 3) + Math.min(_kdTier, 1);
  for (let i = 0; i < _killN; i++) {
    pushParticle({
      type: 'shard', x: e.x, y: e.y,
      vx: rand(-200, 200) * (e.boss ? 1.3 : 1), vy: rand(-200, 200) * (e.boss ? 1.3 : 1),
      life: rand(0.12, 0.28), maxLife: 0.28, color: Math.random() < 0.3 ? '#fff' : col, size: rand(1.5, e.boss ? 4 : 2.5),
    });
  }
  // No shake on normal kills; tiny pulse on elite/boss only
  if (e.boss) shake = Math.max(shake, 4);
  else if (e.elite) shake = Math.max(shake, 2);
  // WS-C overkill burst: killing hit >= 2.5x the enemy's remaining hp detonates the corpse
  if (_kdOk) {
    for (let ob = 0; ob < 4; ob++) {
      pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-300, 300), vy: rand(-300, 300), life: rand(0.18, 0.3), maxLife: 0.3, color: Math.random() < 0.4 ? '#fff' : col, size: rand(2, 3) });
    }
    pushShockwave({ x: e.x, y: e.y, r: 6, maxR: 70, speed: 700, damage: 0, cosmetic: true, color: col });
    hitStop = Math.max(hitStop, 0.05);
    addFloatText(e.x, e.y - e.r - 18, 'OVERKILL!', col, true);
    AudioSys.SFX.overkill?.();
  }
  if (e.boss || e.elite) hitStop = Math.max(hitStop, e.boss ? 0.22 : 0.05);
  if (hitStop > 0.12) hitStop = 0.12;
  // drops
  const rollExtra = srand();
  if (e.elite) spawnPickup('chest', e.x, e.y);
  else if (rollExtra < 0.012 + player.luck) spawnPickup('heart', e.x, e.y);
  else if (rollExtra < 0.019 + player.luck * 1.5) spawnPickup('shock', e.x, e.y);
  // shield pickup: rare drop, very valuable defensively
  else if (rollExtra < 0.029 + player.luck * 1.5) spawnPickup('shield', e.x, e.y);
  // nuke: extremely rare drop (0.3% base + luck bonus), not from bosses
  else if (!e.boss && rollExtra < 0.032 + player.luck * 2) spawnPickup('nuke', e.x, e.y);
  // penta splits into triangles
  if (e.type === 'penta' && !e.boss) {
    for (let i = 0; i < 2; i++) {
      const a = rand(0, TAU);
      spawnEnemy('tri', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14);
    }
  }
  // splitter divides into 2 half-hp minis (gen-capped: 0→1→2, then stops)
  if (e.type === 'splitter' && !e.boss) {
    const gen = e.splitGen || 0;
    if (gen < 2) {
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU);
        const before = enemies.length;
        spawnEnemy('splitter', e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16);
        const m = enemies[enemies.length - 1];
        if (enemies.length > before && m && m.type === 'splitter' && !m.elite) {
          m.splitGen = gen + 1;
          m.hp = m.maxHp = m.maxHp * 0.5;
          m.r = ENEMY_TYPES.splitter.r * Math.pow(0.82, gen + 1);
          m.speed = m.speed * 1.15;
          m.spawnT = 0.25;
        }
      }
      for (let k = 0; k < 4; k++) pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-180, 180), vy: rand(-180, 180), life: 0.22, maxLife: 0.22, color: '#fa7', size: rand(1.5, 3) });
    }
  }
  // bombers detonate
  if (e.type === 'bomber') {
    hazards.push({ type: 'boom', x: e.x, y: e.y, t: 0.5, r: 130, dmg: e.damage * 1.8 });
  }
  // mirage: full blink-out burst (no loot cascade)
  if (e.type === 'mirage') {
    pushShockwave({ x: e.x, y: e.y, r: 4, maxR: 70, speed: 900, damage: 0, cosmetic: true, color: '#f0f' });
  }
  // leech: bile splat
  if (e.type === 'leech') {
    for (let k = 0; k < 3; k++) pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-160, 160), vy: rand(-160, 160), life: 0.2, maxLife: 0.2, color: '#af2', size: rand(1.5, 3) });
  }
  // carrier brood-pop: release remaining brood as swarm + amber burst
  if (e.type === 'carrier' && !e.boss) {
    const pop = Math.min(3, 3 + (e.broods || 0));
    for (let k = 0; k < pop; k++) {
      const a = rand(0, TAU);
      spawnEnemy('swarm', e.x + Math.cos(a) * rand(4, 26), e.y + Math.sin(a) * rand(4, 26));
    }
    pushShockwave({ x: e.x, y: e.y, r: 8, maxR: 96, speed: 800, damage: 0, cosmetic: true, color: '#fb4' });
    AudioSys.SFX.shockwave();
  }
  if (e.type === 'boss3') victory();
  if (e.type === 'boss1' || e.type === 'boss2') spawnPickup('chest', e.x + 30, e.y);
}

function damagePlayer(dmg, quiet) {
  if (player.iframe > 0 && !quiet) return;
  if (quiet) {
    const dmg2 = Math.max(1, Math.round(dmg - player.armor));
    player.hp -= dmg2;
    player.tookDamageThisRun = true;
    if (frameCount % 12 === 0) addFloatText(player.x, player.y - 24, '-' + dmg2, '#b64');
    if (player.hp <= 0) gameOver();
    return;
  }
  // Shield absorbs the hit
  if (player.shield && player.shield.hits > 0 && player.shield.t > 0) {
    player.shield.hits--;
    player.shield.t = Math.min(player.shield.t, 0.01);
    player.iframe = 0.7;
    addFloatText(player.x, player.y - 30, '◈ SHIELD BLOCK', '#4df');
    pushShockwave({ x: player.x, y: player.y, r: 4, maxR: 90, speed: 800, damage: 0, cosmetic: true, color: '#4df' });
    shake = Math.max(shake, 5);
    if (AudioSys.SFX.shockwave) AudioSys.SFX.shockwave();
    if (player.shield.hits <= 0) player.shield = null;
    return;
  }
  const amount = Math.max(1, Math.round(dmg - player.armor));
  player.hp -= amount;
  player.iframe = 0.4;
  player.tookDamageThisRun = true; // for Untouchable achievement
  player.hitPop = 0.16;            // damage pop: brief white-hot recoil flash (drawn in drawPlayer)
  AudioSys.SFX.hurt();
  shake = Math.max(shake, 7);
  hitStop = Math.max(hitStop, 0.04);
  addFloatText(player.x, player.y - 24, '-' + amount, '#f66');
  // recoil shock: tiny directional knockback away from the hit reads impact physically
  pushShockwave({ x: player.x, y: player.y, r: 3, maxR: player.r + 22, speed: 700, damage: 0, cosmetic: true, color: '#f66' });
  if (player.hp <= 0) gameOver();
  // WS-5 Adrenaline Void curse: taking a real hit seals the dash for 4s.
  else if (player.pacts && player.pacts.some(p => p.id === 'adrenaline')) {
    player.pactDashLockT = 4.0;
    addFloatText(player.x, player.y - 46, 'DASH SEALED', '#b6f', false);
  }
}

// ---------------- Particles / texts ----------------
// Hurt-number aggregator: rapid small hits on the same enemy coalesce into a
// single running total instead of spawning a new float text every frame.
// Reduces bitmap layout churn + GC pressure during high-hit-rate weapons
// (Tesla arcs, frost tendrils, swarm contact chips). Crits / big hits bypass
// so they stay punchy and legible.
const HURT_AGG_WINDOW = 0.35;   // seconds to merge consecutive hits
const HURT_AGG_MIN = 12;        // hits below this damage merge; >= shows solo
function addHurtText(e, amount, crit, color) {
  if (crit || amount >= HURT_AGG_MIN) {
    addFloatText(e.x, e.y - e.r - 4, amount, crit ? '#ff4' : (color || '#fff'), crit);
    return;
  }
  const now = time;
  const agg = e.__hurtT;
  // Merge only while the tracked text is live and still anchored to this enemy,
  // and only within a short window so a long-dead combo doesn't linger.
  if (agg && agg.txt && agg.txt.life > 0 && agg.txt.anchor === e && (now - agg.t) <= HURT_AGG_WINDOW) {
    agg.total += amount;
    agg.t = now;
    const txt = agg.txt;
    txt.text = agg.total;
    txt.x = e.x;
    txt.y = e.y - e.r - 4;
    txt.life = txt.maxLife; // keep the merged number alive while hits stream in
    if (color) txt.color = color;
    return txt;
  }
  const txt = addFloatText(e.x, e.y - e.r - 4, amount, color || '#fff', false);
  if (txt) {
    txt.anchor = e;
    // remember the tracked enemy so a stale enemy-slot reuse never merges
    // an update into a recycled text belonging to a different foe
    txt.__linkedEnemy = e;
  }
  e.__hurtT = { t: now, total: amount, txt };
  return txt;
}

function addFloatText(x, y, text, color, big) {
  if (floatTexts.length >= MAX_FLOAT_TEXTS_CAP) {
    const oldest = floatTexts.shift();
    releaseFloatText(oldest);
  }
  const t = getFloatText();
  t.x = x;
  t.y = y;
  t.text = text;
  t.color = color || '#fff';
  t.life = 0.8;
  t.maxLife = 0.8;
  t.big = !!big;
  floatTexts.push(t);
  return t;
}
let centerShard = { text: '', t: 0 };
function showFloatingShard(text) {
  centerShard.text = text;
  centerShard.t = 2.2;
}

// ---------------- Update ----------------
function update(dt) {
  const _tm = _telemetry.mark.bind(_telemetry);
  _tm('audio'); AudioSys.updateIntensity(enemies.length, bossSpawned || enemies.some(e => e.boss || (e.type && e.type.startsWith('boss'))));
  _tm('planets'); updatePlanets(dt);
  _tm('player'); updatePlayer(dt);
  _tm('spawning'); updateSpawning(dt);
  _tm('enemies'); updateEnemies(dt);
  _tm('weapons'); updateWeapons(dt);
  _tm('projectiles'); updateProjectiles(dt);
  _tm('shockwaves'); updateShockwaves(dt);
  _tm('pickups'); updatePickups(dt);
  _tm('hazards'); updateHazards(dt);
  _tm('shrines'); updateVoidShrines(dt); // WS-5 Void Shrine spawn pacing (run-time)
  // A pact banked while the dock was busy surfaces the instant the dock frees.
  if (pendingShrineOffer && !levelupOpen) presentShrineChoices();
  _tm('floattexts'); updateFloatTexts(dt);
  centerShard.t = Math.max(0, centerShard.t - dt);
  player.hitPop = Math.max(0, (player.hitPop || 0) - dt);
  player.iframe = Math.max(0, player.iframe - dt);
  if (player.shield) {
    player.shield.t -= dt;
    if (player.shield.t <= 0 || player.shield.hits <= 0) {
      if (player.shield.hits > 0) addFloatText(player.x, player.y - 24, '◈ SHIELD FADED', '#68a');
      player.shield = null;
    }
  }
  player.contactCd = Math.max(0, player.contactCd - dt);
  player.pactDashLockT = Math.max(0, (player.pactDashLockT || 0) - dt); // WS-5 Adrenaline Void dash-seal decay (sim-time)
  shake = Math.max(0, shake - dt * 18);
  // boss intro cinematic timing
  if (bossIntro.active) {
    bossIntro.t += dt;
    if (bossIntro.t > 2.6) bossIntro.active = false;
  }

  // WS-4 fever countdown (sim-time; exit detonates + clears overlay)
  updateFever(dt);

  // combo decay
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
  }

  tickRunSave(dt); // mid-run snapshot (real work only every 15s)

  // Level-up chooser: stays open until the player makes a pick.
  // Void Shrine pacts are optional — auto-dismiss so they never block gameplay.
  if (levelupOpen) {
    levelupTimer = Math.max(0, levelupTimer - dt);
    if (levelupTimer <= 0 && shrineOfferOnScreen && levelupChoices.length > 0) {
      // Pact offer expired — void it harmlessly (player keeps moving, no curse applied).
      addFloatText(player.x, player.y - 48, 'VOID DECLINED', '#858', false);
      shrineOfferOnScreen = false;
      dismissLevelupUI();
      // Re-surface any queued level-up that was waiting behind the pact.
      if (pendingLevels > 0) resumeLevelUpQueue();
    }
  }

  camX = lerp(camX, player.x, dt * 6);
  camY = lerp(camY, player.y, dt * 6);

  if (player.regen > 0) player.hp = clamp(player.hp + player.regen * dt, 0, player.maxHp);
}

// ---------------- Planet Exploration & Gravity Engine ----------------
// Procedural planet field: deterministic per-chunk generation so planets persist
// as the player flies in any direction (infinite), but only nearby chunks are live.
const PLANET_CHUNK = 2400;        // world units per chunk (1 planet candidate per chunk)
const PLANET_KEEP_RADIUS = 2;     // keep chunks within this many chunks of player (5x5)
const PLANET_MIN_PLAYER_DIST = 1200; // minimum distance floor (never activate or pull planets closer than this)
const PLANETS = [];               // live working set; rebuilt by updatePlanets()
const _planetCache = new Map();   // chunkKey -> planet template (stable position/look)
const PLANET_TYPES = [
  { type: 'gas',      color: '#4488ff', name: ['Aegis', 'Boreas', 'Cirrus', 'Dynamo'] },
  { type: 'volcanic', color: '#ff4466', name: ['Pyro', 'Cinder', 'Vulcan', 'Scoria'] },
  { type: 'ocean',    color: '#00ffcc', name: ['Lagoon', 'Mira', 'Thalassa', 'Reef'] },
  { type: 'dark',     color: '#cc44ff', name: ['Void', 'Umbra', 'Nyx', 'Erebus'] },
  { type: 'forest',   color: '#44ff88', name: ['Verdant', 'Sylva', 'Gaia', 'Moss'] },
  { type: 'ice',      color: '#aaddff', name: ['Glacier', 'Frost', 'Bore', 'Rime'] },
];
function _planetChunkKey(cx, cy) { return cx + ',' + cy; }
function _planetHashRand(cx, cy, salt) {
  // Small stable hash -> [0,1)
  let h = (cx * 374761393 + cy * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
function _getPlanetInChunk(cx, cy) {
  const key = _planetChunkKey(cx, cy);
  let p = _planetCache.get(key);
  if (p !== undefined) return p;
  // ~40% of chunks hold a planet
  const spawn = _planetHashRand(cx, cy, 1) < 0.40;
  if (!spawn) { _planetCache.set(key, null); return null; }
  const tIdx = Math.floor(_planetHashRand(cx, cy, 2) * PLANET_TYPES.length) % PLANET_TYPES.length;
  const t = PLANET_TYPES[tIdx];
  const nameA = t.name[Math.floor(_planetHashRand(cx, cy, 3) * t.name.length) % t.name.length];
  const nameB = Math.floor(_planetHashRand(cx, cy, 4) * 90 + 10);
  const r = 80 + _planetHashRand(cx, cy, 5) * 70;
  const homeX = cx * PLANET_CHUNK + PLANET_CHUNK * (0.35 + _planetHashRand(cx, cy, 6) * 0.3);
  const homeY = cy * PLANET_CHUNK + PLANET_CHUNK * (0.35 + _planetHashRand(cx, cy, 7) * 0.3);
  const initAng = _planetHashRand(cx, cy, 10) * TAU;
  const initSpd = 20 + _planetHashRand(cx, cy, 9) * 25;
  p = {
    homeX, homeY,
    x: homeX, y: homeY,
    vx: Math.cos(initAng) * initSpd,
    vy: Math.sin(initAng) * initSpd,
    r, pullR: 240 + r * 1.8, gravity: 200 + _planetHashRand(cx, cy, 8) * 120,
    color: t.color, ringCol: t.color + '40', name: nameA + '-' + nameB, type: t.type,
    // Drift physics: wandering velocity within 1000u leash of chunk home
    driftSpd: initSpd,
    driftAng: initAng,
    driftTurnT: 5 + _planetHashRand(cx, cy, 11) * 10,
    leashR: 1000, // 1000u leash from home position
    touchDps: 6,
  };
  _planetCache.set(key, p);
  // Prevent unbounded growth across very long sessions
  if (_planetCache.size > 400) {
    const first = _planetCache.keys().next().value;
    _planetCache.delete(first);
  }
  return p;
}
function updatePlanets(dt) {
  const pcx = Math.floor(player.x / PLANET_CHUNK);
  const pcy = Math.floor(player.y / PLANET_CHUNK);
  PLANETS.length = 0;

  for (let dy = -PLANET_KEEP_RADIUS; dy <= PLANET_KEEP_RADIUS; dy++) {
    for (let dx = -PLANET_KEEP_RADIUS; dx <= PLANET_KEEP_RADIUS; dx++) {
      const p = _getPlanetInChunk(pcx + dx, pcy + dy);
      if (!p) continue;

      // Update drift physics
      p.driftTurnT -= dt;
      if (p.driftTurnT <= 0) {
        p.driftTurnT = 6 + Math.random() * 8;
        p.driftAng += (Math.random() - 0.5) * 1.5;
        p.driftSpd = 15 + Math.random() * 30;
      }

      // Desired velocity vector
      let targetVx = Math.cos(p.driftAng) * p.driftSpd;
      let targetVy = Math.sin(p.driftAng) * p.driftSpd;

      // Pull back gently toward home position if approaching/exceeding leash boundary (1000u)
      const dxHome = p.x - p.homeX;
      const dyHome = p.y - p.homeY;
      const distHome = Math.hypot(dxHome, dyHome);
      if (distHome > p.leashR * 0.7 && distHome > 0) {
        const pullStr = (distHome - p.leashR * 0.7) / (p.leashR * 0.3);
        targetVx -= (dxHome / distHome) * p.driftSpd * 1.5 * pullStr;
        targetVy -= (dyHome / distHome) * p.driftSpd * 1.5 * pullStr;
      }

      // Smoothly adjust velocity
      p.vx = lerp(p.vx, targetVx, dt * 1.5);
      p.vy = lerp(p.vy, targetVy, dt * 1.5);

      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Strict per-frame minimum distance check against player
      const pdx = p.x - player.x;
      const pdy = p.y - player.y;
      const pDist = Math.hypot(pdx, pdy);

      // Push planet outside min distance floor if drifted too close
      if (pDist < PLANET_MIN_PLAYER_DIST && pDist > 0) {
        p.x = player.x + (pdx / pDist) * PLANET_MIN_PLAYER_DIST;
        p.y = player.y + (pdy / pDist) * PLANET_MIN_PLAYER_DIST;
      }

      PLANETS.push(p);
    }
  }
}

function updatePlayer(dt) {
  let ix = touchVector.x, iy = touchVector.y;
  const isDvorak = !!settings.dvorak;
  const upKey = isDvorak ? ',' : 'w';
  const downKey = isDvorak ? 'o' : 's';
  const leftKey = isDvorak ? 'a' : 'a';
  const rightKey = isDvorak ? 'e' : 'd';

  if (keys[upKey] || keys['arrowup']) iy -= 1;
  if (keys[downKey] || keys['arrowdown']) iy += 1;
  if (keys[leftKey] || keys['arrowleft']) ix -= 1;
  if (keys[rightKey] || keys['arrowright']) ix += 1;
  const len = Math.hypot(ix, iy);
  let spd = player.speed;
  if (keys[' '] && len > 0) triggerPlayerDash();
  player.dashCd = Math.max(0, player.dashCd - dt);
  if (player.dashT > 0) { player.dashT -= dt; spd = player.speed * 3.1; }
  // WS-1 precision dodge: edge-triggered when dashing within 30px of a threat
  player.dodgeT = Math.max(0, (player.dodgeT || 0) - dt);
  if (player.dashT > 0 && (player.dodgeT || 0) > 0) {
    let near = false;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.spawnT > 0 || e.hp <= 0) continue;
      const rr = e.r + 30;
      const dx = e.x - player.x, dy = e.y - player.y;
      if (dx * dx + dy * dy < rr * rr) { near = true; break; }
    }
    if (!near) {
      for (let i = 0; i < projectiles.length; i++) {
        const p = projectiles[i];
        if (!p.hostile) continue;
        const rr = p.r + 30;
        const dx = p.x - player.x, dy = p.y - player.y;
        if (dx * dx + dy * dy < rr * rr) { near = true; break; }
      }
    }
    if (near) { player.dodgeT = 0; handlePrecisionDodge(); }
  }
  // Weaver web zones: standing in a web slows 40% (Agent-Bestiary WS-D)
  for (const h of hazards) {
    if (h.type !== 'web') continue;
    const dx = player.x - h.x, dy = player.y - h.y;
    if (dx * dx + dy * dy < h.r * h.r) { spd *= 0.6; break; }
  }
  if (len > 0) {
    ix /= len; iy /= len;
    player.vx = lerp(player.vx, ix * spd, dt * 12);
    player.vy = lerp(player.vy, iy * spd, dt * 12);
    player.ang = Math.atan2(player.vy, player.vx);
  } else {
    player.vx *= 1 - dt * 10; player.vy *= 1 - dt * 10;
  }
  // Planet Gravitational Pull Mechanics — strong gravitational pull applied directly to player
  for (const p of PLANETS) {
    const dx = p.x - player.x, dy = p.y - player.y;
    const d2 = dx * dx + dy * dy;
    const effectivePullR = p.pullR * 1.8;
    if (d2 < effectivePullR * effectivePullR && d2 > (p.r + 15) * (p.r + 15)) {
      const d = Math.sqrt(d2);
      const pullFactor = Math.pow(1 - (d - p.r) / (effectivePullR - p.r), 0.8);
      const pullForce = (p.gravity * 4.5) * pullFactor * dt;
      player.vx += (dx / d) * pullForce;
      player.vy += (dy / d) * pullForce;
      // Slingshot / orbital particle effect when close to atmosphere
      if (d < p.r + 60 && Math.random() < 0.25) {
        pushParticle({ type: 'shard', x: player.x, y: player.y, vx: -(dx / d) * 50 + rand(-20, 20), vy: -(dy / d) * 50 + rand(-20, 20), life: 0.25, maxLife: 0.25, color: p.color, size: 2 });
      }
    } else if (d2 <= (p.r + 15) * (p.r + 15)) {
      // Contact with planet surface: slow damage-over-time + soft pushback (anti-AFK)
      const d = Math.sqrt(d2) || 1;
      player.x = p.x - (dx / d) * (p.r + 15);
      player.y = p.y - (dy / d) * (p.r + 15);
      player.vx += (dx / d) * 40 * dt;
      player.vy += (dy / d) * 40 * dt;
      player.planetDotAcc = (player.planetDotAcc || 0) + (p.touchDps || 6) * dt;
      if (player.planetDotAcc >= 1) {
        const tick = Math.floor(player.planetDotAcc);
        player.planetDotAcc -= tick;
        damagePlayer(tick, true);
        if (frameCount % 30 === 0) addFloatText(player.x, player.y - 30, 'SURFACE BURN', p.color);
      }
    }
  }
  player.x += player.vx * dt;
  player.y += player.vy * dt;
}

function updateEnemies(dt) {
  enemyGrid.clear();
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].spawnT <= 0) enemyGrid.insert(enemies[i]);
  }
  // Reset per-frame elite aura buffs, then recompute
  for (const e of enemies) {
    e.auraSpdMul = 1; e.auraDmgMul = 1; e.auraHealMul = 0;
    e.nearElite = false;
  }
  for (const a of enemies) {
    if (!a.elite || !a.auraType || a.spawnT > 0 || a.hp <= 0) continue;
    a.auraPulse += dt * 2.4;
    // buff nearby foes via spatial hash (O(nearby) instead of O(all))
    const nearby = enemyGrid.query(a.x, a.y, a.auraR);
    const r2 = a.auraR * a.auraR;
    for (const o of nearby) {
      if (o === a || o.boss || o.spawnT > 0 || o.hp <= 0) continue;
      const dx = o.x - a.x, dy = o.y - a.y;
      if (dx * dx + dy * dy > r2) continue;
      o.nearElite = true;
      if (a.auraType === 'swift') o.auraSpdMul = Math.max(o.auraSpdMul, 1.18);
      else if (a.auraType === 'rage') o.auraDmgMul = Math.max(o.auraDmgMul, 1.18);
      else if (a.auraType === 'fortify') o.auraHealMul = Math.max(o.auraHealMul, 0.012);
    }
    // WS-10 Elite Affix player interactions
    if (a.auraType === 'molten') {
      a.affixCd = (a.affixCd || 0) - dt;
      if (a.affixCd <= 0) {
        a.affixCd = 0.5;
        if (hazards.length < 40) {
          hazards.push({ type: 'boom', x: a.x, y: a.y, t: 1.2, r: 24, dmg: a.damage * 0.4 });
        }
      }
    } else if (a.auraType === 'vortex') {
      const pdx = player.x - a.x, pdy = player.y - a.y;
      const pd2 = pdx * pdx + pdy * pdy;
      if (pd2 < a.auraR * a.auraR && pd2 > 100) {
        const pd = Math.sqrt(pd2);
        player.x -= (pdx / pd) * dt * 45;
        player.y -= (pdy / pd) * dt * 45;
      }
    } else if (a.auraType === 'chrono') {
      const pdx = player.x - a.x, pdy = player.y - a.y;
      if (pdx * pdx + pdy * pdy < a.auraR * a.auraR) {
        player.slowT = Math.max(player.slowT || 0, 0.3);
      }
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    if (e.hp <= 0) { enemies.splice(i, 1); continue; }
    e.hitT = Math.max(0, e.hitT - dt);
    e.slowT = Math.max(0, (e.slowT || 0) - dt);
    // WS-1 precision-dodge stun: frozen in place, no movement/attack logic
    e.stunT = Math.max(0, (e.stunT || 0) - dt);
    if (e.stunT > 0) continue;
    updateEnemyStatuses(e, dt);
    e.wobble += dt * 3;
    if (player.enemyRegenMul > 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * player.enemyRegenMul * dt);
    if (e.auraHealMul > 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.auraHealMul * dt);
    const spdMul = (e.slowT > 0 ? 0.45 : 1) * (e.auraSpdMul || 1);

    const ang = angleTo(e, player);
    if (e.type === 'tri' && !e.boss) {
      if (!e.dashing) {
        e.dashT -= dt;
        const targetSpd = e.speed * 0.4 * spdMul;
        e.vx = lerp(e.vx, Math.cos(ang) * targetSpd, dt * 5);
        e.vy = lerp(e.vy, Math.sin(ang) * targetSpd, dt * 5);
        if (e.dashT <= 0) {
          e.dashing = true; e.dashT = 0.55;
          const d = Math.hypot(player.x - e.x, player.y - e.y);
          if (d < 420) {
            e.vx = Math.cos(ang) * 420; e.vy = Math.sin(ang) * 420;
          } else { e.dashing = false; e.dashT = rand(0.8, 1.6); }
        }
      } else {
        e.dashT -= dt;
        e.vx *= 1 - dt * 1.2; e.vy *= 1 - dt * 1.2;
        if (e.dashT <= 0) { e.dashing = false; e.dashT = rand(1.2, 2.2); }
      }
    } else if (e.type === 'sniper') {
      // keep distance
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      const want = e.holdDist;
      let ax = 0, ay = 0;
      if (d > want + 40) { ax = Math.cos(ang); ay = Math.sin(ang); }
      else if (d < want - 40) { ax = -Math.cos(ang); ay = -Math.sin(ang); }
      else { ax = Math.cos(ang + Math.PI / 2); ay = Math.sin(ang + Math.PI / 2); } // strafe
      e.vx = lerp(e.vx, ax * e.speed * spdMul, dt * 4);
      e.vy = lerp(e.vy, ay * e.speed * spdMul, dt * 4);
      e.shootCd -= dt;
      if (e.shootCd <= 0 && d < 620) {
        e.shootCd = rand(2.2, 3.2);
        const sa = angleTo(e, player);
        pushProjectile({
          x: e.x, y: e.y,
          vx: Math.cos(sa) * 380, vy: Math.sin(sa) * 380,
          r: 5, damage: e.damage * 3.2, pierce: 0, hostile: true, hostileKind: 'snipe',
          life: 2.2, color: '#6df', hitSet: new Set(),
        });
        // telegraph
        pushParticle({ type: 'line', x: e.x, y: e.y, x2: player.x, y2: player.y, life: 0.12, maxLife: 0.12, color: '#6df', w: 1 });
        AudioSys.SFX.snipe();
      }
    } else if (e.type === 'lurker') {
      // Stalker ambusher: distant approach → submerge (untargetable, beelines to
      // player) → telegraphed breach lunge. State machine on e.lurkState.
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      e.lurkState = e.lurkState || 'stalk';
      e.lurkT = (e.lurkT === undefined ? rand(1.4, 2.2) : e.lurkT) - dt;
      if (e.lurkState === 'stalk') {
        e.sub = false;
        const ring = e.speed * (d > 220 ? 1 : 0.35) * spdMul;
        e.vx = lerp(e.vx, Math.cos(ang) * ring, dt * 4);
        e.vy = lerp(e.vy, Math.sin(ang) * ring, dt * 4);
        if (e.lurkT <= 0 && d < 360 && d > 110) { e.lurkState = 'submerge'; e.lurkT = rand(0.7, 1.1); }
      } else if (e.lurkState === 'submerge') {
        e.sub = true; // untargetable + invisible
        e.vx = lerp(e.vx, Math.cos(ang) * e.speed * 2.1 * spdMul, dt * 6);
        e.vy = lerp(e.vy, Math.sin(ang) * e.speed * 2.1 * spdMul, dt * 6);
        if (e.lurkT <= 0 || d < 60) {
          e.lurkState = 'breach'; e.lurkT = 0.55; e.sub = false;
          // breach telegraph: dust + shockwave + sound
          for (let k = 0; k < 10; k++) pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-160, 160), vy: rand(-160, 160), life: 0.3, maxLife: 0.3, color: '#a4f', size: rand(2, 4) });
          pushShockwave({ x: e.x, y: e.y, r: 26, maxR: 84, color: '#a4f', cosmetic: true });
          AudioSys.SFX.bossRoar && AudioSys.SFX.bossRoar();
        }
      } else { // breach lunge
        e.sub = false;
        if (e.lurkT <= 0) {
          e.vx = Math.cos(ang) * 520; e.vy = Math.sin(ang) * 520;
          e.lurkState = 'stalk'; e.lurkT = rand(2.2, 3.4);
        } else {
          e.vx *= 1 - dt * 1.4; e.vy *= 1 - dt * 1.4;
        }
      }
    } else if (e.type === 'healer') {
      e.vx = lerp(e.vx, Math.cos(ang) * e.speed * 0.6 * spdMul, dt * 4);
      e.vy = lerp(e.vy, Math.sin(ang) * e.speed * 0.6 * spdMul, dt * 4);
      e.healCd -= dt;
      if (e.healCd <= 0) {
        e.healCd = 0.9;
        const healNear = enemyGrid.query(e.x, e.y, e.auraR);
        const maxHeals = enemies.length > 100 ? 3 : 20; // throttle at high counts
        let healed = 0;
        for (const o of healNear) {
          if (o === e || o.spawnT > 0 || healed >= maxHeals) continue;
          const d = Math.hypot(o.x - e.x, o.y - e.y);
          if (d < e.auraR) {
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.04);
            healed++;
            if (frameCount % 24 === 0) pushParticle({ type: 'line', x: e.x, y: e.y, x2: o.x, y2: o.y, life: 0.2, maxLife: 0.2, color: '#6f6', w: 1 });
          }
        }
        pushParticle({ type: 'line', x: e.x - e.auraR / 2, y: e.y, x2: e.x, y2: e.y - e.auraR / 2, life: 0.15, maxLife: 0.15, color: '#6f6', w: 1 });
      }
    } else if (e.type === 'splitter') {
      // Binary fission cell: plain seeker; lethal-damage telegraph handled in
      // damageEnemy (e.splitTele), split spawn handled in killEnemy.
      if (e.splitTele) e.splitTele = Math.max(0, e.splitTele - dt);
      e.vx = lerp(e.vx, Math.cos(ang) * e.speed * spdMul, dt * 4);
      e.vy = lerp(e.vy, Math.sin(ang) * e.speed * spdMul, dt * 4);
    } else if (e.type === 'phantom') {
      // Phaser: standard seeker; periodically blinks out (untargetable fade)
      // and reappears offset to the player's flank, slightly closer in.
      e.blinkT -= dt;
      if (e.phasing > 0) {
        e.phasing -= dt;
        e.vx *= 1 - dt * 6; e.vy *= 1 - dt * 6;
        if (e.phasing <= 0) {
          e.phasing = 0;
          const toP = angleTo(e, player);
          const side = rand() < 0.5 ? -1 : 1;
          const along = rand(140, 220);
          const px = player.x - Math.cos(toP) * along + Math.cos(toP + Math.PI / 2) * side * rand(20, 60);
          const py = player.y - Math.sin(toP) * along + Math.sin(toP + Math.PI / 2) * side * rand(20, 60);
          for (let k = 0; k < 8; k++) pushParticle({ type: 'shard', x: px, y: py, vx: rand(-140, 140), vy: rand(-140, 140), life: 0.3, maxLife: 0.3, color: '#d6f', size: rand(2, 4) });
          e.x = px; e.y = py;
          e.blinkT = rand(2.5, 4);
        }
      } else {
        // [WS-7] Flank AI: instead of beelining, steer toward a waypoint 120°
        // behind the player's heading and circle in from the rear arc. Commits
        // to a direct strike once close or once the waypoint is reached.
        const pd = Math.hypot(player.x - e.x, player.y - e.y);
        if (!e.flankWp || (frameCount & 31) === 0) e.flankWp = computeFlankPoint(e, 250);
        let goalAng = ang;
        if (pd > 150) {
          const wd = Math.hypot(e.flankWp.x - e.x, e.flankWp.y - e.y);
          if (wd > 36) goalAng = Math.atan2(e.flankWp.y - e.y, e.flankWp.x - e.x);
        }
        // gentler turn rate while circling so the flank arc reads as a swoop
        const turn = Math.abs(angleWrap(goalAng - Math.atan2(e.vy, e.vx))) > 1.1 ? 2.4 : 4;
        e.vx = lerp(e.vx, Math.cos(goalAng) * e.speed * spdMul, dt * turn);
        e.vy = lerp(e.vy, Math.sin(goalAng) * e.speed * spdMul, dt * turn);
        if (pd <= 150) e.flankWp = null; // reached strike range — re-flank on next cycle
        if (e.blinkT <= 0) {
          e.phasing = 0.25;
          // after-image: fading echo at the old position
          for (let k = 0; k < 6; k++) pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-40, 40), vy: rand(-40, 40), life: 0.5, maxLife: 0.5, color: '#d6f', size: rand(2.5, 4.5) });
          pushParticle({ type: 'line', x: e.x - e.vx * 0.06, y: e.y - e.vy * 0.06, x2: e.x, y2: e.y, life: 0.35, maxLife: 0.35, color: '#f2e', w: 3 });
        }
      }
    } else if (e.type === 'stalker') {
      // Flanker: approaches at a wide offset angle instead of beelining,
      // periodically flips side. Forces the player to re-aim instead of kiting
      // a straight line.
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.flankSide *= -1; e.strafeT = rand(1.4, 2.6); }
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      // offset angle: wide at range, tightens as it closes in
      const offset = e.flankSide * (d > 320 ? 0.9 : d > 160 ? 0.5 : 0.2);
      const a = ang + offset;
      e.vx = lerp(e.vx, Math.cos(a) * e.speed * spdMul, dt * 5);
      e.vy = lerp(e.vy, Math.sin(a) * e.speed * spdMul, dt * 5);
    } else if (e.type === 'bulwark' && !e.boss) {
      // [WS-7] Shield line: when a healer/sniper is nearby, form a wall between
      // it and the player (aegis escort). Otherwise slow-push the player.
      if ((frameCount & 15) === 0 || e.shieldAnchor === undefined) e.shieldAnchor = findShieldAnchor(e);
      const anchor = e.shieldAnchor && e.shieldAnchor.hp > 0 && !e.shieldAnchor.deadT ? e.shieldAnchor : null;
      if (!anchor) e.shieldAnchor = null;
      let goalAng = ang, pace = e.speed;
      if (anchor) {
        const adx = anchor.x - player.x, ady = anchor.y - player.y;
        const ad = Math.hypot(adx, ady);
        if (ad < 420) {
          // hold station ~52px in front of the anchor on the player-facing line
          const ux = adx / (ad || 1), uy = ady / (ad || 1);
          const tx = anchor.x - ux * 52, ty = anchor.y - uy * 52;
          const td = Math.hypot(tx - e.x, ty - e.y);
          if (td > 14) goalAng = Math.atan2(ty - e.y, tx - e.x);
          else { e.vx *= 1 - dt * 4; e.vy *= 1 - dt * 4; goalAng = Math.atan2(ty - e.y, tx - e.x); }
          pace = e.speed * 1.25; // hustle to keep the wall formed
          e.guardT = 1.0;
        } else {
          e.shieldAnchor = null; // anchor wandered out of guard range
        }
      }
      e.vx = lerp(e.vx, Math.cos(goalAng) * pace * spdMul, dt * 3);
      e.vy = lerp(e.vy, Math.sin(goalAng) * pace * spdMul, dt * 3);
      // face the player while guarding so the frontal shield arc soaks hits
      if (e.guardT > 0) { e.guardT -= dt; e.facing = ang; }
      else if (e.facing !== undefined) e.facing = angleWrap(e.facing + angleWrap(ang - e.facing) * Math.min(1, dt * 3));
    } else if (e.type === 'blink') {
      // Blink stalker: steady seek + teleports a short hop toward the player
      // every few seconds. Real blink is also triggered on-hit in damageEnemy.
      e.blinkCd -= dt;
      e.vx = lerp(e.vx, Math.cos(ang) * e.speed * spdMul, dt * 4);
      e.vy = lerp(e.vy, Math.sin(ang) * e.speed * spdMul, dt * 4);
      if (e.blinkCd <= 0) {
        e.blinkCd = rand(3.2, 4.5);
        const d = Math.hypot(player.x - e.x, player.y - e.y);
        if (d > 140) {
          const hop = 130;
          // pre-blink particle streak at origin
          for (let k = 0; k < 6; k++) pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-140, 140), vy: rand(-140, 140), life: 0.25, maxLife: 0.25, color: '#d6f', size: rand(2, 3) });
          e.x += Math.cos(ang) * hop;
          e.y += Math.sin(ang) * hop;
          for (let k = 0; k < 8; k++) pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-180, 180), vy: rand(-180, 180), life: 0.3, maxLife: 0.3, color: '#d6f', size: rand(2, 4) });
          if (AudioSys.SFX.dash) AudioSys.SFX.dash();
        }
      }
    } else if (e.type === 'warden') {
      // Shield-bearer: slow push, protected by 3 orbiting shield shards that
      // soak projectile hits (handled in damageEnemy). Once shields fall it's
      // just a tanky bruiser.
      e.shieldAng += dt * 1.6;
      e.vx = lerp(e.vx, Math.cos(ang) * e.speed * spdMul, dt * 3);
      e.vy = lerp(e.vy, Math.sin(ang) * e.speed * spdMul, dt * 3);
    } else if (e.boss) {
      const hpFrac = e.hp / e.maxHp;

      // [WS-2] Phase transition at 50% HP — 1.0s invincibility telegraph
      if (!e.enraged && hpFrac <= 0.5) {
        e.enraged = true;
        e.enrageTelegraphT = 1.0;  // invuln + aura flash telegraph
        e.speed *= 1.4;
        e.enrageCd = 0;
        e.enrageSpiralCd = 0;
        e.laserTelegraphT = 0;
        e.spiralAng = Math.random() * TAU;
        shake = Math.max(shake, 14);
        hitStop = Math.max(hitStop, 0.3);
        showFloatingShard(`⚠ ${e.type === 'boss3' ? 'THE ARCHITECT' : e.type === 'boss2' ? 'WARDEN MK.II' : 'WARDEN MK.I'} ENRAGED!`);
        AudioSys.SFX.bossRoar();
        // Enrage burst — ring of hostile projectiles
        const nBurst = e.type === 'boss3' ? 18 : e.type === 'boss2' ? 14 : 10;
        for (let k = 0; k < nBurst; k++) {
          const ba = (k / nBurst) * TAU;
          pushProjectile({ x: e.x, y: e.y, vx: Math.cos(ba) * 340, vy: Math.sin(ba) * 340, r: 6, damage: e.damage * 0.7, life: 1.8, color: '#ff2244', hostile: true });
        }
      }
      if (e.enrageTelegraphT > 0) {
        e.enrageTelegraphT -= dt;
        shake = Math.max(shake, 4); // sustained minor rumble during flash
      }

      // Periodic attack: dash charge (frozen while telegraphing)
      if (e.enrageTelegraphT <= 0) {
        e.dashT -= dt;
        if (e.dashT < -2.5) {
          e.dashT = e.enraged ? 2.8 : 4;
          const d = Math.hypot(player.x - e.x, player.y - e.y);
          if (d > 80) {
            e.vx = Math.cos(ang) * (e.enraged ? 500 : 360);
            e.vy = Math.sin(ang) * (e.enraged ? 500 : 360);
            AudioSys.SFX.bossRoar();
            shake = Math.max(shake, 6);
          }
        } else {
          e.vx = lerp(e.vx, Math.cos(ang) * e.speed * spdMul * (e.enraged ? 1.3 : 1), dt * 3);
          e.vy = lerp(e.vy, Math.sin(ang) * e.speed * spdMul * (e.enraged ? 1.3 : 1), dt * 3);
        }
      }

      if (e.enraged && e.enrageTelegraphT <= 0) {
        // Legacy aimed spray — faster cadence (existing behaviour, differs per boss tier)
        e.enrageCd = (e.enrageCd || 0) - dt;
        if (e.enrageCd <= 0) {
          const sprayInterval = e.type === 'boss3' ? 1.6 : e.type === 'boss2' ? 2.2 : 2.8;
          e.enrageCd = sprayInterval;
          const nSpray = e.type === 'boss3' ? 8 : e.type === 'boss2' ? 6 : 4;
          const baseAng = angleTo(e, player);
          const spread = e.type === 'boss3' ? 0.45 : 0.6;
          for (let k = 0; k < nSpray; k++) {
            const sa = baseAng + (k - (nSpray - 1) / 2) * spread;
            pushProjectile({
              x: e.x, y: e.y,
              vx: Math.cos(sa) * 310, vy: Math.sin(sa) * 310,
              r: 5, damage: e.damage * 0.5, pierce: 0,
              life: 2.0, color: '#f55', hostile: true,
            });
          }
          AudioSys.SFX.bossWarn();
        }

        // [WS-2] Radial spiral bullet-hell (3.5s cycle, optimized per-frame projectile allocations)
        e.enrageSpiralCd = (e.enrageSpiralCd || 0) - dt;
        if (e.enrageSpiralCd <= 0) {
          e.enrageSpiralCd = 3.5;
          const nArms = e.type === 'boss3' ? 3 : 2;
          const nPerArm = 5;
          const rotSpd = 1.15; // radians per arm tick — spiral turns over successive bursts
          for (let arm = 0; arm < nArms; arm++) {
            for (let k = 0; k < nPerArm; k++) {
              // fan each arm out so consecutive bullets cover a ring segment
              const sa = e.spiralAng + arm * (TAU / nArms) + (k - (nPerArm - 1) / 2) * 0.25;
              const spd = 220 + k * 14;
              pushProjectile({
                x: e.x, y: e.y,
                vx: Math.cos(sa) * spd, vy: Math.sin(sa) * spd,
                r: 4, damage: e.damage * 0.35, pierce: 0,
                life: 2.4, color: e.type === 'boss3' ? '#ff00aa' : '#ff5544', hostile: true,
              });
            }
          }
          e.spiralAng += rotSpd;
          AudioSys.SFX.bossRoar();
          shake = Math.max(shake, 6);
        }

        // [WS-2] Laser telegraph + heavy blast salvo
        if (e.laserTelegraphT > 0) {
          e.laserTelegraphT -= dt;
          if (e.laserTelegraphT <= 0) {
            // Fire the heavy salvo along the stored angle
            const sal = e.laserTelegraphAng;
            for (let k = -2; k <= 2; k++) {
              const sa = sal + k * 0.13;
              pushProjectile({
                x: e.x, y: e.y,
                vx: Math.cos(sa) * 520, vy: Math.sin(sa) * 520,
                r: 9, damage: e.damage * 0.9, pierce: 0,
                life: 1.6, color: '#ffff66', hostile: true,
              });
            }
            AudioSys.SFX.bossWarn();
            shake = Math.max(shake, 10);
          }
        } else if ((e.laserCd = (e.laserCd || 0) - dt) <= 0) {
          e.laserCd = e.type === 'boss3' ? 4.5 : 5.5;
          e.laserTelegraphT = 0.6;
          e.laserTelegraphAng = angleTo(e, player);
        }
      }

    } else if (e.type === 'mirage') {
      e.blinkT -= dt;
      if (e.glitchT > 0) e.glitchT -= dt;
      if (e.blinkT <= 0) {
        e.glitchT = 0.15;
        e.blinkT = rand(2.2, 2.8);
        for (let k = 0; k < 10; k++) pushParticle({ type: 'shard', x: e.x, y: e.y, vx: rand(-160, 160), vy: rand(-160, 160), life: 0.35, maxLife: 0.35, color: '#f0f', size: rand(2, 4) });
        pushShockwave({ x: e.x, y: e.y, r: 4, maxR: 46, speed: 1100, damage: 0, cosmetic: true, color: '#f0f' });
        const d = Math.hypot(player.x - e.x, player.y - e.y);
        const step = Math.min(180, d - 30);
        e.x += Math.cos(ang) * step;
        e.y += Math.sin(ang) * step;
        e.vx = 0; e.vy = 0;
        AudioSys.SFX.snipe();
      }
      if (e.glitchT > 0) {
        if (Math.random() < 0.5) pushParticle({ type: 'line', x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), x2: e.x, y2: e.y, life: 0.06, maxLife: 0.06, color: '#f8f', w: 1 });
      } else {
        e.vx = lerp(e.vx, Math.cos(ang) * e.speed * spdMul, dt * 4);
        e.vy = lerp(e.vy, Math.sin(ang) * e.speed * spdMul, dt * 4);
      }
    } else if (e.type === 'weaver') {
      // Web-spinner kiter (Agent-Bestiary WS-D): holds ~220px, deposits a
      // slowing web zone (hazard) under itself every 3s. Cap hazards, shed oldest.
      const dW = Math.hypot(player.x - e.x, player.y - e.y);
      const wantW = 220;
      let aWx = 0, aWy = 0;
      if (dW > wantW + 30) { aWx = Math.cos(ang); aWy = Math.sin(ang); }
      else if (dW < wantW - 30) { aWx = -Math.cos(ang); aWy = -Math.sin(ang); }
      else { aWx = Math.cos(ang + Math.PI / 2); aWy = Math.sin(ang + Math.PI / 2); } // strafe ring
      e.vx = lerp(e.vx, aWx * e.speed * spdMul, dt * 4);
      e.vy = lerp(e.vy, aWy * e.speed * spdMul, dt * 4);
      e.webT -= dt;
      if (e.webT <= 0) {
        e.webT = 3.0;
        if (hazards.length >= 40) hazards.splice(0, 1);
        hazards.push({ type: 'web', x: e.x, y: e.y, t: 2.5, r: 70 });
        pushParticle({ type: 'line', x: e.x - 6, y: e.y, x2: e.x + 6, y2: e.y, life: 0.25, maxLife: 0.25, color: '#6fd', w: 1.5 });
      }
    } else if (e.type === 'leech') {
      if (e.latched) {
        e.latchT += dt; e.latchDmg += dt * 8;
        e.x = player.x - Math.cos(ang) * (player.r + 4);
        e.y = player.y - Math.sin(ang) * (player.r + 4);
        e.latchTick -= dt;
        if (e.latchTick <= 0) {
          e.latchTick = 0.12;
          damagePlayer(dt * 8 * 12, true);
          pushParticle({ type: 'line', x: e.x, y: e.y, x2: player.x, y2: player.y, life: 0.08, maxLife: 0.08, color: '#6f6', w: 1 });
        }
        if (e.latchT >= 2.5 || e.latchDmg >= 30) {
          e.latched = false; e.latchT = 0; e.latchDmg = 0; e.latchTick = 0;
          e.vx = -Math.cos(ang) * 280; e.vy = -Math.sin(ang) * 280;
        }
      } else {
        e.dashT -= dt;
        if (e.dashT <= 0) {
          e.dashT = rand(0.7, 1.1);
          e.vx = Math.cos(ang) * e.speed * 2.4; e.vy = Math.sin(ang) * e.speed * 2.4;
        }
        e.vx = lerp(e.vx, Math.cos(ang) * e.speed * spdMul, dt * 5);
        e.vy = lerp(e.vy, Math.sin(ang) * e.speed * spdMul, dt * 5);
      }
    } else if (e.type === 'carrier') {
      e.vx = lerp(e.vx, Math.cos(ang) * e.speed * spdMul, dt * 2);
      e.vy = lerp(e.vy, Math.sin(ang) * e.speed * spdMul, dt * 2);
      e.broodT -= dt;
      if (e.broodT <= 0) {
        e.broodT = 3.0;
        e.broods = e.broods || 0;
        if (e.broods < 6) {
          e.broods++;
          const ba = rand(0, TAU);
          spawnEnemy('swarm', e.x + Math.cos(ba) * (e.r + 8), e.y + Math.sin(ba) * (e.r + 8));
          pushShockwave({ x: e.x, y: e.y, r: 4, maxR: 36, speed: 700, damage: 0, cosmetic: true, color: '#fb4' });
          AudioSys.SFX.enemyDie && AudioSys.SFX.enemyDie();
        }
      }
    } else {
      const wob = Math.sin(e.wobble) * 0.4;
      const a = ang + wob * 0.3;
      e.vx = lerp(e.vx, Math.cos(a) * e.speed * spdMul, dt * 4);
      e.vy = lerp(e.vy, Math.sin(a) * e.speed * spdMul, dt * 4);
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.ang += (e.spin || 0) * dt;

    // [WS-7] Squad cohesion: formation members steer gently toward their
    // squad's centroid so the V-wedge charges as a unit. Broadphase-only.
    if (e.squadId && !e.deadT && (frameCount & 7) === 0) {
      const mates = enemyGrid.query(e.x, e.y, 160);
      let cx = 0, cy = 0, nc = 0;
      for (const o of mates) {
        if (o === e || o.squadId !== e.squadId || o.deadT || o.hp <= 0) continue;
        cx += o.x; cy += o.y; nc++;
      }
      if (nc > 0) {
        cx /= nc; cy /= nc;
        const dxs = cx - e.x, dys = cy - e.y;
        const ds = Math.hypot(dxs, dys);
        if (ds > 30) { e.vx += (dxs / ds) * 30 * dt; e.vy += (dys / ds) * 30 * dt; }
      }
    }

    // separation via spatial hash grid
    if ((frameCount + i) % 2 === 0) {
      const nearFoes = enemyGrid.query(e.x, e.y, e.r + 24);
      for (let k = 0; k < nearFoes.length; k += 2) {
        const o = nearFoes[k];
        if (o === e || o.spawnT > 0 || o.hp <= 0) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const rr = e.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / rr * 40;
          e.x += dx / d * push * dt;
          e.y += dy / d * push * dt;
        }
      }
    }

    // contact damage (rage-buffed if near a rage elite); phasing phantoms can't touch
    const pr = player.r + e.r - 2;
    if (!e.phasing && dist2(e, player) < pr * pr && player.iframe <= 0) {
      damagePlayer(e.damage * (e.auraDmgMul || 1));
      const a = angleTo(e, player);
      player.vx += Math.cos(a) * 260; player.vy += Math.sin(a) * 260;
      e.vx -= Math.cos(a) * 120; e.vy -= Math.sin(a) * 120;
    }
  }
}


function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.r += s.speed * dt;
    if (!s.cosmetic) {
      if (s.hostile) {
        // damages player
        const d = Math.hypot(player.x - s.x, player.y - s.y);
        if (d < s.r + player.r && Math.abs(d - s.r) < player.r + 24 && player.iframe <= 0) {
          s.hitSet.add('player');
          damagePlayer(s.damage);
        }
      } else {
        for (const e of enemies) {
          if (s.hitSet.has(e) || e.spawnT > 0) continue;
          const d = Math.hypot(e.x - s.x, e.y - s.y);
          if (d < s.r + e.r && Math.abs(d - s.r) < e.r + 24) {
            s.hitSet.add(e);
            damageEnemy(e, s.damage, s.nova || s.supernova ? '#f84' : '#8ff', s.weaponId || (s.nova ? 'nova' : 'shockwave'));
            if (s.stun > 0) e.stunT = Math.max(e.stunT || 0, s.stun);
            if (s.nova || s.supernova) {
              applyBurn(e, s.supernova ? 4.5 : 3.0, s.supernova ? 40 : 20);
            }
            if (s.knock) {
              const a = Math.atan2(e.y - s.y, e.x - s.x);
              e.vx += Math.cos(a) * 420; e.vy += Math.sin(a) * 420;
            }
          }
        }
      }
    }
    if (s.r >= s.maxR) {
      shockwaves[i] = shockwaves[shockwaves.length - 1];
      shockwaves.pop();
      releaseShockwave(s);
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
      releaseParticle(p);
      continue;
    }
    if (p.type === 'shard') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 4; p.vy *= 1 - dt * 4; }
  }
}

function updateFloatTexts(dt) {
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const t = floatTexts[i];
    t.life -= dt;
    t.y -= dt * 45;
    if (t.life <= 0) {
      floatTexts[i] = floatTexts[floatTexts.length - 1];
      floatTexts.pop();
      releaseFloatText(t);
    }
  }
}

// ---------------- Render ----------------
let bgPulse = 0;
const STAR_LAYERS = [];
const DUST_LAYERS = [];
(function initStars() {
  // deterministic seeded starfield — deep multi-layer parallax + colored twinkle
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const layers = [
    { n: 180, parallax: 0.08, far: true, tile: 3600, colors: ['#ffffff', '#cfe6ff', '#e8d5ff', '#ffeebb'] },
    { n: 120, parallax: 0.22, far: true, tile: 3000, colors: ['#ffffff', '#aaddff', '#ffddee'] },
    { n: 80,  parallax: 0.45, far: false, tile: 2400, colors: ['#ffffff', '#88ccff', '#ffccff'] },
    { n: 40,  parallax: 0.72, far: false, tile: 2000, colors: ['#ffffff', '#bbddff'] },
  ];
  for (const L of layers) {
    const stars = [];
    for (let i = 0; i < L.n; i++) {
      stars.push({
        x: rnd() * L.tile - L.tile / 2,
        y: rnd() * L.tile - L.tile / 2,
        r: L.far ? rnd() * 0.9 + 0.35 : rnd() * 1.8 + 0.8,
        baseA: L.far ? rnd() * 0.35 + 0.15 : rnd() * 0.5 + 0.3,
        twinkle: rnd() * 4 + 1,
        twinkleOff: rnd() * TAU,
        color: L.colors[Math.floor(rnd() * L.colors.length)],
      });
    }
    STAR_LAYERS.push({ parallax: L.parallax, stars, tile: L.tile });
  }
  // Cosmic dust motes — tiny drifting particles
  for (let L = 0; L < 3; L++) {
    const dust = [];
    const n = L === 0 ? 70 : L === 1 ? 50 : 35;
    for (let i = 0; i < n; i++) {
      dust.push({
        x: rnd() * 3000 - 1500,
        y: rnd() * 3000 - 1500,
        r: rnd() * 1.2 + 0.3,
        a: rnd() * 0.18 + 0.05,
        drift: rnd() * 3 + 1,
        driftOff: rnd() * TAU,
        parallax: 0.1 + L * 0.12,
        color: L === 0 ? '#4488ff' : L === 1 ? '#ff6688' : '#00ffcc',
      });
    }
    DUST_LAYERS.push({ dust, tile: 3000 });
  }
})();

function draw() {
  bgPulse += 0.016;
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);

  // Screen shake disabled per user preference
  const actualShake = 0;
  const sx = 0, sy = 0, rotShake = 0;
  const camLeft = camX - W / 2, camTop = camY - H / 2;

  // Chromatic Aberration strength based on hitStop freeze frames and screen shake
  const caShift = hitStop > 0 ? clamp(hitStop * 36, 2, 16) : (actualShake > 2 ? clamp(actualShake * 1.0, 1, 12) : 0);

  drawStars(camLeft, camTop);
  drawGrid(camLeft, camTop);

  ctx.save();
  if (rotShake !== 0) {
    ctx.translate(W / 2, H / 2);
    ctx.rotate(rotShake);
    ctx.translate(-W / 2, -H / 2);
  }
  ctx.translate(-camLeft, -camTop);

  drawPlanets();
  for (const g of gems) drawGem(g);
  for (const h of hazards) drawHazard(h);
  for (const s of shockwaves) drawShockwave(s);
  // Offscreen culling: skip per-enemy draw work when fully beyond the camera.
  // Auras/rings can overhang the body, so pad by the largest effect radius.
  const cullPad = 140;
  for (const e of enemies) {
    if (e.x < camLeft - cullPad || e.x > camLeft + W + cullPad ||
        e.y < camTop - cullPad || e.y > camTop + H + cullPad) continue;
    drawEnemy(e);
  }

  for (const p of projectiles) {
    ctx.globalAlpha = clamp(p.life / 0.15, 0, 1);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.hostile ? 18 : 12;
    if (p.hostile) {
      ctx.strokeStyle = '#f66';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 2.5, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
  }

  const sawW = player.weapons.find(w => w.id === 'saws');
  if (sawW) drawSaws(sawW);

  // WS-3 MEGALODON OVERCHARGE: spectral jaws — cyan ghost body + gold tooth ring.
  for (const p of projectiles) {
    if (!p.isMegalodonBlade) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.returning ? Math.atan2(player.y - p.y, player.x - p.x) : p.ang);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(80, 220, 255, 0.7)';
    ctx.shadowColor = '#4ff'; ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.quadraticCurveTo(4, -12, -14, -6);
    ctx.quadraticCurveTo(-6, 0, -14, 6); ctx.quadraticCurveTo(4, 12, 16, 0);
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let t = 0; t < 3; t++) {
      const tx = 8 - t * 7;
      ctx.moveTo(tx, -5 + t); ctx.lineTo(tx + 4, 0); ctx.lineTo(tx, 5 - t);
    }
    ctx.stroke();
    ctx.restore();
  }

  // WS-3 INFERNO BEAM fire walls: orange core + cyan ghost rim (dual-color layer).
  for (const h of hazards) {
    if (h.type !== 'fireWall') continue;
    const fade = clamp(h.t / 3.0, 0, 1);
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = '#f84';
    ctx.shadowColor = '#f84'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r * (0.75 + 0.25 * Math.sin(frameCount * 0.2 + h.x)), 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.3 * fade;
    ctx.strokeStyle = '#0cf';
    ctx.shadowColor = '#0cf'; ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  const frostW = player.weapons.find(w => w.id === 'frost');
  if (frostW && frostW.aimA !== undefined) drawFrostCone(frostW);

  const prismW = player.weapons.find(w => w.id === 'prism');
  if (prismW) drawPrism(prismW);

  drawPlayer();

  // Particle culling: same camera bounds (particles are small; tight pad).
  const pPad = 40;
  for (const p of particles) {
    if (p.x < camLeft - pPad || p.x > camLeft + W + pPad ||
        p.y < camTop - pPad || p.y > camTop + H + pPad) continue;
    drawParticle(p);
  }
  drawFloatTexts();

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Post-processing: Chromatic Aberration RGB channel split pass on hitStop / screen-shake
  if (caShift > 0.5) {
    caCtx.clearRect(0, 0, W, H);
    caCtx.drawImage(canvas, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(caCanvas, -caShift, 0);
    ctx.drawImage(caCanvas, caShift, 0);
    ctx.restore();
  }

  drawComboHud();

  if (centerShard.t > 0) {
    ctx.globalAlpha = clamp(centerShard.t / 0.5, 0, 1) * clamp((2.2 - centerShard.t) / 0.4, 0, 1);
    ctx.font = 'bold 42px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f44';
    ctx.shadowColor = '#f00'; ctx.shadowBlur = 24;
    ctx.fillText(centerShard.text, W / 2, H * 0.28);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  const hpFrac = player.hp / player.maxHp;
  if (hpFrac < 0.35 && state === 'playing') {
    const a = (0.35 - hpFrac) * (0.5 + 0.5 * Math.sin(bgPulse * 8));
    const isReduced = typeof settings !== 'undefined' && settings.reducedFlash;
    ctx.fillStyle = `rgba(255,0,40,${(isReduced ? a * 0.1 : a * 0.22).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (state === 'playing') {
    drawEdgeDangerIndicators();
    drawBossTelegraphs();
    drawBossHealthBar();
    if (minimapVisible) drawMinimap();
  }

  drawBossIntro();
}

// ---- Top-screen boss health bar ----
function drawBossHealthBar() {
  const bosses = enemies.filter(e => e.boss && e.hp > 0 && e.spawnT <= 0);
  if (bosses.length === 0) return;
  const barW = Math.min(600, W * 0.6);
  const barH = 14;
  const barX = (W - barW) / 2;
  const barY = 12;
  for (let i = 0; i < bosses.length; i++) {
    const b = bosses[i];
    const y = barY + i * (barH + 6);
    const hpFrac = clamp(b.hp / b.maxHp, 0, 1);
    const name = b.type === 'boss3' ? 'THE ARCHITECT' : b.type === 'boss2' ? 'WARDEN MK.II' : 'WARDEN MK.I';
    const enraged = b.enraged;
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(barX - 2, y - 2, barW + 4, barH + 4);
    // HP fill
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    if (grad && grad.addColorStop) {
      if (enraged) {
        grad.addColorStop(0, '#ff0033');
        grad.addColorStop(1, '#ff6600');
      } else {
        grad.addColorStop(0, '#ff2244');
        grad.addColorStop(1, '#ff6688');
      }
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = enraged ? '#ff0033' : '#ff2244';
    }
    ctx.shadowColor = enraged ? '#ff0033' : '#ff2244';
    ctx.shadowBlur = 12;
    ctx.fillRect(barX, y, barW * hpFrac, barH);
    ctx.shadowBlur = 0;
    // Border
    ctx.strokeStyle = enraged ? '#ff0033' : '#ff4466';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX, y, barW, barH);
    // Name text
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText(`${name}${enraged ? ' ⚠ENRAGED' : ''}  ${Math.ceil(hpFrac * 100)}%`, W / 2, y + barH - 3);
    ctx.shadowBlur = 0;
  }
  ctx.textAlign = 'center';
}

// ---- Screen-edge enemy threat indicators (neon arrows) ----
function drawEdgeDangerIndicators() {
  const margin = 30;
  const maxArrows = 12;
  const camL = camX - W / 2, camT = camY - H / 2;
  const camR = camX + W / 2, camB = camY + H / 2;
  let drawn = 0;

  ctx.save();
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const e of enemies) {
    if (drawn >= maxArrows) break;
    if (e.spawnT > 0 || e.hp <= 0) continue;
    if (e.x > camL && e.x < camR && e.y > camT && e.y < camB) continue; // on-screen

    const dx = e.x - player.x, dy = e.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 2000) continue; // too far to matter

    const cx = W / 2, cy = H / 2;
    const sx = e.x - camL, sy = e.y - camT;
    const px = Math.max(margin, Math.min(W - margin, sx));
    const py = Math.max(margin, Math.min(H - margin, sy));

    const angle = Math.atan2(sy - cy, sx - cx);
    const intensity = Math.max(0.25, 1 - dist / 1600);
    const alpha = (e.boss || e.elite) ? Math.min(1, 0.5 + 0.5 * Math.sin(bgPulse * 6)) : intensity * 0.85;
    const color = e.boss ? '#f33' : e.elite ? '#fa4' : '#4f8';

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    const s = e.boss ? 14 : e.elite ? 11 : 8;
    ctx.beginPath();
    ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, s * 0.6); ctx.lineTo(-s * 0.7, -s * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    drawn++;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// ---- Boss attack telegraph (pulsing ring around boss + turret sights) ----
function drawBossTelegraphs() {
  const camL = camX - W / 2, camT = camY - H / 2;
  for (const e of enemies) {
    if (!e.boss || e.spawnT > 0 || e.hp <= 0) continue;
    const sx = e.x - camL, sy = e.y - camT;
    if (sx < -100 || sx > W + 100 || sy < -100 || sy > H + 100) continue;

    const pulse = 0.5 + 0.5 * Math.sin(bgPulse * 5 + e.x * 0.01);
    const R = e.r * (2.5 + pulse * 0.5);

    ctx.save();
    ctx.translate(sx, sy);

    // [WS-2] Enrage invulnerability shield aura (flash-heavy while telegraphing)
    if (e.enrageTelegraphT > 0) {
      const flash = 0.5 + 0.5 * Math.sin(bgPulse * 32 + e.x * 0.03);
      ctx.globalAlpha = 0.55 + 0.45 * flash;
      ctx.fillStyle = '#aaffff';
      ctx.shadowColor = '#aaffff'; ctx.shadowBlur = 26;
      ctx.beginPath(); ctx.arc(0, 0, e.r * (1.25 + flash * 0.18), 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    } else if (e.enraged) {
      ctx.globalAlpha = 0.18 + 0.14 * pulse;
      ctx.strokeStyle = '#ffaa55';
      ctx.lineWidth = 4;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(0, 0, e.r * 1.35, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalAlpha = 0.28 + 0.12 * pulse;
    ctx.strokeStyle = '#f33';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#f88';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, TAU); ctx.stroke();

    // [WS-2] Laser telegraph sights (0.6s pre-fire) — bright converging lines
    if (e.laserTelegraphT > 0) {
      const tt = e.laserTelegraphT / 0.6; // 1 -> 0
      const widen = 220 * tt;
      const beamLen = 1600;
      const bx = Math.cos(e.laserTelegraphAng), by = Math.sin(e.laserTelegraphAng);
      // outer glow fan
      ctx.globalAlpha = 0.22 * (1 - tt);
      ctx.fillStyle = '#ffff66';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(bx * beamLen - by * widen, by * beamLen + bx * widen);
      ctx.lineTo(bx * beamLen + by * widen, by * beamLen - bx * widen);
      ctx.closePath(); ctx.fill();
      // core line
      ctx.globalAlpha = 0.75 + 0.25 * (1 - tt);
      ctx.strokeStyle = '#fffeaa';
      ctx.lineWidth = 2 + 3 * (1 - tt);
      ctx.shadowColor = '#ffff66'; ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(bx * beamLen, by * beamLen);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const dAng = Math.atan2(player.y - e.y, player.x - e.x);
    ctx.rotate(dAng);
    ctx.globalAlpha = 0.65 + 0.35 * pulse;
    ctx.fillStyle = '#f44';
    ctx.shadowColor = '#f44'; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(R * 0.42, 0); ctx.lineTo(R * 0.25 - 2, 5); ctx.lineTo(R * 0.25 - 2, -5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// ---- Minimap (bottom-right corner HUD, toggle N) ----
function drawMinimap() {
  const mmW = 180, mmH = 120;
  const mmX = W - mmW - 16, mmY = H - mmH - 16;
  const mapRange = 1200; // world units shown half-width

  // Background panel
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = '#060816';
  ctx.strokeStyle = '#1a3055';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(mmX, mmY, mmW, mmH, 4) : ctx.rect(mmX, mmY, mmW, mmH);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Clip to minimap bounds
  ctx.save();
  ctx.beginPath();
  ctx.rect(mmX, mmY, mmW, mmH);
  ctx.clip();

  // World-to-minimap transform
  const wx = (worldX) => mmX + mmW / 2 + (worldX - player.x) / mapRange * (mmW / 2);
  const wy = (worldY) => mmY + mmH / 2 + (worldY - player.y) / mapRange * (mmH / 2);

  // Grid lines (faint)
  ctx.strokeStyle = 'rgba(40, 80, 140, 0.35)';
  ctx.lineWidth = 0.5;
  for (let gx = -3; gx <= 3; gx++) {
    const sx = wx(player.x + gx * 300);
    ctx.beginPath(); ctx.moveTo(sx, mmY); ctx.lineTo(sx, mmY + mmH); ctx.stroke();
  }
  for (let gy = -3; gy <= 3; gy++) {
    const sy = wy(player.y + gy * 200);
    ctx.beginPath(); ctx.moveTo(mmX, sy); ctx.lineTo(mmX + mmW, sy); ctx.stroke();
  }
  // Celestial Planets on Minimap
  for (const p of PLANETS) {
    const mx = wx(p.x), my = wy(p.y);
    if (mx < mmX - 10 || mx > mmX + mmW + 10 || my < mmY - 10 || my > mmY + mmH + 10) continue;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 6;
    const pr = Math.max(3, Math.round(p.r / 25));
    ctx.beginPath(); ctx.arc(mx, my, pr, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Pickups (gems, hearts, chests)
  for (const g of gems) {
    const mx = wx(g.x), my = wy(g.y);
    if (mx < mmX || mx > mmX + mmW || my < mmY || my > mmY + mmH) continue;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = g.type === 'heart' ? '#f66' : g.type === 'chest' ? '#fa4' : '#4ff';
    ctx.fillRect(mx - 1, my - 1, 2, 2);
  }

  // Supply drop hazards
  for (const h of hazards) {
    if (h.type !== 'supply') continue;
    const mx = wx(h.x), my = wy(h.y);
    if (mx < mmX || mx > mmX + mmW || my < mmY || my > mmY + mmH) continue;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ff4';
    ctx.shadowColor = '#ff4'; ctx.shadowBlur = 4;
    ctx.fillRect(mx - 2, my - 2, 4, 4);
    ctx.shadowBlur = 0;
  }

  // Enemies
  for (const e of enemies) {
    if (e.spawnT > 0 || e.hp <= 0) continue;
    const mx = wx(e.x), my = wy(e.y);
    if (mx < mmX || mx > mmX + mmW || my < mmY || my > mmY + mmH) continue;

    if (e.boss) {
      // Pulsing boss marker
      const pulse = 0.6 + 0.4 * Math.sin(bgPulse * 8);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#f33';
      ctx.shadowColor = '#f33'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(mx, my - 5); ctx.lineTo(mx + 4, my + 3); ctx.lineTo(mx - 4, my + 3);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    } else if (e.elite) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#fa4';
      ctx.fillRect(mx - 2, my - 2, 4, 4);
    } else {
      const col = e.type === 'healer' ? '#4f8' : e.type === 'sniper' ? '#6df' : e.type === 'bomber' ? '#f84' : e.type === 'swarm' ? '#f66' : e.type === 'lurker' ? '#a4f' : '#f55';
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = col;
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // Player dot (center)
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0af';
  ctx.shadowColor = '#0af'; ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(mmX + mmW / 2, mmY + mmH / 2, 3.5, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore(); // remove clip

  // Frame border glow
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#1a4a7a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(mmX, mmY, mmW, mmH, 4) : ctx.rect(mmX, mmY, mmW, mmH);
  ctx.stroke();

  // Label
  ctx.globalAlpha = 0.55;
  ctx.font = 'bold 8px Courier New';
  ctx.fillStyle = '#4ff';
  ctx.textAlign = 'left';
  ctx.fillText('MINIMAP [N]', mmX + 4, mmY + 9);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';

  ctx.restore(); // from ctx.save at start
}

function drawBossIntro() {
  if (!bossIntro.active) return;
  const t = bossIntro.t;
  const introDur = 2.6;
  const fadeIn = clamp(t / 0.4, 0, 1);
  const fadeOut = clamp((introDur - t) / 0.4, 0, 1);
  const alpha = Math.min(fadeIn, fadeOut);
  const isReduced = typeof settings !== 'undefined' && settings.reducedFlash;

  // Darkened backdrop vignette during boss cinematic
  ctx.fillStyle = `rgba(4, 2, 12, ${0.42 * alpha})`;
  ctx.fillRect(0, 0, W, H);

  // Letterbox bars (top & bottom cinematic frame)
  const maxBarH = Math.min(85, H * 0.12);
  const barH = maxBarH * alpha;
  ctx.fillStyle = `rgba(8, 6, 20, ${0.95 * alpha})`;
  ctx.fillRect(0, 0, W, barH);
  ctx.fillRect(0, H - barH, W, barH);

  // Letterbox border lines
  ctx.strokeStyle = `rgba(255, 40, 80, ${0.85 * alpha})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#ff2255'; ctx.shadowBlur = 12 * alpha;
  ctx.beginPath();
  ctx.moveTo(0, barH);
  ctx.lineTo(W, barH);
  ctx.moveTo(0, H - barH);
  ctx.lineTo(W, H - barH);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Boss title splash card container & zoom animation
  const cardScale = 1.35 - 0.35 * Math.pow(fadeIn, 0.5);
  ctx.save();
  ctx.translate(W / 2, H * 0.35);
  ctx.scale(cardScale, cardScale);

  const bw = 540, bh = 140;
  ctx.fillStyle = `rgba(18, 6, 16, ${0.82 * alpha})`;
  ctx.strokeStyle = `rgba(255, 60, 100, ${0.85 * alpha})`;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#ff0044'; ctx.shadowBlur = 18 * alpha;
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
  ctx.shadowBlur = 0;

  // Blinking danger header
  if (!isReduced || Math.floor(t * 2) % 2 === 0) {
    if (Math.floor(t * 5) % 2 === 0 || isReduced) {
      ctx.font = '900 15px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255, 220, 60, ${alpha})`;
      ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 14 * alpha;
      ctx.fillText('⚠ DANGER // BOSS DETECTED ⚠', 0, -bh / 2 + 24);
    }
  }

  // Boss title name
  ctx.textAlign = 'center';
  ctx.font = '900 48px "Courier New", monospace';
  ctx.fillStyle = `rgba(255, 70, 100, ${alpha})`;
  ctx.shadowColor = '#ff0044'; ctx.shadowBlur = 28 * alpha;
  ctx.fillText(bossIntro.name, 0, 12);

  // Boss subtext splash description
  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.fillStyle = `rgba(255, 200, 140, ${alpha * 0.95})`;
  ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 10 * alpha;
  ctx.fillText(bossIntro.subtext, 0, bh / 2 - 18);

  ctx.restore();
  ctx.shadowBlur = 0;
}

function drawStars(camLeft, camTop) {
  // Deep-Space Nebula Dust Clouds — more and richer
  const nebulae = [
    { x: -300, y: -200, r: 700, col1: 'rgba(80, 20, 140, 0.14)', col2: 'rgba(0, 0, 0, 0)', pulse: 1.7 },
    { x: 500, y: 400, r: 750, col1: 'rgba(20, 80, 180, 0.12)', col2: 'rgba(0, 0, 0, 0)', pulse: 2.1 },
    { x: 600, y: -500, r: 620, col1: 'rgba(140, 30, 80, 0.13)', col2: 'rgba(0, 0, 0, 0)', pulse: 2.3 },
    { x: -500, y: 600, r: 700, col1: 'rgba(20, 140, 100, 0.11)', col2: 'rgba(0, 0, 0, 0)', pulse: 1.9 },
    { x: -800, y: -800, r: 580, col1: 'rgba(40, 20, 180, 0.10)', col2: 'rgba(0, 0, 0, 0)', pulse: 2.5 },
    { x: 900, y: 900, r: 640, col1: 'rgba(180, 40, 100, 0.10)', col2: 'rgba(0, 0, 0, 0)', pulse: 2.7 },
    { x: -900, y: 800, r: 550, col1: 'rgba(100, 120, 40, 0.08)', col2: 'rgba(0, 0, 0, 0)', pulse: 3.1 },
    { x: 800, y: -900, r: 600, col1: 'rgba(40, 180, 120, 0.09)', col2: 'rgba(0, 0, 0, 0)', pulse: 2.9 },
  ];
  for (const n of nebulae) {
    const nx = n.x - camLeft * 0.08, ny = n.y - camTop * 0.08;
    const pulse = 0.7 + 0.3 * Math.sin(bgPulse * n.pulse);
    const grad = ctx.createRadialGradient(nx, ny, 10, nx, ny, n.r * pulse);
    grad.addColorStop(0, n.col1);
    grad.addColorStop(1, n.col2);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(nx, ny, n.r * pulse, 0, TAU); ctx.fill();
  }

  // Dust motes (low parallax, faint drifting glows)
  for (const layer of DUST_LAYERS) {
    for (const d of layer.dust) {
      let x = (d.x - camLeft * d.parallax) % layer.tile;
      let y = (d.y - camTop * d.parallax) % layer.tile;
      if (x < 0) x += layer.tile;
      if (y < 0) y += layer.tile;
      if (x > W + 16 || y > H + 16 || x < -16 || y < -16) continue;
      const wobX = x + Math.sin(bgPulse * d.drift + d.driftOff) * 6;
      const wobY = y + Math.cos(bgPulse * d.drift + d.driftOff) * 6;
      ctx.globalAlpha = d.a * (0.6 + 0.4 * Math.sin(bgPulse * d.drift * 2 + d.driftOff));
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(wobX, wobY, d.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Multi-layer twinkling stars
  for (const layer of STAR_LAYERS) {
    const offX = -camLeft * layer.parallax;
    const offY = -camTop * layer.parallax;
    for (const st of layer.stars) {
      let x = (st.x + offX) % layer.tile;
      let y = (st.y + offY) % layer.tile;
      if (x < 0) x += layer.tile;
      if (y < 0) y += layer.tile;
      if (x > W + 8 || y > H + 8) continue;
      const twinkle = 0.6 + 0.4 * Math.sin(bgPulse * st.twinkle + st.twinkleOff);
      ctx.globalAlpha = st.baseA * twinkle;
      ctx.fillStyle = st.color;
      ctx.fillRect(x, y, st.r, st.r);
    }
    ctx.globalAlpha = 1;
  }
}

function drawGrid(camLeft, camTop) {
  const size = 90;
  const startX = Math.floor(camLeft / size) * size;
  const startY = Math.floor(camTop / size) * size;
  const bp = AudioSys.getBeatPulse();
  ctx.strokeStyle = `rgba(40, ${Math.floor(60 + bp * 50)}, ${Math.floor(130 + bp * 90)}, ${(0.13 + bp * 0.07).toFixed(3)})`;
  ctx.lineWidth = 1 + bp * 0.5;
  ctx.beginPath();
  for (let x = startX; x < camLeft + W + size; x += size) {
    ctx.moveTo(x - camLeft, 0);
    ctx.lineTo(x - camLeft, H);
  }
  for (let y = startY; y < camTop + H + size; y += size) {
    ctx.moveTo(0, y - camTop);
    ctx.lineTo(W, y - camTop);
  }
  ctx.stroke();
}

function drawPlanets() {
  // drawPlanets is called inside the world-space transform (translate(-camLeft,-camTop)).
  // We need screen-space coords to viewport-cull each planet and its gravity ring.
  const camLeft = camX - W / 2, camTop = camY - H / 2;
  for (const p of PLANETS) {
    const effectivePullR = p.pullR * 1.8;
    // Screen-space position of the planet centre
    const sx = p.x - camLeft, sy = p.y - camTop;
    // Cull entirely if neither planet body nor gravity ring edge touches viewport
    if (sx + effectivePullR < 0 || sx - effectivePullR > W ||
        sy + effectivePullR < 0 || sy - effectivePullR > H) continue;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Gravitational pull ring — only draw if ring edge is on screen
    if (sx + effectivePullR >= 0 && sx - effectivePullR <= W &&
        sy + effectivePullR >= 0 && sy - effectivePullR <= H) {
      const pulse = 0.5 + 0.5 * Math.sin(bgPulse * 2 + p.r);
      ctx.strokeStyle = p.ringCol;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = -bgPulse * 15;
      ctx.beginPath(); ctx.arc(0, 0, effectivePullR, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Only draw planet body + details if the planet itself is near the screen
    if (sx + p.r + 20 < 0 || sx - p.r - 20 > W ||
        sy + p.r + 20 < 0 || sy - p.r - 20 > H) {
      ctx.restore();
      continue;
    }

    const pulse = 0.5 + 0.5 * Math.sin(bgPulse * 2 + p.r);
    // Atmosphere glow
    ctx.fillStyle = p.ringCol;
    ctx.beginPath(); ctx.arc(0, 0, p.r + 14 + pulse * 4, 0, TAU); ctx.fill();

    // Planet body
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;

    // Surface texture / orbital rings
    if (p.type === 'gas') {
      ctx.rotate(bgPulse * 0.3);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, p.r * 1.35, -0.8, 0.8); ctx.stroke();
    } else if (p.type === 'volcanic') {
      ctx.fillStyle = '#ffa500';
      ctx.beginPath(); ctx.arc(p.r * 0.3, -p.r * 0.2, p.r * 0.25, 0, TAU); ctx.fill();
    }

    // Name label (ASCII only — no emoji to avoid smiley-face rendering artifacts)
    ctx.font = 'bold 10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.color;
    ctx.fillText(p.name, 0, p.r + 22);

    ctx.restore();
  }
}

// WS-6: siphon energy tendrils — glowing cyan/purple arcs from player to up to
// MAX_TENDRILS gems currently surging under magnet pull. One batched pass:
// shadowBlur is set/reset exactly once (not per line) to avoid GPU state thrash.
const MAX_TENDRILS = 24;
function drawSiphonTendrils() {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowBlur = 8;
  let drawn = 0;
  for (const g of gems) {
    if (drawn >= MAX_TENDRILS) break;
    if (!g._surge || g.type !== 'gem') continue;
    const dx = g.x - player.x, dy = g.y - player.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const t = clamp(1 - d / 700, 0.15, 0.85);
    const purple = ((g.value >= 4) || (drawn & 1)) === true;
    const col = purple ? '#a64dff' : '#22e6ff';
    const midX = player.x + dx * 0.5 + (-dy / d) * Math.sin(g.bobT * 4) * 12;
    const midY = player.y + dy * 0.5 + (dx / d) * Math.sin(g.bobT * 4) * 12;
    ctx.globalAlpha = t * (0.55 + 0.45 * Math.sin(time * 22 + drawn));
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.lineWidth = 1.5 + t * 1.5;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.quadraticCurveTo(midX, midY, g.x, g.y);
    ctx.stroke();
    drawn++;
  }
  ctx.restore();
}

function drawGem(g) {
  const bob = Math.sin(g.bobT) * 3;
  ctx.save();
  ctx.translate(g.x, g.y + bob);
  if (g.type === 'gem') {
    const big = g.value >= 8;
    const col = big ? '#fa4' : g.value >= 4 ? '#f4f' : '#4ff';
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = big ? 16 : 10;
    const s = big ? 6 : 4.4;
    ctx.fillRect(-s / 2, -s / 2, s, s);
  } else if (g.type === 'overcharge') {
    const pulse = 0.7 + 0.3 * Math.sin(bgPulse * 12);
    ctx.shadowColor = '#ff4'; ctx.shadowBlur = 18 * pulse;
    ctx.fillStyle = '#ff4';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-4, 2); ctx.lineTo(2, 2); ctx.lineTo(-1, 7); ctx.lineTo(5, -1); ctx.lineTo(0, -1); ctx.closePath(); ctx.fill();
  } else if (g.type === 'warp') {
    const pulse = 0.7 + 0.3 * Math.sin(bgPulse * 10);
    ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 20 * pulse;
    ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#caf0f8';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
  } else if (g.type === 'heart') {
    drawShapePts(SHAPES.heart, 0, 0, 1.3);
  } else if (g.type === 'shock') {
    drawShapePts(SHAPES.star, 0, 0, 1.2);
  } else if (g.type === 'chest') {
    ctx.fillStyle = '#fa4';
    ctx.shadowColor = '#fa4'; ctx.shadowBlur = 18;
    ctx.fillRect(-9, -7, 18, 14);
    ctx.fillStyle = '#6a4';
    ctx.fillRect(-9, -7, 18, 5);
    ctx.fillStyle = '#ff4';
    ctx.fillRect(-3, -3, 6, 6);
  } else if (g.type === 'nuke') {
    // Nuke pickup: pulsing radioactive symbol
    const pulse = 0.7 + 0.3 * Math.sin(bgPulse * 8);
    ctx.shadowColor = '#f0f'; ctx.shadowBlur = 20 * pulse;
    ctx.fillStyle = `rgba(255, 0, 255, ${pulse})`;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
    // radiation trefoil blades
    for (let k = 0; k < 3; k++) {
      const a = k * TAU / 3 + Math.PI / 2;
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = `rgba(255, 0, 255, ${pulse})`;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.arc(0, -10, 5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  } else if (g.type === 'shield') {
    const pulse = 0.7 + 0.3 * Math.sin(bgPulse * 6);
    ctx.shadowColor = '#4df'; ctx.shadowBlur = 16 * pulse;
    ctx.fillStyle = `rgba(120, 200, 255, ${pulse})`;
    ctx.strokeStyle = '#4df';
    ctx.lineWidth = 2;
    // hexagonal shield shape
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU - Math.PI / 2;
      const r = 10;
      if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dff';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawHazard(h) {
  if (h.type === 'supply') {
    const alpha = clamp(1 - h.t / 2.4, 0, 1);
    const rarity = h.rarity || 'common';
    const col = rarity === 'epic' ? '#f4f' : rarity === 'rare' ? '#4df' : '#ff4';
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(bgPulse * 10) * alpha;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = rarity === 'epic' ? 16 : rarity === 'rare' ? 10 : 0;
    ctx.lineWidth = rarity === 'epic' ? 3 : rarity === 'rare' ? 2.5 : 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(-h.r * 0.7, 0); ctx.lineTo(h.r * 0.7, 0); ctx.moveTo(0, -h.r * 0.7); ctx.lineTo(0, h.r * 0.7); ctx.stroke();
    // Epic+ gets rotating outer tri-spikes
    if (rarity !== 'common') {
      ctx.rotate(bgPulse * 1.5);
      ctx.globalAlpha *= 0.7;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU;
        ctx.moveTo(Math.cos(a) * h.r * 1.3, Math.sin(a) * h.r * 1.3);
        ctx.lineTo(Math.cos(a + 0.4) * h.r * 1.5, Math.sin(a + 0.4) * h.r * 1.5);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.shadowBlur = 0;
  } else if (h.type === 'boom') {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#fa2';
    ctx.lineWidth = 3;
    const grow = (1 - h.t / 0.5);
    ctx.beginPath(); ctx.arc(0, 0, h.r * grow, 0, TAU); ctx.stroke();
    ctx.restore();
    } else if (h.type === 'pylon') {
      ctx.save();
      ctx.translate(h.x, h.y);
      const col = h.element === 'frost' ? '#00ffff' : '#ff4400';
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.rotate(bgPulse * 1.2);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        const rx = Math.cos(a) * 14, ry = Math.sin(a) * 14;
        if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
      }
      ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(bgPulse * 6);
      ctx.fill();
      ctx.restore();
    } else if (h.type === 'web') {
    // Weaver web: translucent concentric teal rings, fading over its lifetime
    ctx.save();
    ctx.translate(h.x, h.y);
    const fade = clamp(h.t / 4, 0, 1);
    ctx.globalAlpha = 0.34 * fade;
    ctx.strokeStyle = '#6fd';
    ctx.shadowColor = '#6fd'; ctx.shadowBlur = 8;
    for (let k = 1; k <= 3; k++) {
      ctx.lineWidth = k === 3 ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, h.r * k / 3 + Math.sin(bgPulse * 4 + k) * 2, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  } else if (h.type === 'shrine') {
    // WS-5 Void Shrine: dark-violet pulsing ground glyph — nested rune rings + core eye.
    ctx.save();
    ctx.translate(h.x, h.y);
    const puls = 0.55 + 0.45 * Math.sin((h.pulse || 0) * 5);
    const fade = clamp(h.t / 6, 0, 1); // dims as it nears expiry
    ctx.globalAlpha = fade;
    ctx.shadowColor = '#b2f'; ctx.shadowBlur = 14 * puls;
    // outer rotating rune ring
    ctx.strokeStyle = `rgba(178,102,255,${0.5 + 0.4 * puls})`;
    ctx.lineWidth = 2.5;
    ctx.save();
    ctx.rotate((h.pulse || 0) * 0.9);
    ctx.setLineDash([10, 6]);
    ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // rune ticks
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU;
      ctx.moveTo(Math.cos(a) * h.r * 0.82, Math.sin(a) * h.r * 0.82);
      ctx.lineTo(Math.cos(a) * h.r * 0.98, Math.sin(a) * h.r * 0.98);
    }
    ctx.stroke();
    ctx.restore();
    // inner counter-rotating ring
    ctx.strokeStyle = `rgba(140,80,238,${0.4 + 0.3 * puls})`;
    ctx.lineWidth = 1.5;
    ctx.save();
    ctx.rotate(-(h.pulse || 0) * 1.4);
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU;
      const px = Math.cos(a) * h.r * 0.6, py = Math.sin(a) * h.r * 0.6;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
    // core eye
    ctx.fillStyle = `rgba(214,190,255,${0.6 + 0.4 * puls})`;
    ctx.beginPath(); ctx.arc(0, 0, h.r * 0.16 * (1 + 0.15 * puls), 0, TAU); ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }
}
// flat array in-place (no per-frame allocation) and batches same-color rects into
// a single path so a multi-part ship costs one fill per color, not per vertex.
const SHAPE_GROUPS = new Map();
function buildShapeGroups() {
  SHAPE_GROUPS.clear();
  for (const key in SHAPES) {
    const pts = SHAPES[key];
    const groups = [];
    const idx = new Map();
    for (const p of pts) {
      let g = idx.get(p.c);
      if (!g) { g = { c: p.c, pts: [] }; idx.set(p.c, g); groups.push(g); }
      g.pts.push(p);
    }
    SHAPE_GROUPS.set(key, groups);
  }
}
buildShapeGroups();

// Pre-bucketed shapes: compute shaded color bins once at buildShapes time,
// then reuse per-frame so drawShapePts never allocates a Map.
const _shapeBuckets = new Map();
function _bucketShape(pts, key) {
  if (!pts || pts.length < 3) return;
  const radius = (SHAPES_RADII && SHAPES_RADII[key]) || 12;
  // Pre-compute for a neutral light direction; at draw time we tint via globalAlpha.
  const buckets = [];
  const seen = new Map();
  for (const p of pts) {
    const col = (typeof p.c === 'string' && p.c[0] === '#') ? p.c : (p.c || '#fff');
    let b = seen.get(col);
    if (!b) { b = []; seen.set(col, b); buckets.push({ col, pts: b }); }
    b.push(p);
  }
  _shapeBuckets.set(key, buckets);
}

function drawShapePts(pts, ox, oy, scale, rotAng) {
  if (!pts || pts.length < 3) return;
  const key = _shapeByPts(pts);
  let buckets = _shapeBuckets.get(key);
  if (!buckets) { _bucketShape(pts, key); buckets = _shapeBuckets.get(key); }
  if (!buckets) return;

  const sCos = rotAng ? Math.cos(rotAng) : 1, sSin = rotAng ? Math.sin(rotAng) : 0;
  const lx = LIGHT_X * sCos + LIGHT_Y * sSin;
  const ly = -LIGHT_X * sSin + LIGHT_Y * sCos;
  const radius = (SHAPES_RADII && SHAPES_RADII[key]) || 12;

  for (const bucket of buckets) {
    const baseCol = bucket.col;
    // Quick per-vertex shade averaging for the bucket
    let dotSum = 0, n = 0;
    for (const p of bucket.pts) { dotSum += Math.max(-1, Math.min(1, (p.x / radius) * lx + (p.y / radius) * ly)); n++; }
    const dot = dotSum / n;
    const col = shadeColor(baseCol, 0.42 * dot);
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.beginPath();
    for (const p of bucket.pts) {
      const s = (p.s || 2.4) * scale;
      ctx.rect(ox + p.x * scale - s / 2, oy + p.y * scale - s / 2, s, s);
    }
    ctx.fill();
  }
}
// registry key + radius lookups for the shape arrays (identity-based)
const _ptsToKey = new Map();
for (const key in SHAPES) _ptsToKey.set(SHAPES[key], key);
function _shapeByPts(pts) { return _ptsToKey.get(pts); }
const SHAPES_RADII = { player: 16, dot: 7, tri: 11, quad: 14, penta: 17, boss1: 40, boss2: 46, boss3: 52,
  sniper: 9, healer: 11, bomber: 12, swarm: 4, lurker: 12, weaver: 10, bulwark: 18, necro: 13,
  mirage: 10, leech: 5, carrier: 19, heart: 8, star: 8, diamond: 5 };

function drawEnemy(e) {
  // If enemy is dead or decaying corpse, do not render body/remnants
  if (e.deadT || e.hp <= 0) return;
  // Submerged Lurker: hidden body, only a faint churning tell (ground ripple).
  if (e.sub) {
    ctx.save();
    ctx.translate(e.x, e.y);
    const t = bgPulse * 8;
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#a4f';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#a4f'; ctx.shadowBlur = 8;
    for (let k = 0; k < 2; k++) {
      const rr = e.r + 4 + Math.sin(t + k * 2.1) * 4 + k * 7;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    return;
  }
  // Phantom phasing: skip body draw, leave only a faint dissipating echo ring
  if (e.phasing > 0) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.globalAlpha = 0.28 * (e.phasing / 0.25);
    ctx.strokeStyle = '#d6f';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#d6f'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(0, 0, e.r * (1 + (0.25 - e.phasing) * 2.2), 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    return;
  }
  ctx.save();
  ctx.translate(e.x, e.y);
  // Splitter fission telegraph: pulsing amber warning ring as lethal damage lands
  if (e.splitTele > 0) {
    const sp = 0.5 + 0.5 * Math.sin(bgPulse * 26);
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.4 * sp;
    ctx.strokeStyle = '#fa7';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#fa7'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(0, 0, e.r + 5 + sp * 9, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // Breach telegraph: bright expanding warning ring under the Lurker.
  if (e.type === 'lurker' && e.lurkState === 'breach') {
    const frac = 1 - (e.lurkT / 0.55);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(bgPulse * 24);
    ctx.strokeStyle = '#d6f';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#a4f'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(0, 0, e.r + 10 + frac * 22, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // Elite aura circle — drawn before rotate (radially symmetric)
  if (e.elite && e.auraType && e.spawnT <= 0) {
    const colMap = { fortify: '#4a4', swift: '#4df', rage: '#f84', molten: '#ff4400', vortex: '#aa44ff', reflective: '#ffea00', chrono: '#00ffff' };
    const col = colMap[e.auraType] || '#f84';
    const pulse = 0.6 + 0.4 * Math.sin(e.auraPulse || 0);
    ctx.globalAlpha = 0.10 + 0.07 * pulse;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, e.auraR, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.32 + 0.28 * pulse;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -(e.auraPulse * 14);
    ctx.beginPath(); ctx.arc(0, 0, e.auraR, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }
  // Necro revive aura: soft jade circle showing its resurrection radius.
  if (e.necro && !e.deadT && e.spawnT <= 0) {
    ctx.globalAlpha = 0.06 + 0.04 * Math.sin(bgPulse * 3);
    ctx.fillStyle = '#3f6';
    ctx.beginPath(); ctx.arc(0, 0, e.auraR, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.22 + 0.12 * Math.sin(bgPulse * 3);
    ctx.strokeStyle = '#5d8'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = -(bgPulse * 40);
    ctx.beginPath(); ctx.arc(0, 0, e.auraR, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.rotate(e.ang);
  const flashing = e.hitT > 0;
  if (e.spawnT > 0) {
    ctx.globalAlpha = 1 - e.spawnT / 0.6;
    ctx.scale(1 + e.spawnT, 1 + e.spawnT);
  }
  const pts = SHAPES[e.type] || SHAPES.dot;
  if (flashing) {
    if (settings.reducedFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
    } else {
      ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 18;
    }
    for (const p of pts) { const s = (p.s || 2.4); ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); }
  } else {
    // LOD: simplify to solid circle for plain enemies when count > 60
    if (enemies.length > 60 && !e.elite && !e.boss && !e.necro && e.type !== 'healer') {
      const ecol = (ENEMY_TYPES[e.type] && ENEMY_TYPES[e.type].color) || '#4f8';
      ctx.fillStyle = ecol;
      ctx.shadowColor = ecol; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.75, 0, TAU); ctx.fill();
    } else {
      const scale = (e.elite ? 1.5 : 1);
      drawShapePts(pts, 0, 0, (e.r / (ENEMY_TYPES[e.type].r)) * scale, e.ang || 0);
    }
  }
  ctx.restore();
  if (e.elite) {
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(bgPulse * 6);
    ctx.strokeStyle = '#fa4';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Warden orbit shields: render remaining shards so soak count is readable.
  if (e.type === 'warden' && e.shields > 0) {
    const sr = e.r + 11;
    for (let si = 0; si < e.shields; si++) {
      const sa = e.shieldAng + (si / 3) * TAU;
      const sx = e.x + Math.cos(sa) * sr;
      const sy = e.y + Math.sin(sa) * sr;
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(bgPulse * 5 + si);
      ctx.fillStyle = '#86e';
      ctx.shadowColor = '#86e'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  // Enraged boss pulsing crimson corona
  if (e.boss && e.enraged) {
    const ep = 0.5 + 0.5 * Math.sin(bgPulse * 9);
    const isReduced = typeof settings !== 'undefined' && settings.reducedFlash;
    ctx.globalAlpha = isReduced ? 0.2 : (0.35 + 0.2 * ep);
    ctx.strokeStyle = '#ff2244';
    ctx.shadowColor = '#ff0033'; ctx.shadowBlur = 24;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6 + ep * 4, 0, TAU); ctx.stroke();
    ctx.globalAlpha = isReduced ? 0.1 : (0.18 + 0.1 * ep);
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 14 + ep * 6, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  // bulwark frontal shield arc: bright rim across its facing ~60° cone.
  if (e.type === 'bulwark' && !e.deadT) {
    const f = e.facing === undefined ? 0 : e.facing;
    const pulse = 0.55 + 0.25 * Math.sin(bgPulse * 4);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#86e'; ctx.lineWidth = 4;
    ctx.shadowColor = '#86e'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, f - 1.15, f + 1.15); ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  // healer aura
  if (e.type === 'healer') {
    ctx.globalAlpha = 0.12 + 0.05 * Math.sin(bgPulse * 5);
    ctx.strokeStyle = '#6f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.arc(e.x, e.y, e.auraR, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  if (e.boss && e.hp < e.maxHp) {
    const w = e.r * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 18, w, 6);
    ctx.fillStyle = '#f33';
    ctx.shadowColor = '#f33'; ctx.shadowBlur = 8;
    ctx.fillRect(e.x - w / 2, e.y - e.r - 18, w * clamp(e.hp / e.maxHp, 0, 1), 6);
    ctx.shadowBlur = 0;
  }
  // Skip expensive status ring draws for plain enemies in large crowds
  if (e.elite || e.boss || enemies.length < 80) drawEnemyStatusRings(e);
}

function drawFrostCone(w) {
  const def = WEAPON_DEFS.frost;
  const range = def.ranges[w.level - 1];
  const aperture = def.apertures[w.level - 1];
  const a = w.aimA;
  const a1 = a - aperture / 2, a2 = a + aperture / 2;

  ctx.save();
  ctx.translate(player.x, player.y);
  // WS-3 INFERNO BEAM: super state paints the cone as aurora-plasma orange/cyan.
  const inferno = !!w.super;
  // outer arc wedge
  const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, range);
  if (grad && grad.addColorStop) {
    if (inferno) {
      grad.addColorStop(0, 'rgba(255, 140, 60, 0.38)');
      grad.addColorStop(0.5, 'rgba(255, 110, 40, 0.20)');
      grad.addColorStop(0.85, 'rgba(80, 200, 255, 0.10)');
      grad.addColorStop(1, 'rgba(80, 200, 255, 0)');
    } else {
      grad.addColorStop(0, 'rgba(140, 220, 255, 0.35)');
      grad.addColorStop(0.5, 'rgba(140, 200, 255, 0.18)');
      grad.addColorStop(1, 'rgba(140, 200, 255, 0)');
    }
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = inferno ? 'rgba(255, 140, 60, 0.16)' : 'rgba(140, 208, 255, 0.16)';
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, range, a1, a2);
  ctx.closePath();
  ctx.fill();

  // dense bright core ray at center
  ctx.fillStyle = inferno ? `rgba(255, 170, 80, ${0.45 + 0.3 * (w.heat || 0)})` : `rgba(200, 240, 255, ${0.4 + 0.3 * (w.heat || 0)})`;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, range * 0.96, a - aperture * 0.18, a + aperture * 0.18);
  ctx.closePath();
  ctx.fill();

  // sparkle motes
  if (frameCount % 4 === 0) {
    const dx = Math.cos(a + rand(-aperture / 2, aperture / 2)) * rand(40, range);
    const dy = Math.sin(a + rand(-aperture / 2, aperture / 2)) * rand(40, range);
    pushParticle({ type: 'shard', x: player.x + dx, y: player.y + dy, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, maxLife: 0.3, color: '#8ff', size: rand(1, 2.5) });
  }
  ctx.restore();
}

function drawSaws(w) {
  const def = WEAPON_DEFS.saws;
  const n = def.counts[w.level - 1];
  const radius = def.radii[w.level - 1];
  ctx.strokeStyle = `rgba(255, 170, 68, ${0.25 + 0.3 * (w.heat || 0)})`; // WS-E heat glow
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(player.x, player.y, radius, 0, TAU); ctx.stroke();
  const hyper = !!w.super; // WS-3 HYPER SAWS: alternating orange/bolt-yellow blades
  for (let s = 0; s < n; s++) {
    const a = w.ang + s / n * TAU;
    const sx = player.x + Math.cos(a) * radius;
    const sy = player.y + Math.sin(a) * radius;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(frameCount * (hyper ? 0.45 : 0.3) + s);
    const col = hyper && s % 2 === 1 ? '#fd4' : '#fa4';
    ctx.fillStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = hyper ? 20 : 14;
    for (let k = 0; k < 3; k++) {
      ctx.rotate(TAU / 3);
      ctx.fillRect(-2.5, -13, 5, 13);
    }
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // Twin-arc idle shimmer so the overcharge reads even between contacts.
  if (hyper && frameCount % 6 === 0) {
    const a = w.ang + rand(0, TAU);
    pushParticle({ type: 'shard', x: player.x + Math.cos(a) * radius, y: player.y + Math.sin(a) * radius, vx: rand(-40, 40), vy: rand(-40, 40), life: 0.25, maxLife: 0.25, color: pick(['#fa4', '#fd4']), size: 3 });
  }
}

function drawPrism(w) {
  const def = WEAPON_DEFS.prism;
  const n = def.counts[w.level - 1];
  const radius = def.radii[w.level - 1];
  // Faint orbit guide ring.
  ctx.strokeStyle = `rgba(136, 255, 255, ${0.18 + 0.3 * (w.heat || 0)})`; // WS-E heat glow
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(player.x, player.y, radius, 0, TAU); ctx.stroke();
  for (let s = 0; s < n; s++) {
    const a = w.ang + s / n * TAU;
    const sx = player.x + Math.cos(a) * radius;
    const sy = player.y + Math.sin(a) * radius;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(frameCount * 0.22 + s * TAU / n);
    // Prismatic shard: two nested triangles for a faceted neon look.
    ctx.fillStyle = '#b6f6ff';
    ctx.shadowColor = '#8ff'; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-7, 7); ctx.lineTo(-7, -7);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4ff';
    ctx.beginPath();
    ctx.moveTo(5, 0); ctx.lineTo(-4, 4.5); ctx.lineTo(-4, -4.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// Ship customization palette — persisted per run, unlocked by achievements
let shipPalette = { primary: '#00b4d8', accent: '#00f0ff', engine: '#00ffff', cockpit: '#caf0f8', trail: '#ff4', index: 0 };
const SHIP_PALETTES = [
  { name: 'CYBER BLUE', primary: '#00b4d8', accent: '#00f0ff', engine: '#00ffff', cockpit: '#caf0f8', trail: '#ff4' },
  { name: 'VOID CRIMSON', primary: '#c0392b', accent: '#ff4466', engine: '#ff6644', cockpit: '#ffaaaa', trail: '#ff4400' },
  { name: 'NEON LIME', primary: '#39ff14', accent: '#aaff00', engine: '#ccff00', cockpit: '#eaffaa', trail: '#ffff00' },
  { name: 'GOLD PHANTOM', primary: '#b8860b', accent: '#ffd700', engine: '#ffaa00', cockpit: '#ffeebb', trail: '#ffcc00' },
  { name: 'PLASMA VIOLET', primary: '#8b00ff', accent: '#da70d6', engine: '#ff00ff', cockpit: '#eeaaff', trail: '#ff44ff' },
  { name: 'ARCTIC GHOST', primary: '#88ccff', accent: '#aaddff', engine: '#ffffff', cockpit: '#ffffff', trail: '#ccffff' },
  { name: 'EMBER SHARD', primary: '#ff6600', accent: '#ff9944', engine: '#ffcc00', cockpit: '#ffdd88', trail: '#ff8800' },
  { name: 'DARK MATTER', primary: '#222244', accent: '#4466cc', engine: '#6699ff', cockpit: '#aaccff', trail: '#3366ff' },
];
function cycleShipPalette(forward) {
  shipPalette.index = (shipPalette.index + (forward ? 1 : SHIP_PALETTES.length - 1)) % SHIP_PALETTES.length;
  const p = SHIP_PALETTES[shipPalette.index];
  Object.assign(shipPalette, p);
  _shapeBuckets.delete('player'); _bucketShape(SHAPES.player, 'player');
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  if (player.iframe > 0) ctx.globalAlpha = 0.45 + 0.3 * Math.sin(bgPulse * 40);
  ctx.rotate(player.ang);

  // Gravity pull distortion — ship stretches toward strongest gravity source
  let gravStretchX = 1, gravStretchY = 1, gravGlowCol = null;
  let maxPull = 0;
  for (const p of PLANETS) {
    const dx = p.x - player.x, dy = p.y - player.y;
    const d2 = dx * dx + dy * dy;
    const effR = p.pullR * 1.8;
    if (d2 < effR * effR && d2 > (p.r + 15) * (p.r + 15)) {
      const d = Math.sqrt(d2);
      const pullFactor = Math.pow(1 - (d - p.r) / (effR - p.r), 0.8);
      if (pullFactor > maxPull) {
        maxPull = pullFactor;
        gravStretchX = 1 + pullFactor * 0.3;
        gravStretchY = 1 - pullFactor * 0.15;
        // Bend toward planet
        const gAng = Math.atan2(p.y - player.y, p.x - player.x) - player.ang;
        ctx.rotate(Math.sin(gAng) * pullFactor * 0.15);
        gravGlowCol = p.color;
      }
    }
  }
  // Elite vortex aura pull effect
  for (const a of enemies) {
    if (!a.elite || a.auraType !== 'vortex' || a.spawnT > 0 || a.hp <= 0) continue;
    const dx = player.x - a.x, dy = player.y - a.y;
    if (dx * dx + dy * dy < a.auraR * a.auraR && dx * dx + dy * dy > 100) {
      const d = Math.sqrt(dx * dx + dy * dy);
      const pullF = (1 - d / a.auraR);
      if (pullF > maxPull) {
        maxPull = pullF;
        gravStretchX = 1 + pullF * 0.25;
        gravStretchY = 1 - pullF * 0.12;
        gravGlowCol = '#aa44ff';
      }
    }
  }

  // Dynamic 3D Roll/Tilt calculated from lateral velocity
  const speedNorm = Math.hypot(player.vx, player.vy) / player.speed;
  const perpVx = -Math.sin(player.ang) * player.vx + Math.cos(player.ang) * player.vy;
  const roll = clamp(perpVx / (player.speed * 0.8), -0.35, 0.35);

  // Dual Plasma Thruster Trails — custom color
  const thrusterPulse = 0.8 + 0.3 * Math.sin(bgPulse * 30);
  const trailLen = clamp(speedNorm, 0.2, 1.0) * (14 + Math.random() * 8) * thrusterPulse;
  ctx.fillStyle = shipPalette.engine;
  ctx.shadowColor = shipPalette.engine; ctx.shadowBlur = 14;
  ctx.fillRect(-16 - trailLen, -5, trailLen, 3);
  ctx.fillRect(-16 - trailLen, 2, trailLen, 3);
  // Extra flame burst at tips
  if (speedNorm > 0.5) {
    const flameA = clamp(speedNorm - 0.5, 0, 0.5) * 2;
    ctx.globalAlpha = flameA;
    ctx.fillStyle = shipPalette.trail;
    ctx.shadowColor = shipPalette.trail;
    ctx.fillRect(-16 - trailLen - 4, -5, 6, 3);
    ctx.fillRect(-16 - trailLen - 4, 2, 6, 3);
    ctx.globalAlpha = player.iframe > 0 ? 0.45 + 0.3 * Math.sin(bgPulse * 40) : 1;
  }

  // Gravity distortion on hull
  ctx.save();
  ctx.transform(gravStretchX, roll * 0.4, 0, gravStretchY * (1 - Math.abs(roll) * 0.2), 0, 0);

  // Layer 1: Pseudo-3D Drop Shadow / Lower Ventral Chassis
  ctx.fillStyle = 'rgba(10, 15, 30, 0.9)';
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-14, 15);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-14, -15);
  ctx.closePath(); ctx.fill();

  // Layer 2: Main Outer Hull Wings (custom palette)
  ctx.fillStyle = shipPalette.primary;
  ctx.shadowColor = shipPalette.accent; ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.strokeStyle = shipPalette.accent;
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-12, 13);
  ctx.lineTo(-6, 4);
  ctx.lineTo(-14, 0);
  ctx.lineTo(-6, -4);
  ctx.lineTo(-12, -13);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Layer 3: Raised Dorsal Spine / Cockpit Canopy
  ctx.fillStyle = shipPalette.cockpit;
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(0, 4);
  ctx.lineTo(-8, 0);
  ctx.lineTo(0, -4);
  ctx.closePath(); ctx.fill();

  ctx.restore(); // end gravity+roll transform

  // Gravity energy tendrils — particles streaming off ship toward planet
  if (gravGlowCol && maxPull > 0.08 && Math.random() < maxPull * 2) {
    pushParticle({ type: 'shard', x: player.x + rand(-8, 8), y: player.y + rand(-8, 8), vx: rand(-30, 30), vy: rand(-30, 30), life: 0.3, maxLife: 0.3, color: gravGlowCol, size: rand(1.5, 3) });
  }

  // Damage pop
  if (player.hitPop > 0) {
    const pf = clamp(player.hitPop / 0.16, 0, 1);
    ctx.globalAlpha = pf * 0.9;
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#f66'; ctx.shadowBlur = 22;
    drawShapePts(SHAPES.player, 0, 0, 1 + (1 - pf) * 0.25, player.ang);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Gravity glow ring around ship
  if (gravGlowCol && maxPull > 0.05) {
    ctx.globalAlpha = maxPull * 0.35;
    ctx.strokeStyle = gravGlowCol;
    ctx.lineWidth = 2;
    ctx.shadowColor = gravGlowCol; ctx.shadowBlur = 16;
    ctx.setLineDash([5, 8]);
    ctx.lineDashOffset = -bgPulse * 30;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 14 + maxPull * 12, 0, TAU); ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = 0.045;
  ctx.fillStyle = '#4ff';
  ctx.beginPath(); ctx.arc(player.x, player.y, player.magnet, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // dash cooldown indicator
  if (player.dashCd > 0) {
    const frac = 1 - clamp(player.dashCd / 2.2, 0, 1);
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#4ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 8, -Math.PI / 2, -Math.PI / 2 + frac * TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // active shield hexagon ring
  if (player.shield && player.shield.hits > 0) {
    const frac = clamp(player.shield.t / 7, 0, 1);
    const pulse = 0.65 + 0.35 * Math.sin(bgPulse * 7);
    ctx.globalAlpha = (0.3 + 0.45 * frac) * pulse;
    ctx.strokeStyle = '#4df';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#4df'; ctx.shadowBlur = 18;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + bgPulse * 1.2;
      const r = player.r + 12;
      if (k === 0) ctx.moveTo(player.x + Math.cos(a) * r, player.y + Math.sin(a) * r);
      else ctx.lineTo(player.x + Math.cos(a) * r, player.y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

function drawShockwave(s) {
  const alpha = clamp(1 - s.r / s.maxR, 0, 1);
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = s.color || (s.hostile ? '#fa2' : s.nova ? '#8ff' : '#ff4');
  ctx.lineWidth = s.hostile ? 6 : s.nova ? 5 : 7;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 22;
  ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawParticle(p) {
  const a = clamp(p.life / p.maxLife, 0, 1);
  ctx.globalAlpha = a;
  if (p.type === 'shard') {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  } else if (p.type === 'line') {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.w || 2;
    ctx.shadowColor = p.color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
    ctx.shadowBlur = 0;
  } else if (p.type === 'beam') {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.w * a;
    ctx.shadowColor = p.color; ctx.shadowBlur = 28;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x2, p.y2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // hot core
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1, p.w * 0.25 * a);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x2, p.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawFloatTexts() {
  ctx.textAlign = 'center';
  for (const t of floatTexts) {
    const a = clamp(t.life / t.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = (t.big ? 'bold 20px' : 'bold 14px') + ' Courier New';
    ctx.fillStyle = '#000';
    ctx.fillText(t.text, t.x + 1, t.y + 1);
    ctx.fillStyle = t.color;
    ctx.shadowColor = t.color; ctx.shadowBlur = 8;
    ctx.fillText(t.text, t.x, t.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawComboHud() {
  if (combo < 3 || state !== 'playing') return;
  ctx.textAlign = 'right';
  ctx.globalAlpha = clamp(comboTimer, 0, 1);
  ctx.font = 'bold 18px Courier New';
  ctx.fillStyle = combo >= 25 ? '#f4f' : combo >= 10 ? '#ff4' : '#4ff';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
  const label = 'COMBO x' + combo;
  ctx.fillText(label, W - 24, 60);
  const frac = clamp(comboTimer / 2.0, 0, 1);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = ctx.fillStyle;
  ctx.fillRect(W - 24 - ctx.measureText(label).width, 70, ctx.measureText(label).width * frac, 3);
  ctx.globalAlpha = 1;
}

// ---------------- Mid-run save / continue (WS-G) ----------------
// Compact snapshot of run progress, serialized at most once per 15s (and on
// beforeunload). NO enemy/particle/projectile state — a resumed run respawns a
// fresh field at the same timestamp by design.
const RUN_SAVE_VERSION = 2;
const RUN_SAVE_KEY = 'neonSurvivorsRunSave';
let runSaveTimer = 0;

function buildRunSnapshot() {
  return {
    v: RUN_SAVE_VERSION,
    s: {
      hp: Math.round(player.hp), maxHp: player.maxHp, level: player.level,
      xp: player.xp, xpNeed: player.xpNeed, speed: player.speed, magnet: player.magnet,
      luck: player.luck || 0, cdMul: player.cdMul, critChance: player.critChance,
      critMul: player.critMul, armor: player.armor, regen: player.regen, xpBonus: player.xpBonus,
    },
    w: player.weapons.map(w => {
      const o = { id: w.id, level: w.level, evolved: !!w.evolved };
      if ('milestoneBoost' in w) o.milestoneBoost = w.milestoneBoost; // Agent-Arsenal field (optional)
      if ('super' in w) o.super = !!w.super; // WS-3 Tier-6 SUPER OVERCHARGE flag
      o.heat = ('heat' in w) ? w.heat : 0;
      return o;
    }),
    time, kills, gems: gemsCollected, comboBest,
    seed: currentRunSeedStr || 'STANDARD', mode: runMode || 'standard',
    muts: (activeMutations || []).map(m => m.id),
  };
}
function saveRunSave() {
  if (state !== 'playing') return false;
  safeSave(RUN_SAVE_KEY, buildRunSnapshot());
  return true;
}
// Throttled snapshot tick — called from update(dt), real work only every 15s.
function tickRunSave(dt) {
  runSaveTimer -= dt;
  if (runSaveTimer <= 0) { runSaveTimer = 15; saveRunSave(); }
}
function clearRunSave() {
  try { localStorage.removeItem(RUN_SAVE_KEY); } catch (e) {}
}
function loadRunSave() {
  let d = null;
  try {
    const raw = localStorage.getItem(RUN_SAVE_KEY);
    if (raw != null) d = JSON.parse(raw);
  } catch (e) { d = null; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  if (d.v !== RUN_SAVE_VERSION) { clearRunSave(); return null; } // unknown version: ignore + clear
  if (!d.s || !Array.isArray(d.w) || typeof d.time !== 'number' || !isFinite(d.time) || d.time < 0) { clearRunSave(); return null; }
  return d;
}
function hasRunSave() {
  return loadRunSave() != null;
}
function updateContinueButton() {
  const btn = $('continue-btn');
  if (btn) btn.classList.toggle('hidden', !hasRunSave());
}
// Restore snapshot: reset to the run's seed/mode, rebuild stats + weapons, then
// fast-forward the timeline (fresh field spawns via normal director schedule).
function resumeRun() {
  const d = loadRunSave();
  if (!d) { updateContinueButton(); return; }
  runMode = d.mode || 'standard';
  if (runMode === 'daily' || runMode === 'custom') {
    isSeededRun = true;
    currentRunSeedStr = d.seed || (runMode === 'daily' ? getDailyDateString() : 'NEON2026');
    currentRunSeedInt = hashSeedStr(currentRunSeedStr);
    seedRng(currentRunSeedInt);
    activeMutations = selectMutatorsForSeed(currentRunSeedInt);
  } else {
    isSeededRun = false;
    currentRunSeedStr = 'STANDARD';
    currentRunSeedInt = Date.now() >>> 0;
    seedRng(currentRunSeedInt);
    activeMutations = [];
  }

  resetPlayer();
  applyMutations();
  const s = d.s;
  player.maxHp = s.maxHp; player.hp = Math.min(Math.max(1, s.hp), player.maxHp);
  player.level = s.level; player.xp = s.xp; player.xpNeed = s.xpNeed;
  player.speed = s.speed; player.magnet = s.magnet; player.luck = s.luck || 0;
  player.cdMul = s.cdMul; player.critChance = s.critChance; player.critMul = s.critMul;
  player.armor = s.armor; player.regen = s.regen; player.xpBonus = s.xpBonus;
  player.tookDamageThisRun = true; // resumed run — Untouchable achievement no longer attainable
  for (const w of d.w) {
    if (!w || !WEAPON_DEFS[w.id]) continue;
    addWeapon(w.id);
    const owned = player.weapons.find(x => x.id === w.id);
    if (!owned) continue;
    owned.level = Math.min(5, Math.max(1, w.level | 0));
    owned.evolved = !!w.evolved || owned.level >= 5;
    if ('super' in w) owned.super = !!w.super; // WS-3: recomputed live in updateWeapons; restored here as immediate seed
    if ('milestoneBoost' in w) owned.milestoneBoost = w.milestoneBoost;
    if ('heat' in w) owned.heat = w.heat;
  }
  if (player.weapons.length === 0) addWeapon(meta.startingWeapon || 'bolt');
  frameCount = 0;
  resetWeaponDamageStats();
  enemies.length = 0; gems.length = 0; hazards.length = 0;
  while (particles.length > 0) releaseParticle(particles.pop());
  while (projectiles.length > 0) releaseProjectile(projectiles.pop());
  while (shockwaves.length > 0) releaseShockwave(shockwaves.pop());
  while (floatTexts.length > 0) releaseFloatText(floatTexts.pop());
  time = d.time; kills = d.kills | 0; gemsCollected = d.gems | 0; comboBest = d.comboBest | 0;
  combo = 0; comboTimer = 0; killMilestone = 0;
  bossSpawned = time >= 600; miniSpawnT1 = time >= 180; miniSpawnT2 = time >= 420; bossIntro.active = false;
  pendingLevels = 0; dismissLevelupUI();
  hitStop = 0; timeScale = 1; centerShard = { text: '', t: 0 };
  shrineSpawnT = 150; shrineOfferOnScreen = false; pendingShrineOffer = false; // WS-5 reset shrine lane on resume
  player.pacts = []; player.pactLifesteal = 0; player.pactDashLockT = 0; // WS-5 pacts are run-scoped; not serialized
  waveCooldowns = { basic: 0.5, tri: 0, quad: 0, penta: 0, ring: 30, elite: 20, special: 8, supply: 90, swarm: 10, squad: 25 };
  supplyDropT = 90;
  camX = player.x; camY = player.y; shake = 0;
  runSeed = currentRunSeedInt;
  runSaveTimer = 15;

  ui.menu.classList.add('hidden');
  ui.meta.classList.add('hidden');
  ui.settings.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.victory.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  updateHUDModifierBadge();
  AudioSys.init();
  AudioSys.resume();
  AudioSys.setBossMode(false);
  state = 'playing';
  lastTs = performance.now();
  resumeLevelUpQueue(); // a mid-run save could carry a banked queue — surface it now
  if (typeof achievementsData !== 'undefined') {
    achievementsData.stats.runsContinued++;
    saveAchievements();
    checkAchievements();
  }
  showFloatingShard('RUN RESUMED');
  AudioSys.SFX.levelup();
  showFloatingShard('RUN RESTORED — ' + fmtTime(time));
  clearRunSave(); // consumed — the 15s ticker writes the next snapshot
}

// ---------------- Game flow ----------------
function calculateEarnedShards() {
  const base = Math.floor(kills / 5 + gemsCollected / 8 + time / 10);
  return Math.floor(base * (player.shardMul || 1));
}

function startGame() {
  clearRunSave(); // fresh run invalidates any suspended mid-run save
  AudioSys.init();
  AudioSys.resume();

  if (runMode === 'daily') {
    isSeededRun = true;
    currentRunSeedStr = getDailyDateString();
    currentRunSeedInt = hashSeedStr(currentRunSeedStr);
    seedRng(currentRunSeedInt);
    activeMutations = selectMutatorsForSeed(currentRunSeedInt);
  } else if (runMode === 'custom') {
    isSeededRun = true;
    currentRunSeedStr = (ui.customSeedInput ? ui.customSeedInput.value.trim() : '') || 'NEON2026';
    currentRunSeedInt = hashSeedStr(currentRunSeedStr);
    seedRng(currentRunSeedInt);
    activeMutations = selectMutatorsForSeed(currentRunSeedInt);
  } else {
    isSeededRun = false;
    currentRunSeedInt = (Date.now() >>> 0);
    seedRng(currentRunSeedInt);
    activeMutations = [];
  }

  resetPlayer();
  applyMutations();
  player.tookDamageThisRun = false; // reset for Untouchable achievement
  frameCount = 0;
  resetWeaponDamageStats();

  enemies.length = 0; gems.length = 0; hazards.length = 0;
  while (particles.length > 0) releaseParticle(particles.pop());
  while (projectiles.length > 0) releaseProjectile(projectiles.pop());
  while (shockwaves.length > 0) releaseShockwave(shockwaves.pop());
  while (floatTexts.length > 0) releaseFloatText(floatTexts.pop());
  time = 0; kills = 0; gemsCollected = 0; combo = 0; comboTimer = 0; comboBest = 0; killMilestone = 0;
  feverMode = false; feverTimer = 0; feverApplied = false; feverHit[100] = false; feverHit[250] = false; feverHit[500] = false;
  if (_feverOverlayEl && _feverOverlayEl.classList) _feverOverlayEl.classList.remove('fever-overlay');
  bossSpawned = false; miniSpawnT1 = false; miniSpawnT2 = false; bossIntro.active = false;
  pendingLevels = 0; dismissLevelupUI(); state = 'playing';
  hitStop = 0; timeScale = 1; centerShard = { text: '', t: 0 };
  shrineSpawnT = 150; shrineOfferOnScreen = false; pendingShrineOffer = false; // WS-5 reset shrine lane on fresh run
  waveCooldowns = { basic: 1.2, tri: 0, quad: 0, penta: 0, ring: 30, elite: 20, special: 8, supply: 90, swarm: 10, squad: 25 };
  supplyDropT = 90;
  camX = 0; camY = 0; shake = 0;
  runSeed = currentRunSeedInt;

  addWeapon(meta.startingWeapon || 'bolt');
  ui.menu.classList.add('hidden');
  ui.meta.classList.add('hidden');
  ui.settings.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.victory.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.remove('hidden');

  updateHUDModifierBadge();
  AudioSys.setBossMode(false);
  state = 'playing';
  AudioSys.SFX.levelup();
  if (activeMutations.length > 0) {
    showFloatingShard('MODIFIER: ' + activeMutations.map(m => m.name).join(' + '));
  } else {
    showFloatingShard('SURVIVE');
  }
}

function buildWeaponRecap() {
  return player.weapons.map(w => {
    const def = WEAPON_DEFS[w.id];
    return `<span class="recap-weapon">${def.icon} ${def.name} <b>L${w.level}</b></span>`;
  }).join(' &nbsp; ');
}
function buildRunStatsHtml() {
  const minsSurvived = time / 60;
  const kpm = minsSurvived > 0 ? (kills / minsSurvived).toFixed(1) : kills;
  const gpm = minsSurvived > 0 ? Math.round(gemsCollected / minsSurvived) : gemsCollected;
  const modLine = activeMutations.length > 0
    ? `<div class="recap-line" style="color:#ff4;">Active Mutator: <b>${activeMutations.map(m => m.name).join(' + ')}</b> (Seed #${currentRunSeedStr})</div>`
    : '';
  return `
    ${modLine}
    <div class="recap-line">Survived <b>${fmtTime(time)}</b> — Level <b>${player.level}</b></div>
    <div class="recap-line">Kills <b>${kills}</b> · Best combo <b>x${comboBest}</b> · KPM <b>${kpm}</b></div>
    <div class="recap-line">Gems <b>${gemsCollected}</b> · GPM <b>${gpm}</b></div>
    <div class="recap-row">${buildWeaponRecap()}</div>
    ${buildPactRecap()}
    ${buildDamageBreakdownHtml()}
  `;
}

function buildDamageBreakdownHtml() {
  if (typeof getWeaponDamageBreakdown !== 'function') return '';
  const bd = getWeaponDamageBreakdown();
  if (!bd || !bd.entries || bd.entries.length === 0) return '';
  const rows = bd.entries.slice(0, 8).map(e => {
    const pct = (e.share * 100).toFixed(1);
    return `
      <div class="dmg-row">
        <div class="dmg-label">${e.icon} ${e.name}</div>
        <div class="dmg-bar"><div class="dmg-fill" style="width:${pct}%;"></div></div>
        <div class="dmg-pct">${pct}%</div>
      </div>
    `;
  }).join('');
  return `
    <div class="dmg-section">
      <div class="dmg-title">DAMAGE BY WEAPON — ${bd.total.toLocaleString()} total</div>
      ${rows}
    </div>
  `;
}

function gameOver() {
  // Flush any queued level-up modal: death always wins, and the overlay must not
  // linger into gameover or carry pendingLevels into the next run.
  pendingLevels = 0;
  dismissLevelupUI();
  state = 'gameover';
  clearRunSave();
  AudioSys.SFX.gameover();
  saveBest();
  saveCodex(); // flush lifetime weapon damage + encounters
  recordRunInHistory('defeat');
  const earned = calculateEarnedShards();
  meta.shards += earned;
  saveMeta();
  ui.gameoverStats.innerHTML = buildRunStatsHtml();
  if (ui.gameoverShards) ui.gameoverShards.textContent = `+${earned} Star Shards Earned! 💎`;
  ui.hud.classList.add('hidden');
  ui.gameover.classList.remove('hidden');
  submitCloudScore(Math.floor(kills * 10 + time * 5 + gemsCollected * 2), kills);
}

function victory() {
  pendingLevels = 0;
  dismissLevelupUI();
  state = 'victory';
  clearRunSave();
  AudioSys.SFX.victory();
  saveBest();
  saveCodex(); // flush lifetime weapon damage + encounters
  recordRunInHistory('victory');
  const earned = calculateEarnedShards() + 50;
  meta.shards += earned;
  saveMeta();
  ui.victoryStats.innerHTML =
    `<div class="recap-line" style="color:#8f8">You defeated the final boss!</div>` + buildRunStatsHtml();
  if (ui.victoryShards) ui.victoryShards.textContent = `+${earned} Star Shards Earned! 💎 (Victory Bonus +50)`;
  ui.hud.classList.add('hidden');
  ui.victory.classList.remove('hidden');
  for (let i = 0; i < 80; i++) {
    pushParticle({ type: 'shard', x: player.x, y: player.y, vx: rand(-500, 500), vy: rand(-500, 500), life: rand(0.4, 1), maxLife: 1, color: pick(['#4ff', '#f4f', '#ff4', '#4f4']), size: rand(2, 6) });
  }
  submitCloudScore(Math.floor(kills * 10 + time * 5 + gemsCollected * 2 + 1000), kills);
}

function saveBest() {
  if (time > best.time) best.time = Math.floor(time);
  if (player.level > best.level) best.level = player.level;
  if (kills > best.kills) best.kills = kills;
  safeSave('neonSurvivorsBest', best);
  renderHighScore();
  updateSeedBoard(state === 'victory' ? 'victory' : 'defeat');
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused'; ui.pause.classList.remove('hidden'); renderPauseSnapshot();
    // WS-B: pause hides the non-blocking dock (offer persists; timer only ticks during sim)
    if (levelupOpen && ui.levelupHud) ui.levelupHud.classList.add('hidden');
  } else if (state === 'paused') {
    state = 'playing'; ui.pause.classList.add('hidden'); ui.settings.classList.add('hidden'); lastTs = performance.now();
    if (levelupOpen && ui.levelupHud) ui.levelupHud.classList.remove('hidden'); // resume: restore dock
    else resumeLevelUpQueue(); // queue banked while paused (edge seam) — re-present now
  }
}

// Quit current run back to the main menu. The run is snapshotted so the
// existing CONTINUE button can resume it; starting a new game clears the save.
function quitToMenu() {
  if (state === 'playing') {
    safeSave(RUN_SAVE_KEY, buildRunSnapshot());
  }
  pendingLevels = 0;
  dismissLevelupUI();
  bossIntro.active = false;
  hitStop = 0; timeScale = 1;
  state = 'menu';
  ui.pause.classList.add('hidden');
  ui.settings.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.victory.classList.add('hidden');
  ui.meta.classList.add('hidden');
  ui.codex.classList.add('hidden');
  if (ui.levelupHud) ui.levelupHud.classList.add('hidden');
  AudioSys.setBossMode(false);
  updateContinueButton();
  renderHighScore();
  ui.menu.classList.remove('hidden');
}

// Pause-screen run snapshot: time, level, kills, combo, build badges
function renderPauseSnapshot() {
  const el = $('pause-snapshot');
  if (!el) return;
  const buildBits = player.weapons.map(w => {
    const def = WEAPON_DEFS[w.id];
    const icon = def ? def.icon : '?';
    return `<span class="ps-weapon">${icon}<b>L${w.level}</b>${w.evolved ? '★' : ''}</span>`;
  }).join(' ');
  el.innerHTML =
    `<div class="ps-row"><span>⏱ ${fmtTime(time)}</span><span>LV ${player.level}</span><span>${kills} kills</span>` +
    (comboBest > 1 ? `<span>best combo x${comboBest}</span>` : '') + `</div>` +
    (buildBits ? `<div class="ps-build">${buildBits}</div>` : '') +
    (activeMutations.length ? `<div class="ps-muts">${activeMutations.map(m => m.icon + ' ' + m.name).join(' + ')}</div>` : '');
}

// ---------------- Codex overlay ----------------
let codexTab = 'enemies';
function showCodexTab(tab) {
  codexTab = tab;
  document.querySelectorAll('.codex-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderCodex();
}
function renderCodex() {
  let html = '';
  if (codexTab === 'enemies') {
    const list = CODEX.enemies;
    for (const e of list) {
      const known = codex.encountered[e.id];
      const icon = known ? e.icon : '?';
      const name = known ? e.name : '???';
      const tip = known ? e.tip : 'Encounter this enemy in a run to unlock its entry.';
      const killsStr = known && codex.encountered[e.id].kills > 0 ? `Kills: <b>${codex.encountered[e.id].kills}</b>` : '';
      html += `
        <div class="codex-entry" ${known ? '' : 'style="opacity:0.5"'}>
          <div class="codex-icon" style="color:${known ? e.color : '#446'}">${icon}</div>
          <div class="codex-info">
            <div class="codex-name" style="color:${known ? e.color : '#678'}">${name}</div>
            ${killsStr ? `<div class="codex-meta">${killsStr}</div>` : ''}
            <div class="codex-desc">${tip}</div>
          </div>
        </div>
      `;
    }
  } else if (codexTab === 'weapons') {
    const defs = WEAPON_DEFS || {};
    for (const id in defs) {
      const def = defs[id];
      const owned = player.weapons.find(w => w.id === id);
      const known = codex.unlockedWeapons[id];
      const el = def.element && ELEMENT_INFO[def.element];
      const elTag = known && el ? ` <span style="color:${el.color};font-size:10px;letter-spacing:1px;background:rgba(0,0,0,0.35);padding:1px 5px;border:1px solid ${el.color};border-radius:2px;">${el.glyph} ${el.label}</span>` : '';
      html += `
        <div class="codex-entry" ${known ? '' : 'style="opacity:0.5"'}>
          <div class="codex-icon" style="color:${known ? '#4ff' : '#446'}">${def.icon || '?'}</div>
          <div class="codex-info">
            <div class="codex-name" style="color:${known ? '#4ff' : '#678'}">${known ? def.name : '???'}${elTag}${owned ? ` <span style="color:#fa4;font-size:11px">[LV ${owned.level}${owned.evolved ? ' ★EVOLVED' : ''}]</span>` : ''}</div>
            <div class="codex-desc">${known ? def.desc : 'Pick up this weapon in a run to unlock its entry.'}</div>
          </div>
        </div>
      `;
    }
  } else if (codexTab === 'stats') {
    const minsSurvived = time / 60;
    const kpm = minsSurvived > 0 ? (kills / minsSurvived).toFixed(1) : kills;
    const gpm = minsSurvived > 0 ? Math.round(gemsCollected / minsSurvived) : gemsCollected;
    html = `
      <div class="codex-subtitle">CURRENT RUN</div>
      <div class="codex-stat-row"><span>Time</span><b>${fmtTime(time)}</b></div>
      <div class="codex-stat-row"><span>Level</span><b>${player.level}</b></div>
      <div class="codex-stat-row"><span>Kills</span><b>${kills}</b></div>
      <div class="codex-stat-row"><span>KPM</span><b>${kpm}</b></div>
      <div class="codex-stat-row"><span>Gems</span><b>${gemsCollected}</b></div>
      <div class="codex-stat-row"><span>GPM</span><b>${gpm}</b></div>
      <div class="codex-stat-row"><span>Best combo</span><b>x${comboBest}</b></div>
      <div class="codex-stat-row"><span>Current combo</span><b>x${combo}</b></div>
      <div class="codex-subtitle">LIFETIME</div>
      <div class="codex-stat-row"><span>Best time</span><b>${fmtTime(best.time || 0)}</b></div>
      <div class="codex-stat-row"><span>Best level</span><b>${best.level || 0}</b></div>
      <div class="codex-stat-row"><span>Best kills</span><b>${best.kills || 0}</b></div>
      <div class="codex-stat-row"><span>Enemies discovered</span><b>${Object.keys(codex.encountered).length} / ${CODEX.enemies.length}</b></div>
      <div class="codex-stat-row"><span>Weapons discovered</span><b>${Object.keys(codex.unlockedWeapons).length} / ${Object.keys(WEAPON_DEFS || {}).length}</b></div>
      <div class="codex-subtitle">DAMAGE BY WEAPON</div>
    `;
    const bd = getWeaponDamageBreakdown();
    if (bd.entries.length === 0) {
      html += `<div class="codex-stat-row"><span style="color:#678">No damage dealt yet</span><b></b></div>`;
    } else {
      for (const e of bd.entries.slice(0, 12)) {
        const pct = (e.share * 100).toFixed(1);
        html += `
          <div class="codex-stat-row">
            <span>${e.icon} ${e.name}</span>
            <b>${e.damage} dmg · ${e.kills} kills · ${pct}%</b>
          </div>
          <div class="codex-dmg-bar"><div class="codex-dmg-fill" style="width:${pct}%;"></div></div>
        `;
      }
    }
  }
  ui.codexContent.innerHTML = html;
}

function openCodex() {
  if (state !== 'paused') return;
  ui.pause.classList.add('hidden');
  ui.codex.classList.remove('hidden');
  renderCodex();
}
function closeCodex() {
  ui.codex.classList.add('hidden');
  if (state === 'paused') ui.pause.classList.remove('hidden');
}

// ---------------- Main loop ----------------
let _lastFrameError = 0;
let _consecutiveFrameErrors = 0;
let _lastFrameTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const frameMs = _lastFrameTs ? ts - _lastFrameTs : 16.7;
  _lastFrameTs = ts;
  _telemetry.tickPerformance(frameMs);
  const rawDt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;

  if (hitStop > 0) { hitStop -= rawDt; timeScale = 0.12; } else timeScale = 1;
  const dt = rawDt * timeScale;

  // Crash guard: a throwing subsystem must not freeze the whole game during a
  // live session. rAF is already self-healing (scheduled above); this bounds
  // repeated error spam and guarantees the canvas keeps painting something.
  let _frameFailed = false;
  try {
    if (state === 'playing') {
      time += dt;
      frameCount++;
      update(dt);
      updateHUD();
    }
  } catch (e) {
    _frameFailed = true;
    _telemetry.logError('update', e);
    if (performance.now() - _lastFrameError > 1000) { _lastFrameError = performance.now(); try { console.error('[update]', e); } catch (_) {} }
  }
  try {
    if (state === 'playing' || state === 'paused') draw();
  } catch (e) {
    _frameFailed = true;
    _telemetry.logError('draw', e);
    if (performance.now() - _lastFrameError > 1000) { _lastFrameError = performance.now(); try { console.error('[draw]', e); } catch (_) {} }
  }
  if (_frameFailed) {
    _consecutiveFrameErrors++;
    if (_consecutiveFrameErrors >= 30) {
      _consecutiveFrameErrors = 0;
      triggerCrashDebugger('Repeated frame failures (30+) — probable systemic fault', 'frame', 0, 0, _telemetry.errors[_telemetry.errors.length - 1] ? new Error(_telemetry.errors[_telemetry.errors.length - 1]) : null);
    }
  } else {
    _consecutiveFrameErrors = 0;
  }
  if (debugOverlay.visible) debugOverlay.render();
}

// ---------------- Live Debug Overlay (F3) ----------------
const debugOverlay = {
  visible: false,
  el: null,
  ensure() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.id = 'debug-overlay';
    this.el.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9998;background:rgba(0,0,0,0.75);color:#4ff;font:11px/1.5 monospace;padding:10px 12px;border:1px solid #4ff;border-radius:4px;pointer-events:none;white-space:pre;max-width:420px;';
    document.body.appendChild(this.el);
  },
  toggle() {
    this.visible = !this.visible;
    this.ensure();
    this.el.style.display = this.visible ? 'block' : 'none';
  },
  render() {
    this.ensure();
    const t = _telemetry;
    const px = typeof player !== 'undefined' ? Math.round(player.x) : 0;
    const py = typeof player !== 'undefined' ? Math.round(player.y) : 0;
    this.el.textContent =
      `FPS ${t.fps.toFixed(0)}  (${t.frameMs.toFixed(1)}ms, worst ${t.worstFrameMs.toFixed(0)}ms @${t.worstFrameAt.toFixed(1)}s)\n` +
      `pos (${px},${py})  state ${state}  t=${time.toFixed(1)}s  f=${frameCount}\n` +
      `enemies ${enemies.length}  gems ${gems.length}  proj ${projectiles.length}\n` +
      `particles ${particles.length}  hazards ${hazards.length}  planets ${PLANETS.length}\n` +
      `combo ${combo}x  kills ${kills}  lv ${player.level}  hp ${Math.round(player.hp)}/${player.maxHp}\n` +
      (t.errors.length ? `errors: ${t.errors.slice(-3).join(' | ')}` : 'errors: none');
  },
};

function updateHUD() {
  ui.timer.textContent = fmtTime(time);
  ui.killCount.textContent = kills + ' kills' + (combo > 1 && comboTimer > 0 ? ` 🔥${combo}x` : '');
  ui.levelText.textContent = 'LV ' + player.level;
  ui.xpBar.style.width = clamp(player.xp / player.xpNeed * 100, 0, 100) + '%';
  ui.hpBar.style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
}

// Debug/testing handle
window.__game = {
  get player() { return player; },
  get enemies() { return enemies; },
  get gems() { return gems; },
  get shockwaves() { return shockwaves; },
  get state() { return state; },
  get levelupOpen() { return levelupOpen; },
  get pendingLevels() { return pendingLevels; },
  get levelupChoices() { return levelupChoices; },
  get levelupTimer() { return levelupTimer; },
  get time() { return time; },
  get kills() { return kills; },
  get combo() { return combo; },
  get feverMode() { return feverMode; },
  get feverTimer() { return feverTimer; },
  get meta() { return meta; },
  get settings() { return settings; },
  get achievements() { return achievementsData; },
  get activeMutations() { return activeMutations; },
  get runMode() { return runMode; },
  get seed() { return currentRunSeedStr; },
  levelUp, startGame, checkAchievements, renderTrophiesScreen, unlockAchievement, resumeLevelUpQueue,
  trackWeaponDamage, getWeaponDamageBreakdown, getLifetimeWeaponDamageBreakdown,
  recordRunInHistory, damageEnemy, spawnEnemy, nearestEnemy, togglePause, killEnemy, weaponHeat, smartChestFeed, updateHazards,
  spawnPickup, presentChestChoices, applyChestChoice,
  presentShrineChoices, applyPactChoice, buildPactPool, updateVoidShrines, // WS-5
  get shrineSpawnT() { return shrineSpawnT; }, enterFever, exitFever, updateFever,
  get weapons() { return player.weapons; }, registerKill,
  saveRunSave, loadRunSave, resumeRun, clearRunSave, hasRunSave, buildRunSnapshot, updateContinueButton, quitToMenu,
  get codex() { return codex; },
  get runHistory() { return runHistory; },
  get minimapVisible() { return minimapVisible; },
  // QA/debug getters for run-reset audits (read-only views)
  get runArrays() {
    return {
      projectiles, particles, shockwaves, floatTexts, hazards,
      pools: { particlePool, projectilePool, shockwavePool, floatTextPool },
      comboBest, bossIntroActive: bossIntro.active,
    };
  },
  get shipPalette() { return shipPalette; },
  cycleShipPalette,
};

// ---------------- Cloud Database & Auth Integration ----------------
let currentUser = null;
try {
  const storedUser = localStorage.getItem('gwf_pilot_user');
  if (storedUser) currentUser = JSON.parse(storedUser);
} catch (e) {}

function updateAccountUI() {
  const badge = $('account-user-badge');
  const modalBtn = $('account-modal-btn');
  const form = $('account-form');
  const statsView = $('account-stats-view');
  
  if (currentUser) {
    if (badge) badge.textContent = `Pilot: ${currentUser.username}`;
    if (modalBtn) modalBtn.textContent = 'CLOUD PROFILE';
    if (form) form.classList.add('hidden');
    if (statsView) statsView.classList.remove('hidden');
    const welcome = $('acc-welcome-msg');
    const dispEmail = $('acc-disp-email');
    const dispScore = $('acc-disp-score');
    const dispKills = $('acc-disp-kills');
    const dispRuns = $('acc-disp-runs');
    if (welcome) welcome.textContent = `Welcome back, Pilot ${currentUser.username}!`;
    if (dispEmail) dispEmail.textContent = currentUser.email || '-';
    if (dispScore) dispScore.textContent = (currentUser.stats?.highScore || 0).toLocaleString();
    if (dispKills) dispKills.textContent = (currentUser.stats?.kills || 0).toLocaleString();
    if (dispRuns) dispRuns.textContent = (currentUser.stats?.runsPlayed || 0).toLocaleString();
  } else {
    if (badge) badge.textContent = 'Guest Pilot';
    if (modalBtn) modalBtn.textContent = 'SIGN IN / CLOUD SAVE';
    if (form) form.classList.remove('hidden');
    if (statsView) statsView.classList.add('hidden');
  }
}

async function handleAccountAuth() {
  const usernameInput = $('acc-username');
  const emailInput = $('acc-email');
  const msg = $('acc-msg');
  if (!usernameInput || !emailInput) return;
  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  if (!username || !email) {
    if (msg) msg.textContent = 'Please enter both username and email.';
    return;
  }
  if (msg) msg.textContent = 'Connecting to database...';

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email })
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      try { localStorage.setItem('gwf_pilot_user', JSON.stringify(currentUser)); } catch (e) {}
      if (msg) msg.textContent = '';
      updateAccountUI();
    } else {
      if (msg) msg.textContent = data.error || 'Registration failed.';
    }
  } catch (e) {
    if (msg) msg.textContent = 'Network error contacting server.';
  }
}

async function submitCloudScore(score, killCount) {
  try {
    const payload = {
      userId: currentUser ? currentUser.id : 'guest',
      username: currentUser ? currentUser.username : 'Guest Pilot',
      game: 'star-rider',
      score: score || 0,
      kills: killCount || 0
    };
    const res = await fetch('/api/auth/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.userStats && currentUser) {
      currentUser.stats = data.userStats;
      try { localStorage.setItem('gwf_pilot_user', JSON.stringify(currentUser)); } catch (e) {}
      updateAccountUI();
    }
  } catch (e) {
    console.warn('Cloud score sync error:', e);
  }
}

// ---------------- Boot ----------------
updateAccountUI();
if ($('account-modal-btn')) $('account-modal-btn').onclick = () => { updateAccountUI(); $('account-modal').classList.remove('hidden'); };
if ($('acc-close-btn')) $('acc-close-btn').onclick = () => { $('account-modal').classList.add('hidden'); };
if ($('acc-submit-btn')) $('acc-submit-btn').onclick = handleAccountAuth;

updateContinueButton();
if ($('continue-btn')) $('continue-btn').addEventListener('click', resumeRun);
if ($('start-btn')) $('start-btn').addEventListener('click', startGame);
if ($('retry-btn')) $('retry-btn').addEventListener('click', startGame);
if ($('victory-retry-btn')) $('victory-retry-btn').addEventListener('click', startGame);

if ($('upgrades-btn')) $('upgrades-btn').onclick = () => { renderMetaScreen(); ui.menu.classList.add('hidden'); ui.meta.classList.remove('hidden'); };
if ($('meta-back-btn')) $('meta-back-btn').onclick = () => { ui.meta.classList.add('hidden'); ui.menu.classList.remove('hidden'); };
if ($('trophies-btn')) $('trophies-btn').onclick = () => { renderTrophiesScreen(); ui.menu.classList.add('hidden'); ui.trophies.classList.remove('hidden'); };
if ($('trophies-back-btn')) $('trophies-back-btn').onclick = () => { ui.trophies.classList.add('hidden'); ui.menu.classList.remove('hidden'); };
if ($('settings-btn')) $('settings-btn').onclick = () => { initSettingsUI(); ui.menu.classList.add('hidden'); ui.settings.classList.remove('hidden'); };
if ($('settings-back-btn')) $('settings-back-btn').onclick = () => { ui.settings.classList.add('hidden'); if (state === 'paused') ui.pause.classList.remove('hidden'); else ui.menu.classList.remove('hidden'); };
if ($('pause-settings-btn')) $('pause-settings-btn').onclick = () => { initSettingsUI(); ui.pause.classList.add('hidden'); ui.settings.classList.remove('hidden'); };
if ($('pause-resume-btn')) $('pause-resume-btn').onclick = togglePause;
if (ui.pauseHudBtn) ui.pauseHudBtn.onclick = togglePause;
if (ui.pauseCodexBtn) ui.pauseCodexBtn.onclick = openCodex;
if ($('pause-menu-btn')) $('pause-menu-btn').onclick = quitToMenu;
if ($('codex-back-btn')) $('codex-back-btn').onclick = closeCodex;
document.querySelectorAll('.codex-tab').forEach(b => b.onclick = () => showCodexTab(b.dataset.tab));

initDailyModifierControls();
renderSeedBoards();
// re-render seed board when the player switches run mode / edits the seed
['mode-daily-btn', 'mode-custom-btn', 'mode-standard-btn'].forEach(id => {
  const b = $(id);
  if (b && b.addEventListener) b.addEventListener('click', () => requestAnimationFrame(renderSeedBoards));
});
if (ui.customSeedInput && ui.customSeedInput.addEventListener) {
  ui.customSeedInput.addEventListener('input', () => requestAnimationFrame(renderSeedBoards));
}
draw();
requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(frame); });

})();
