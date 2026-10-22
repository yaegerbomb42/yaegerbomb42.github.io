// ============================================================
// Sphere Quest — User Explorer panel (profile, stats, achievements, log)
// ============================================================
import {
  ACHIEVEMENTS, THEMES, fmt, fmtTime, rankForLevel, levelFromXp
} from './logic.js';

export class ExplorerPanel {
  constructor(state, handlers = {}) {
    this.s = state;
    this.h = handlers;
    this.el = {
      panel: document.getElementById('panel-explorer'),
      name: document.getElementById('exp-name-input'),
      color: document.getElementById('exp-color'),
      rank: document.getElementById('exp-rank'),
      stats: document.getElementById('stats-grid'),
      ach: document.getElementById('ach-grid'),
      log: document.getElementById('log-list'),
      sound: document.getElementById('sound-toggle'),
      particles: document.getElementById('particles-select'),
      exportBtn: document.getElementById('btn-export'),
      importInput: document.getElementById('import-file'),
      resetBtn: document.getElementById('btn-reset')
    };
    this._bind();
  }

  _bind() {
    this.el.name.addEventListener('input', () => {
      const v = this.el.name.value.trim().slice(0, 18);
      this.s.explorer.name = v || 'Captain Void';
      this.h.onNameChange && this.h.onNameChange(this.s.explorer.name);
    });
    this.el.color.addEventListener('input', () => {
      this.s.explorer.color = this.el.color.value;
      this.h.onColorChange && this.h.onColorChange(this.s.explorer.color);
    });
    this.el.sound.addEventListener('change', () => {
      this.s.settings.sound = this.el.sound.checked;
      this.h.onSoundChange && this.h.onSoundChange(this.el.sound.checked);
    });
    this.el.particles.addEventListener('change', () => {
      this.s.settings.particles = this.el.particles.value;
      this.h.onParticlesChange && this.h.onParticlesChange(this.el.particles.value);
    });
    this.el.exportBtn.addEventListener('click', () => this.h.onExport && this.h.onExport());
    this.el.importInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { this.h.onImport && this.h.onImport(reader.result); }
        catch (err) { alert('Import failed: ' + err.message); }
        e.target.value = '';
      };
      reader.readAsText(f);
    });
    this.el.resetBtn.addEventListener('click', () => {
      if (confirm('Reset ALL progress? This cannot be undone.')) {
        this.h.onReset && this.h.onReset();
      }
    });
  }

  open() { this.render(); this.el.panel.classList.add('open'); }
  close() { this.el.panel.classList.remove('open'); }
  toggle() { this.el.panel.classList.toggle('open'); if (this.el.panel.classList.contains('open')) this.render(); }

  render() {
    this.el.name.value = this.s.explorer.name;
    this.el.color.value = this.s.explorer.color;
    const lv = levelFromXp(this.s.xp);
    this.el.rank.textContent = rankForLevel(lv.level) + ' · Level ' + lv.level;

    const stats = [
      ['💎', 'Crystals now', fmt(this.s.crystals)],
      ['⛏️', 'Total mined', fmt(this.s.totalMined)],
      ['🛰️', 'Auto-mined', fmt(this.s.autoMined)],
      ['🖱️', 'Clicks', fmt(this.s.totalClicks)],
      ['🔥', 'Best combo', this.s.bestCombo + '×'],
      ['⏱️', 'Playtime', fmtTime(this.s.playtimeS)],
      ['🧰', 'Upgrades bought', this.s.totalBuys],
      ['🌈', 'Theme', THEMES[Math.min(this.s.upgrades.theme, THEMES.length - 1)].name]
    ];
    this.el.stats.innerHTML = stats.map(([ic, lab, val]) =>
      `<div class="stat-tile"><div class="stat-icon">${ic}</div>
        <div class="stat-val">${val}</div><div class="stat-label">${lab}</div></div>`
    ).join('');

    // Achievements
    this.el.ach.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const owned = this.s.achievements.includes(a.id);
      const tile = document.createElement('div');
      tile.className = 'ach-tile' + (owned ? ' owned' : ' locked');
      tile.innerHTML = `<div class="ach-icon">${owned ? a.icon : '🔒'}</div>
        <div class="ach-title">${a.title}</div>
        <div class="ach-desc">${a.desc}</div>`;
      this.el.ach.appendChild(tile);
    }

    // Journey log
    if (!this.s.log.length) {
      this.el.log.innerHTML = '<li class="log-empty">No entries yet — go mine something! ✦</li>';
    } else {
      const now = Date.now();
      this.el.log.innerHTML = this.s.log.map(e =>
        `<li><span class="log-time">${fmtTime(Math.max(0, (now - e.t) / 1000))} ago</span> ${e.msg}</li>`
      ).join('');
    }

    this.el.sound.checked = this.s.settings.sound;
    this.el.particles.value = this.s.settings.particles;
  }
}
