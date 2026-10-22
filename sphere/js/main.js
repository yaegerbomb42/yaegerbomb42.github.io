// ============================================================
// Sphere Quest — main orchestrator (wires logic + scene + UI)
// ============================================================
import { SphereScene } from './scene.js';
import {
  defaultState, ensureMissions, levelFromXp, rankForLevel, mineGain,
  comboMultiplier, MAX_COMBO_WINDOW_MS, getAutoRate, getGlobalMult,
  canBuyUpgrade, upgradePrice, UPGRADES, THEMES, fmt,
  newlyUnlocked, pushLog, ACHIEVEMENTS
} from './logic.js';
import { loadSave, persist, exportSave, importSave } from './save.js';
import { sfx, setEnabled, init as audioInit } from './audio.js';
import { UI } from './ui.js';
import { ExplorerPanel } from './explorer.js';

// ---- state -------------------------------------------------------------
let s = loadSave();
s.session = { mined: 0, clicks: 0, xp: 0, buys: 0 };
ensureMissions(s);

const ui = new UI(s);
const explorer = new ExplorerPanel(s, {
  onNameChange: () => persistSoon(),
  onColorChange: (c) => { document.documentElement.style.setProperty('--explorer-color', c); persistSoon(); },
  onSoundChange: (v) => { setEnabled(v); persistSoon(); },
  onParticlesChange: () => { persistSoon(); location.reload(); },
  onExport: () => {
    const blob = new Blob([exportSave(s)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sphere-quest-save.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  onImport: (text) => {
    const st = importSave(text);
    st.lastSeen = Date.now();
    s = st;
    s.session = { mined: 0, clicks: 0, xp: 0, buys: 0 };
    ensureMissions(s);
    applyTheme(s.upgrades.theme);
    scene.setDroneCount(s.upgrades.miner);
    persist();
    ui.renderStore(); ui.refreshStore(); ui.renderMissions(); ui.updateHud();
    explorer.render();
    ui.toast('✅ Save imported.', 'welcome');
  },
  onReset: () => {
    s = defaultState();
    s.session = { mined: 0, clicks: 0, xp: 0, buys: 0 };
    ensureMissions(s);
    applyTheme(0);
    scene.setDroneCount(0);
    persist();
    ui.renderStore(); ui.refreshStore(); ui.renderMissions(); ui.updateHud();
    explorer.render();
    ui.toast('♻️ Progress reset. Fresh start, explorer!', 'welcome');
  }
});

// ---- scene -------------------------------------------------------------
const scene = new SphereScene(document.getElementById('canvas-container'), {
  onMine: (pt) => mineAt(pt),
  onComet: (pos) => cometHit(pos)
}, { lowParticles: s.settings.particles === 'low' });

scene.setDroneCount(s.upgrades.miner);
applyTheme(s.upgrades.theme);

function applyTheme(i) {
  scene.setTheme(i);
  const accent = THEMES[Math.min(i, THEMES.length - 1)].accent;
  document.documentElement.style.setProperty('--accent', accent);
}

document.documentElement.style.setProperty('--explorer-color', s.explorer.color);

// ---- economy actions ---------------------------------------------------
let combo = 0;
let lastClickTs = 0;

function mineAt(pt) {
  const gain = mineGain(s);
  const mult = comboMultiplier(combo);
  const total = Math.max(1, Math.round(gain * mult));

  s.crystals += total;
  s.totalMined += total;
  s.totalClicks++;
  s.session.mined += total;
  s.session.clicks++;

  const now = performance.now();
  combo = (now - lastClickTs < MAX_COMBO_WINDOW_MS) ? combo + 1 : 1;
  lastClickTs = now;
  if (combo > s.bestCombo) s.bestCombo = combo;

  grantXp(2);
  checkAchievements();

  scene.spawnBurst(pt, THEMES[Math.min(s.upgrades.theme, THEMES.length - 1)].hi, 8 + Math.min(10, s.upgrades.power), 0.9);
  scene.pulse(1);
  const px = scene.project(pt);
  if (px.inFront) ui.floatText(px.x, px.y, '+' + fmt(total), '#ffffff');
  sfx.mine();

  if (combo === 10 || (combo > 10 && combo % 25 === 0)) {
    ui.toast(`🔥 ${combo}-click combo — ×${comboMultiplier(combo).toFixed(2)}`, 'combo');
  }
  ui.updateHud();
  persistSoon();
}

function cometHit(pos) {
  const lv = levelFromXp(s.xp).level;
  const bonus = Math.round(Math.max(25, 50 + lv * 15) * getGlobalMult(s));
  s.crystals += bonus;
  s.totalMined += bonus;
  s.session.mined += bonus;
  grantXp(25);

  scene.spawnBurst(pos, 0xfbbf24, 40, 1.6);
  scene.spawnBurst(pos, 0xfff7cc, 22, 2.4);
  scene.pulse(2);
  sfx.jackpot();
  pushLog(s, `Captured a comet (+${fmt(bonus)} 💎)`);
  ui.toast(`☄️ Comet captured! +${fmt(bonus)} crystals`, 'jackpot');
  const px = scene.project(pos);
  if (px.inFront) ui.floatText(px.x, px.y - 34, '+' + fmt(bonus) + ' ☄️', '#fbbf24');
  ui.updateHud();
  checkAchievements();
  persistSoon();
}

function grantXp(n) {
  const before = levelFromXp(s.xp).level;
  s.xp += n;
  s.session.xp += n;
  const after = levelFromXp(s.xp).level;
  if (after > before) {
    sfx.level();
    ui.toast(`⭐ Level ${after} — ${rankForLevel(after)}!`, 'level');
    pushLog(s, `Reached level ${after} (${rankForLevel(after)})`);
    scene.pulse(2);
  }
}

function checkAchievements() {
  const fresh = newlyUnlocked(s);
  for (const id of fresh) {
    s.achievements.push(id);
    const a = ACHIEVEMENTS.find(x => x.id === id);
    sfx.achievement();
    ui.toast(`${a.icon} Achievement: <b>${a.title}</b>`, 'achievement');
    pushLog(s, `Achievement unlocked: ${a.title}`);
  }
  if (fresh.length) persistSoon();
}

// ---- store / missions wiring ------------------------------------------
ui.onBuy = (id) => {
  if (!canBuyUpgrade(id, s)) { sfx.deny(); return; }
  const price = upgradePrice(id, s);
  s.crystals -= price;
  s.upgrades[id]++;
  s.totalBuys++;
  s.session.buys++;
  sfx.buy();
  pushLog(s, `Bought ${UPGRADES[id].name} (Lv ${s.upgrades[id]})`);
  if (id === 'miner') scene.setDroneCount(s.upgrades.miner);
  if (id === 'theme') applyTheme(s.upgrades.theme);
  ui.refreshStore();
  ui.updateHud();
  checkAchievements();
  persistSoon();
};

ui.onClaim = (m) => {
  if (m.claimed) return;
  s.crystals += m.reward;
  s.session.mined += m.reward;
  m.claimed = true;
  sfx.buy();
  ui.toast(`🎁 Mission complete! +${fmt(m.reward)} crystals`, 'welcome');
  pushLog(s, `Claimed a mission reward (+${fmt(m.reward)} 💎)`);
  ui.renderMissions();
  ui.updateHud();
  checkAchievements();
  persistSoon();
};

// ---- HUD + panels wiring ----------------------------------------------
document.getElementById('btn-explorer').addEventListener('click', () => { audioInit(); explorer.toggle(); });
document.getElementById('btn-store').addEventListener('click', () => {
  audioInit();
  const p = document.getElementById('panel-store');
  p.classList.toggle('open');
  if (p.classList.contains('open')) ui.refreshStore();
});
document.getElementById('btn-help').addEventListener('click', () => {
  audioInit();
  document.getElementById('panel-help').classList.toggle('open');
});
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.panel').classList.remove('open'));
});
document.getElementById('btn-mute').addEventListener('click', () => {
  s.settings.sound = !s.settings.sound;
  setEnabled(s.settings.sound);
  document.getElementById('btn-mute').textContent = s.settings.sound ? '🔊' : '🔇';
  persistSoon();
});
document.getElementById('btn-mute').textContent = s.settings.sound ? '🔊' : '🔇';

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (k === 'e') explorer.toggle();
  else if (k === 's') document.getElementById('panel-store').classList.toggle('open');
  else if (k === 'h') document.getElementById('panel-help').classList.toggle('open');
  else if (k === 'escape') {
    document.querySelectorAll('.panel.open').forEach(p => p.classList.remove('open'));
  } else if (k === 'm') {
    document.getElementById('btn-mute').click();
  }
});

