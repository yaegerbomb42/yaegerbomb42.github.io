// ============================================================
// Sphere Quest — persistence (localStorage + import/export)
// ============================================================
import { SAVE_KEY, defaultState, GAME_VERSION } from './logic.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return defaultState();
    const base = defaultState();
    const merged = {
      ...base,
      ...data,
      explorer: { ...base.explorer, ...(data.explorer || {}) },
      upgrades: { ...base.upgrades, ...(data.upgrades || {}) },
      settings: { ...base.settings, ...(data.settings || {}) }
    };
    // normalise types in case of tampering
    for (const k of Object.keys(base.upgrades)) {
      if (!Number.isFinite(merged.upgrades[k]) || merged.upgrades[k] < 0) merged.upgrades[k] = 0;
      if (merged.upgrades[k] > UPGRADES_MAX[k]) merged.upgrades[k] = UPGRADES_MAX[k];
    }
    for (const k of ['crystals', 'xp', 'totalMined', 'totalClicks', 'autoMined', 'totalBuys', 'playtimeS', 'bestCombo']) {
      if (!Number.isFinite(merged[k]) || merged[k] < 0) merged[k] = 0;
    }
    if (!Array.isArray(merged.achievements)) merged.achievements = [];
    if (!Array.isArray(merged.log)) merged.log = [];
    return merged;
  } catch {
    return defaultState();
  }
}

const UPGRADES_MAX = { power: 40, miner: 30, core: 12, theme: 6 };

export function persist(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* storage full / private mode */ }
}

export function exportSave(state) {
  return JSON.stringify({
    __meta: { app: 'sphere-quest', version: GAME_VERSION, exportedAt: new Date().toISOString() },
    state
  }, null, 2);
}

export function importSave(text) {
  const data = JSON.parse(text);
  const st = (data && typeof data === 'object' && data.state) || data;
  if (!st || typeof st !== 'object' || !st.upgrades) throw new Error('Not a Sphere Quest save file');
  return st;
}
