// ============================================================
// Sphere Quest — HUD / store / missions / feedback UI
// ============================================================
import {
  UPGRADES, THEMES, fmt, fmtTime, upgradePrice, canBuyUpgrade,
  getAutoRate, getGlobalMult, levelFromXp, rankForLevel, missionProgress
} from './logic.js';

export class UI {
  constructor(state) {
    this.s = state;
    this.el = {
      crystals: document.getElementById('hud-crystals'),
      rate: document.getElementById('hud-rate'),
      power: document.getElementById('hud-pow'),
      level: document.getElementById('hud-level'),
      rank: document.getElementById('hud-rank'),
      xpFill: document.getElementById('hud-xp-fill'),
      xpText: document.getElementById('hud-xp-text'),
      toasts: document.getElementById('toasts'),
      floatLayer: document.getElementById('float-layer'),
      missionsRow: document.getElementById('missions-row'),
      storeGrid: document.getElementById('store-grid')
    };
    this.onBuy = null;
    this.onClaim = null;
  }

  updateHud() {
    const lv = levelFromXp(this.s.xp);
    this.el.crystals.textContent = fmt(this.s.crystals);
    this.el.rate.textContent = fmt(getAutoRate(this.s) * getGlobalMult(this.s)) + '/s';
    this.el.power.textContent = '+ ' + fmt(1 + this.s.upgrades.power) + ' / click';
    this.el.level.textContent = lv.level;
    this.el.rank.textContent = rankForLevel(lv.level);
    const pct = Math.max(0, Math.min(1, lv.into / lv.need));
    this.el.xpFill.style.width = (pct * 100).toFixed(1) + '%';
    this.el.xpText.textContent = `${fmt(lv.into)} / ${fmt(lv.need)} XP`;
  }

  // ---- Toasts ----------------------------------------------------------
  toast(html, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = html;
    this.el.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 400);
    }, 3400);
  }

  // ---- Floating text over the 3D scene --------------------------------
  floatText(x, y, text, color = '#fff') {
    const d = document.createElement('div');
    d.className = 'float-text';
    d.textContent = text;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    d.style.color = color;
    this.el.floatLayer.appendChild(d);
    setTimeout(() => d.remove(), 950);
  }

  // ---- Store -----------------------------------------------------------
  renderStore() {
    this.el.storeGrid.innerHTML = '';
    for (const [id, u] of Object.entries(UPGRADES)) {
      const card = document.createElement('div');
      card.className = 'store-card';
      card.dataset.upgrade = id;

      const head = document.createElement('div');
      head.className = 'store-head';
      head.innerHTML = `<span class="store-icon">${u.icon}</span>
        <div><div class="store-name">${u.name}</div><div class="store-lvl">Level <b class="lvl">0</b></div></div>`;
      card.appendChild(head);

      const blurb = document.createElement('p');
      blurb.className = 'store-blurb';
      blurb.textContent = u.blurb + (id === 'theme' ? ` (${THEMES[u.max - 1].name} is final)` : '');
      card.appendChild(blurb);

      if (id === 'theme') {
        const sw = document.createElement('div');
        sw.className = 'theme-swatches';
        THEMES.forEach((t, i) => {
          const dot = document.createElement('span');
          dot.className = 'swatch';
          dot.style.background = t.accent;
          dot.title = t.name;
          dot.dataset.idx = i;
          sw.appendChild(dot);
        });
        card.appendChild(sw);
      }

      const foot = document.createElement('div');
      foot.className = 'store-foot';
      const cost = document.createElement('span');
      cost.className = 'store-cost';
      const btn = document.createElement('button');
      btn.className = 'buy-btn';
      btn.textContent = 'Upgrade';
      btn.addEventListener('click', () => this.onBuy && this.onBuy(id));
      foot.appendChild(cost);
      foot.appendChild(btn);
      card.appendChild(foot);

      this.el.storeGrid.appendChild(card);
    }
  }

  refreshStore() {
    for (const [id, u] of Object.entries(UPGRADES)) {
      const card = this.el.storeGrid.querySelector(`[data-upgrade="${id}"]`);
      if (!card) continue;
      const lvl = this.s.upgrades[id];
      const maxed = lvl >= u.max;
      card.querySelector('.lvl').textContent = lvl;
      const costEl = card.querySelector('.store-cost');
      const btn = card.querySelector('.buy-btn');
      if (maxed) {
        costEl.textContent = 'MAX';
        btn.disabled = true;
        btn.textContent = 'Maxed';
        card.classList.add('maxed');
      } else {
        const price = upgradePrice(id, this.s);
        costEl.textContent = '💎 ' + fmt(price);
        const afford = canBuyUpgrade(id, this.s);
        btn.disabled = !afford;
        btn.textContent = 'Upgrade';
        card.classList.toggle('afford', afford);
      }
      if (id === 'theme') {
        card.querySelectorAll('.swatch').forEach((dot, i) => {
          dot.classList.toggle('owned', i <= lvl);
          dot.classList.toggle('next', i === lvl + 1);
        });
      }
    }
  }

  // ---- Missions --------------------------------------------------------
  renderMissions() {
    this.el.missionsRow.innerHTML = '';
    const missions = this.s.missions || [];
    for (const m of missions) {
      const chip = document.createElement('div');
      chip.className = 'mission-chip';
      const tpl = { mine: 'mine', clicks: 'clicks', xp: 'xp', total: 'total', combo: 'combo', buys: 'buys' }[m.tpl];
      const label = tpl === 'mine' ? `Mine ${fmt(m.n)} crystals`
        : tpl === 'clicks' ? `Click the sphere ${fmt(m.n)} times`
        : tpl === 'xp' ? `Earn ${fmt(m.n)} XP`
        : tpl === 'total' ? `Mine ${fmt(m.n)} crystals overall`
        : tpl === 'combo' ? `Hit a ${m.n}-click combo`
        : `Buy ${m.n} upgrades`;
      const prog = Math.min(m.n, missionProgress(this.s, m));

      chip.innerHTML = `<div class="mission-top">
          <span class="mission-label">${label}</span>
          <span class="mission-claimzone"></span>
        </div>
        <div class="mission-bar"><div class="mission-fill" style="width:${(prog / m.n * 100).toFixed(0)}%"></div></div>
        <div class="mission-progress">${fmt(prog)} / ${fmt(m.n)}</div>`;

      const zone = chip.querySelector('.mission-claimzone');
      if (m.claimed) {
        zone.innerHTML = '<span class="mission-done">✓ claimed</span>';
      } else if (prog >= m.n) {
        const b = document.createElement('button');
        b.className = 'claim-btn';
        b.textContent = 'Claim 💎 ' + fmt(m.reward);
        b.addEventListener('click', () => this.onClaim && this.onClaim(m));
        zone.appendChild(b);
      } else {
        zone.innerHTML = `<span class="mission-reward">💎 ${fmt(m.reward)}</span>`;
      }
      this.el.missionsRow.appendChild(chip);
    }
  }
}