// Unlock WebAudio on the first user gesture (autoplay policy)
const unlockAudio = () => { audioInit(); document.removeEventListener('pointerdown', unlockAudio); };
document.addEventListener('pointerdown', unlockAudio);

// ---- offline gains -----------------------------------------------------
(function offline() {
  const elapsed = Math.min(8 * 3600, (Date.now() - s.lastSeen) / 1000);
  if (elapsed > 60) {
    const rate = getAutoRate(s) * getGlobalMult(s);
    const gained = rate * elapsed * 0.5;
    if (gained > 0) {
      s.crystals += gained;
      s.autoMined += gained;
      s.xp += gained * 0.02;
      checkAchievements();
      setTimeout(() => {
        ui.toast(`🌙 Welcome back! Your drones mined <b>${fmt(gained)}</b> crystals while you were away.`, 'welcome');
      }, 900);
    }
  }
  s.lastSeen = Date.now();
})();

// ---- auto-miner + playtime + HUD tick ---------------------------------
setInterval(() => {
  if (document.hidden) return;
  const rate = getAutoRate(s) * getGlobalMult(s);
  if (rate > 0) {
    const gain = rate * 0.2;
    s.crystals += gain;
    s.autoMined += gain;
    s.session.mined += gain;
    grantXp(gain * 0.04);
    checkAchievements();
    ui.updateHud();
  }
}, 200);

setInterval(() => {
  if (document.hidden) return;
  s.playtimeS += 0.25;
}, 250);

setInterval(() => ui.updateHud(), 400);

// ---- persistence -------------------------------------------------------
let saveTimer = null;
function persistSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; persist(s); }, 1200);
}
window.addEventListener('beforeunload', () => persist(s));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { s.lastSeen = Date.now(); persist(s); }
});

// ---- boot --------------------------------------------------------------
ui.renderStore();
ui.refreshStore();
ui.renderMissions();
ui.updateHud();
scene.start();

if (!s.totalMined && !s.totalClicks) {
  setTimeout(() => {
    ui.toast('👋 Click the sphere to mine crystals. Buy upgrades in the Store.', 'welcome');
  }, 700);
}
