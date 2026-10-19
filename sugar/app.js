/* ─────────────────────────────────────────────────────────────
   Sugar Tracker · sugar.yaeger.info
   Vanilla JS SPA — login, tracking (search/QR), leaderboard.
   ─────────────────────────────────────────────────────────── */

(() => {
  "use strict";

  const API = window.location.origin.includes("github.io") ? "https://sugar.yaeger.info" : "";
const USERS = ["alex", "julie", "jimmy", "christine", "gregg", "tom", "valentina"];
const AVATARS = ["avatar-0", "avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6"];

  const app = document.getElementById("app");

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const state = {
    token: localStorage.getItem("sugar_token") || "",
    user: localStorage.getItem("sugar_user") || "",
    lastUser: localStorage.getItem("sugar_last_user") || "",
    tab: "track",
    me: null,
    leaderboard: null,
    weekOffset: 0,          // 0 = current week (Mon–Sun); 1 = last week; …
    weekData: null,         // /api/weeks/{week_start} payload
    weeksList: null,        // string[] of week_start dates, newest first
    pendingQuery: "",
    matches: [],
    autofillOpen: false,
    isEstimating: false,
    qrScanner: null,
    qrActive: false,
    feedback: [],
    mainTab: localStorage.getItem("sugar_main_tab") || "log",
    logRange: localStorage.getItem("sugar_log_range") || "day",
    vizRange: localStorage.getItem("sugar_viz_range") || "day",
    vizMetric: localStorage.getItem("sugar_viz_metric") || "added",
    vizWho: localStorage.getItem("sugar_viz_who") || "all",
    vizMode: localStorage.getItem("sugar_viz_mode") === "chamber" ? "chamber" : "flat",
    chart: null,
    fbOpen: false,
    onlineUsers: [],
  };

  const CAT_EMOJI = { drink: "🥤", food: "🍽️", sweet: "🍬", fruit: "🍎", cereal: "🥣", dessert: "🍰", manual: "⚖️" };
  const catEmoji = (c) => CAT_EMOJI[c] || "🍽️";
  const foodEmoji = (e) => (e && e.emoji) || catEmoji(e && e.category);
  const fmt = (n) => { const x = Number(n || 0); return Number.isInteger(x) ? String(x) : x.toFixed(1); };
  const sugarClass = (g) => { g = Number(g) || 0; return g === 0 ? "low" : g < 15 ? "low" : g < 30 ? "med" : "high"; };
  const avatarFor = (idx) => AVATARS[((idx % AVATARS.length) + AVATARS.length) % AVATARS.length];
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  // ── Standardized Clinical Recommended Daily Amounts (Men vs Women) ──
  const WOMAN_NAMES = new Set(["julie", "christine", "valentina", "sarah", "emily", "jessica", "anna", "maria", "laura", "lisa"]);
  const isWoman = (name) => WOMAN_NAMES.has(String(name || "").toLowerCase().trim());

  const WOMEN_TARGETS = {
    added: 25,
    sugar: 25,
    carbs: 225,
    protein: 50,
    calories: 2000,
    caffeine: 200,
    ounces: 91,
  };

  const MEN_TARGETS = {
    added: 36,
    sugar: 36,
    carbs: 280,
    protein: 60,
    calories: 2500,
    caffeine: 200,
    ounces: 125,
  };

  const userTarget = (name, metricKey) => {
    const isW = isWoman(name);
    const set = isW ? WOMEN_TARGETS : MEN_TARGETS;
    return set[metricKey] ?? 50;
  };

  const userSugarLimit = (name) => userTarget(name, "added");

  const MATRIX_METRICS = [
    { k: "added",    label: "Added Sugar", emoji: "🩸", unit: "g",   color: "#e11d48", dir: "limit", limit: 36 },
    { k: "carbs",    label: "Carbs",       emoji: "🍞", unit: "g",   color: "#0284c7", dir: "goal",  limit: 280 },
    { k: "protein",  label: "Protein",     emoji: "💪", unit: "g",   color: "#d97706", dir: "goal",  limit: 60 },
    { k: "caffeine", label: "Caffeine",    emoji: "⚡", unit: "mg",  color: "#7c3aed", dir: "limit", limit: 200 },
    { k: "ounces",   label: "Ounces",      emoji: "💧", unit: "oz",  color: "#059669", dir: "goal",  limit: 125 },
    { k: "calories", label: "Calories",    emoji: "🔥", unit: "kcal",color: "#ea580c", dir: "goal",  limit: 2500 },
  ];

  const METRICS = [
    { k: "added",    label: "Added Sugar", emoji: "🩸", unit: "g",   color: "#e11d48", dir: "limit",  today: (m) => m.today_added_total ?? m.today_total ?? 0, t: (u) => userTarget(u || state.user, "added") },
    { k: "carbs",    label: "Carbs",       emoji: "🍞", unit: "g",   color: "#0284c7", dir: "goal",   today: (m) => m.today_carbs ?? 0,                       t: (u) => userTarget(u || state.user, "carbs") },
    { k: "protein",  label: "Protein",     emoji: "💪", unit: "g",   color: "#d97706", dir: "goal",   today: (m) => m.today_protein ?? 0,                     t: (u) => userTarget(u || state.user, "protein") },
    { k: "caffeine", label: "Caffeine",    emoji: "⚡", unit: "mg",  color: "#7c3aed", dir: "limit",  today: (m) => m.today_caffeine ?? 0,                    t: (u) => userTarget(u || state.user, "caffeine") },
    { k: "ounces",   label: "Ounces",      emoji: "💧", unit: "oz",  color: "#059669", dir: "goal",   today: (m) => m.today_ounces ?? 0,                      t: (u) => userTarget(u || state.user, "ounces") },
    { k: "calories", label: "Calories",    emoji: "🔥", unit: "kcal",color: "#ea580c", dir: "goal",   today: (m) => m.today_calories ?? 0,                    t: (u) => userTarget(u || state.user, "calories") },
  ];
  const num = (v) => { const x = Number(v); return isNaN(x) ? 0 : x; };
  const targetFor = (metricKey, user) => userTarget(user || state.user, metricKey);
  const limitTone = (dir, ratio) => (dir === "goal" ? "" : ratio < 0.6 ? "good" : ratio <= 1 ? "warn" : "over");
  const nutrientLine = (obj) => {
    const p = num(obj.protein_g ?? obj.protein_grams), c = num(obj.calories_kcal), cf = num(obj.caffeine_mg), oz = num(obj.ounces), cb = num(obj.carbs_grams ?? obj.carbs_g);
    const parts = [];
    if (cb > 0) parts.push(`${fmt(cb)}g carbs`);
    if (p > 0) parts.push(`${fmt(p)}g p`);
    if (c > 0) parts.push(`${fmt(c)} kcal`);
    if (cf > 0) parts.push(`${fmt(cf)}mg`);
    if (oz > 0) parts.push(`${fmt(oz)}oz`);
    return parts.join(" · ");
  };

  // ── API helper ─────────────────────────────────────────────
  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(API + path, {
      ...opts,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401 && path !== "/api/login") {
      logout();
      throw new Error("Session expired — please log in again");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || `HTTP ${res.status}`);
    return data;
  }

  // ── Toast ──────────────────────────────────────────────────
  let toastTimer = null;
  function toast(msg, isError = false) {
    if (toastTimer) clearTimeout(toastTimer);
    let t = document.querySelector(".toast");
    if (!t) { t = el("div", "toast"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    requestAnimationFrame(() => t.classList.add("show"));
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  const sugarOrbHTML = (size) => `
    <div class="sugar-orb${size === "lg" ? " lg" : ""}" aria-hidden="true">
      <div class="so-flux"></div>
      <div class="so-laser"></div>
      <div class="so-halo"></div>
      <div class="so-flicker"></div>
      <div class="so-core">
        <div class="so-eq"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <span class="so-candy">🍬</span>
        <span class="so-label">sugar</span>
        <div class="so-sheen"></div>
      </div>
    </div>`;

  // ── User picker ────────────────────────────────────────────
  // New / unrecognized devices always land here — never auto-log a default
  // user. The pick is remembered in localStorage so the device keeps logging
  // for the same person until they explicitly switch.

  function renderUserPicker() {
    app.innerHTML = `
      <div class="picker-wrap">
        <div class="picker-card">
          <div class="picker-logo">${sugarOrbHTML("lg")}</div>
          <h1>Who's on this device?</h1>
          <p class="picker-sub">This device will remember your pick until you switch.</p>
          <div class="picker-grid">
            ${USERS.map((u) => `
              <button class="picker-btn" data-user="${u}">
                <span class="picker-avatar ${avatarFor(USERS.indexOf(u))}">${esc(u[0]).toUpperCase()}</span>
                <span class="picker-name">${esc(cap(u))}</span>
                ${u === state.lastUser ? '<span class="picker-last">last on this device</span>' : ""}
              </button>`).join("")}
          </div>
        </div>
      </div>`;
    app.querySelectorAll(".picker-btn").forEach((b) =>
      b.addEventListener("click", () => login(b.dataset.user, { silent: true }))
    );
  }

  async function login(name, opts = {}) {
    try {
      const data = await api("/api/login", { method: "POST", body: { name } });
      state.token = data.token;
      state.user = data.user;
      state.lastUser = data.user;
      localStorage.setItem("sugar_token", data.token);
      localStorage.setItem("sugar_user", data.user);
      localStorage.setItem("sugar_last_user", data.user);
      if (!opts.silent) toast(`Now logging for: ${cap(data.user)}`);
      await loadInitial();
      renderApp();
    } catch (e) {
      toast(e.message, true);
      renderUserPicker();
    }
  }

  function logout() {
    if (state.token) api("/api/logout", { method: "POST" }).catch(() => {});
    state.token = "";
    state.user = "";
    state.me = null;
    state.leaderboard = null;
    state.feedback = [];
    localStorage.removeItem("sugar_token");
    localStorage.removeItem("sugar_user");
    renderUserPicker(); // back to explicit pick — never fall back to a default user
  }

  // ── Data loading ───────────────────────────────────────────
  async function loadInitial() {
    const [me, lb, wl, fb, ch] = await Promise.all([
      api("/api/me").catch(() => ({ user: state.user, today_total: 0, all_time_total: 0, entries: [] })),
      api("/api/leaderboard").catch(() => ({ active: [], inactive: [], me: state.user })),
      api("/api/weeks/list").catch(() => ({ weeks: [] })),
      api("/api/feedback").catch(() => ({ items: [] })),
      api("/api/leaderboard/chart").catch(() => null),
    ]);
    state.feedback = fb.items || [];
    state.chart = ch;
    state.me = me;
    state.leaderboard = lb;
    state.onlineUsers = lb.online_users || (state.user ? [state.user] : []);
    state.weeksList = wl.weeks || [];
    await loadWeek(state.weekOffset);
    sugarSand.syncTotal(me ? (me.today_added_total ?? me.today_total ?? 0) : 0, { bake: true });
  }

  async function loadWeek(offset) {
    const weeks = state.weeksList || [];
    if (!weeks.length) {
      // No entries yet — still show the current week label, strip disabled.
      const m = new Date();
      m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
      state.weekData = {
        week_start: m.toISOString().slice(0, 10),
        week_end: new Date(m.getTime() + 6 * 864e5).toISOString().slice(0, 10),
        today: new Date().toISOString().slice(0, 10),
        is_current: true, complete: false, winner: null, users: [], targets: {},
      };
      state.weekOffset = 0;
      return;
    }
    state.weekOffset = clamp(offset, 0, weeks.length - 1);
    const ws = weeks[state.weekOffset];
    try {
      state.weekData = await api(`/api/weeks/${ws}`);
    } catch (e) {
      state.weekData = null;
      toast(e.message || "Could not load week", true);
    }
  }

  // ── Main app shell ─────────────────────────────────────────
  function renderApp() {
    const meUser = state.user || "jimmy";
    const uIdx = USERS.indexOf(meUser);

    app.innerHTML = `
      <div class="topbar">
        <div class="brand">
          ${sugarOrbHTML()}
          <span class="brand-name">Sugar Tracker<small>yaeger.info</small></span>
        </div>
        <div class="topbar-user" id="topbar-user">
          <div class="tb-user-pill">
            <span class="tb-avatar ${avatarFor(uIdx)}">${esc((meUser || "?")[0]).toUpperCase()}</span>
            <div class="tb-meta">
              <span class="tb-sub">Logged in as</span>
              <span class="tb-name">${esc(cap(meUser))}</span>
            </div>
            <button type="button" class="tb-switch-btn" id="ab-switch" title="Switch user">⇄ switch</button>
          </div>
        </div>
      </div>

      <div id="view"></div>
    `;

    document.getElementById("ab-switch")?.addEventListener("click", renderUserPicker);

    document.removeEventListener("click", onDocClick);
    document.addEventListener("click", onDocClick);

    renderTrack();

    document.removeEventListener("click", onOnboardingClick);
    document.addEventListener("click", onOnboardingClick);
  }

  function onOnboardingClick(e) {
    const d = e.target.closest("#ob-dismiss");
    if (d) {
      localStorage.setItem(onboardKey(), "1");
      const b = document.getElementById("onboarding-banner");
      if (b) b.remove();
    }
  }

  function onboardKey() {
    return "sugar_onboarding_seen_" + (state.user || "anon");
  }

  // ── Nutrient summary rings (donut progress) ──────────────
  function onboardingBanner() {
    if (localStorage.getItem(onboardKey())) return "";
    return `
      <div class="onboarding-banner" id="onboarding-banner">
        <div class="ob-content">
          <h3>👋 Welcome</h3>
          <ul class="ob-bullets">
            <li>
              <span class="ob-num">1</span>
              <div><strong>Type what you ate</strong> in the box above and hit <b>+ Add</b>. One item or many — try <em>"burger and a coke"</em> or <em>"2 eggs, toast, orange juice"</em>.</div>
            </li>
            <li>
              <span class="ob-num">2</span>
              <div><strong>Type what you ate</strong> — the <b>✨ Add with AI</b> row appears as you type. Hit it (or Enter) to log.</div>
            </li>
            <li>
              <span class="ob-num">3</span>
              <div><strong>Click a name in the leaderboard</strong> to log for that person — the highlighted row shows who's active.</div>
            </li>
          </ul>
          <button class="btn btn-primary ob-dismiss-btn" id="ob-dismiss">Got it</button>
        </div>
      </div>`;
  }
  function summaryRows() {
    const me0 = state.me || { today_total: 0, today_protein: 0, today_calories: 0, today_caffeine: 0, today_ounces: 0 };
    return METRICS.map((m) => {
      const value = num(m.today(me0));
      const target = targetFor(m.k);
      return { ...m, value, target, ratio: target ? value / target : 0 };
    });
  }

  function metricScore(s) {
    const r = s.ratio;
    if (s.dir === "limit") {
      if (r <= 0.85) return 100;
      if (r <= 1) return Math.round(100 - ((r - 0.85) / 0.15) * 35);
      return Math.max(0, Math.round(65 - (r - 1) * 90));
    }
    if (r <= 1) return Math.round(clamp(r, 0, 1) * 100);
    if (r <= 1.25) return 100;
    return Math.max(0, Math.round(100 - (r - 1.25) * 80));
  }

  function dayScore(rows) {
    if (!rows.length) return 0;
    return Math.round(rows.reduce((a, s) => a + metricScore(s), 0) / rows.length);
  }

  function polar(cx, cy, r, deg) {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function donutPath(cx, cy, r0, r1, a0, a1) {
    const large = a1 - a0 > 180 ? 1 : 0;
    const [x0, y0] = polar(cx, cy, r1, a0);
    const [x1, y1] = polar(cx, cy, r1, a1);
    const [x2, y2] = polar(cx, cy, r0, a1);
    const [x3, y3] = polar(cx, cy, r0, a0);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z`;
  }

  function daysThisWeek() {
    const d = new Date();
    return d.getDay() === 0 ? 7 : d.getDay();
  }

  function memberStats(name) {
    const lb = state.leaderboard || {};
    const hit = (lb.active || []).find((a) => a.name === name);
    if (hit) return hit;
    return {
      name,
      day_sugar: 0, week_sugar: 0,
      day_carbs: 0, week_carbs: 0,
      day_protein: 0, week_protein: 0,
      day_calories: 0, week_calories: 0,
      day_caffeine: 0, week_caffeine: 0,
      day_ounces: 0, week_ounces: 0,
    };
  }

  function rowsForUser(name, range = "day") {
    const a = memberStats(name);
    const mul = range === "week" ? 7 : 1;
    const val = {
      added: range === "week" ? num(a.week_sugar) : num(a.day_sugar),
      carbs: range === "week" ? num(a.week_carbs) : num(a.day_carbs),
      protein: range === "week" ? num(a.week_protein) : num(a.day_protein),
      caffeine: range === "week" ? num(a.week_caffeine) : num(a.day_caffeine),
      ounces: range === "week" ? num(a.week_ounces) : num(a.day_ounces),
      calories: range === "week" ? num(a.week_calories) : num(a.day_calories),
    };
    return MATRIX_METRICS.map((m) => {
      const value = num(val[m.k]);
      const dailyTgt = userTarget(name, m.k);
      const target = dailyTgt * mul;
      const ratio = target ? value / target : 0;
      return { ...m, value, target, ratio, user: name };
    });
  }

  // ── Ultra-Light Granular Sugar Glass Beaker Engine ─────────
  const sugarBeakerEngine = (function() {
    const CANV_W = 72, CANV_H = 72;
    const NUM_BINS = 28;
    const BEAKER_X = 8, BEAKER_Y = 8, BEAKER_W = 56, BEAKER_H = 56;
    const FLOOR_Y = BEAKER_Y + BEAKER_H - 4;
    const MAX_PARTICLES = 36; // Ultra low compute

    const instances = new WeakMap();

    function getOrCreate(canvas) {
      if (instances.has(canvas)) return instances.get(canvas);
      const hMap = new Float32Array(NUM_BINS);
      for (let i = 0; i < NUM_BINS; i++) hMap[i] = FLOOR_Y;
      const initialVal = Math.max(0, Number(canvas.dataset.value) || 0);
      const initialTgt = Math.max(1, Number(canvas.dataset.target) || 36);
      const st = {
        hMap,
        particles: [],
        currentGrams: initialVal,
        targetGrams: initialVal,
        targetMax: initialTgt,
        dirty: true,
        phase: Math.random() * Math.PI * 2,
        ctx: canvas.getContext("2d", { alpha: true }),
      };
      instances.set(canvas, st);
      return st;
    }

    function syncBeaker(canvas, valG, tgtG) {
      const st = getOrCreate(canvas);
      const val = Math.max(0, Number(valG) || 0);
      const tgt = Math.max(1, Number(tgtG) || 36);
      if (Math.abs(st.targetGrams - val) > 0.05 || Math.abs(st.targetMax - tgt) > 0.05) {
        if (val > st.currentGrams) {
          const delta = Math.min(16, Math.ceil((val - st.currentGrams) * 3));
          for (let k = 0; k < delta; k++) {
            if (st.particles.length < MAX_PARTICLES) {
              st.particles.push({
                x: BEAKER_X + 6 + Math.random() * (BEAKER_W - 12),
                y: BEAKER_Y + Math.random() * 6,
                vx: (Math.random() - 0.5) * 1.0,
                vy: 1.4 + Math.random() * 2.0,
                size: 2.2 + Math.random() * 1.2,
                color: ["#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0"][Math.floor(Math.random() * 4)],
              });
            }
          }
        }
        st.targetGrams = val;
        st.targetMax = tgt;
        st.dirty = true;
      }
    }

    function renderBeaker(st) {
      const ctx = st.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, CANV_W, CANV_H);

      // Glass interior sleek high-contrast background
      const intGrad = ctx.createLinearGradient(0, BEAKER_Y, 0, FLOOR_Y);
      intGrad.addColorStop(0, "rgba(30, 41, 59, 0.12)");
      intGrad.addColorStop(1, "rgba(15, 23, 42, 0.22)");
      ctx.fillStyle = intGrad;
      ctx.fillRect(BEAKER_X + 2, BEAKER_Y, BEAKER_W - 4, BEAKER_H - 4);

      // Sugar compacted bed calculation
      const fillRatio = Math.min(1.35, st.currentGrams / (st.targetMax || 36));
      const targetBedHeight = st.currentGrams > 0 ? Math.max(6, fillRatio * (BEAKER_H - 12)) : 0;

      // Build heightfield
      ctx.beginPath();
      ctx.moveTo(BEAKER_X + 2.5, FLOOR_Y);
      for (let i = 0; i < NUM_BINS; i++) {
        const bx = BEAKER_X + 2.5 + i * ((BEAKER_W - 5) / NUM_BINS) + ((BEAKER_W - 5) / NUM_BINS) / 2;
        const normX = (i - NUM_BINS / 2) / (NUM_BINS / 2);
        const moundCurve = 1 - normX * normX * 0.45;
        const currentColY = FLOOR_Y - targetBedHeight * moundCurve;
        st.hMap[i] = currentColY;
        ctx.lineTo(bx, currentColY);
      }
      ctx.lineTo(BEAKER_X + BEAKER_W - 2.5, FLOOR_Y);
      ctx.closePath();

      if (targetBedHeight > 0.5) {
        // Crisp, high-contrast sugar bed gradient
        const heapGrad = ctx.createLinearGradient(BEAKER_X, BEAKER_Y + 10, BEAKER_X, FLOOR_Y);
        heapGrad.addColorStop(0, "#ffffff");
        heapGrad.addColorStop(0.3, "#f8fafc");
        heapGrad.addColorStop(0.7, "#e2e8f0");
        heapGrad.addColorStop(1, "#cbd5e1");
        ctx.fillStyle = heapGrad;
        ctx.fill();

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Individual visible granulated sugar crystal molecules
        ctx.save();
        ctx.clip();
        for (let g = 0; g < 24; g++) {
          const gx = BEAKER_X + 4 + ((g * 19) % (BEAKER_W - 8));
          const gy = FLOOR_Y - 3 - ((g * 13) % Math.max(4, targetBedHeight - 2));
          const sz = 1.8 + (g % 3) * 0.6;
          // Crystal base shadow
          ctx.fillStyle = "rgba(100, 116, 139, 0.45)";
          ctx.fillRect(gx + 0.5, gy + 0.5, sz, sz);
          // Pure white crystal facet
          ctx.fillStyle = (g % 2 === 0) ? "#ffffff" : "#f1f5f9";
          ctx.fillRect(gx, gy, sz, sz);
        }

        // Diamond sparkles along crest
        for (let s = 0; s < 6; s++) {
          const binIdx = Math.floor((s * 4.9 + st.phase * 3.5) % NUM_BINS);
          const sx = BEAKER_X + 2.5 + binIdx * ((BEAKER_W - 5) / NUM_BINS);
          const sy = st.hMap[binIdx];
          if (sy < FLOOR_Y - 1) {
            const alpha = 0.5 + 0.5 * Math.abs(Math.sin(st.phase * 2.5 + s * 1.7));
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(sx - 1, sy - 1, 2.2, 2.2);
            if (alpha > 0.8) {
              ctx.fillRect(sx - 3, sy - 0.5, 6, 1);
              ctx.fillRect(sx - 0.5, sy - 3, 1, 6);
            }
          }
        }
        ctx.restore();
      }

      // Active falling sugar grains with visible 3D facets
      for (let p of st.particles) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
        ctx.fillRect(p.x - p.size / 2 + 0.5, p.y - p.size / 2 + 0.5, p.size, p.size);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }

      // Glass Walls and Lip Rim
      ctx.strokeStyle = "rgba(71, 85, 105, 0.7)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(BEAKER_X - 2, BEAKER_Y);
      ctx.lineTo(BEAKER_X + 2, BEAKER_Y);
      ctx.lineTo(BEAKER_X + 2, FLOOR_Y);
      ctx.lineTo(BEAKER_X + BEAKER_W - 2, FLOOR_Y);
      ctx.lineTo(BEAKER_X + BEAKER_W - 2, BEAKER_Y);
      ctx.lineTo(BEAKER_X + BEAKER_W + 2, BEAKER_Y);
      ctx.stroke();

      // Top Lip
      ctx.strokeStyle = "rgba(71, 85, 105, 0.9)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(BEAKER_X - 2, BEAKER_Y);
      ctx.lineTo(BEAKER_X + BEAKER_W + 2, BEAKER_Y);
      ctx.stroke();

      // Laser Graduation Marks (25%, 50%, 75%, 100%)
      ctx.strokeStyle = "rgba(71, 85, 105, 0.6)";
      ctx.lineWidth = 1.1;
      for (let f of [0.25, 0.5, 0.75, 1.0]) {
        const gy = FLOOR_Y - f * (BEAKER_H - 12);
        ctx.beginPath();
        ctx.moveTo(BEAKER_X + 2, gy);
        ctx.lineTo(BEAKER_X + 6, gy);
        ctx.moveTo(BEAKER_X + BEAKER_W - 6, gy);
        ctx.lineTo(BEAKER_X + BEAKER_W - 2, gy);
        ctx.stroke();
      }

      // Specular Glass Sheen Highlight
      const specGrad = ctx.createLinearGradient(BEAKER_X + 2, 0, BEAKER_X + 11, 0);
      specGrad.addColorStop(0, "rgba(255, 255, 255, 0.85)");
      specGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = specGrad;
      ctx.fillRect(BEAKER_X + 2, BEAKER_Y + 1, 9, BEAKER_H - 6);
    }

    let rafId = 0;
    function loop() {
      const canvases = document.querySelectorAll(".sugar-beaker-canvas");
      canvases.forEach((c) => {
        const val = parseFloat(c.dataset.value || "0");
        const tgt = parseFloat(c.dataset.target || "36");
        const st = getOrCreate(c);
        if (Math.abs(st.targetGrams - val) > 0.01 || Math.abs(st.targetMax - tgt) > 0.01) {
          syncBeaker(c, val, tgt);
        }

        // Interpolate mass
        if (Math.abs(st.currentGrams - st.targetGrams) > 0.05) {
          st.currentGrams += (st.targetGrams - st.currentGrams) * 0.25;
          st.dirty = true;
        } else {
          st.currentGrams = st.targetGrams;
        }

        // Update active particles
        if (st.particles.length > 0) {
          st.dirty = true;
          for (let i = st.particles.length - 1; i >= 0; i--) {
            const p = st.particles[i];
            p.vy += 0.25;
            p.x += p.vx;
            p.y += p.vy;
            const bin = Math.floor(((p.x - BEAKER_X) / BEAKER_W) * NUM_BINS);
            const surfY = (bin >= 0 && bin < NUM_BINS) ? st.hMap[bin] : FLOOR_Y;
            if (p.y >= surfY) {
              st.particles.splice(i, 1);
            }
          }
        }

        // Glint sparkle phase
        if (st.currentGrams > 0.5) {
          st.phase = (st.phase + 0.04) % (Math.PI * 2);
          st.dirty = true;
        }

        if (st.dirty) {
          renderBeaker(st);
          st.dirty = false;
        }
      });

      rafId = requestAnimationFrame(loop);
    }

    function init() {
      if (!rafId) loop();
    }

    return { init };
  })();

  function metricCardHTML(s, isMe = false) {
    const isOver = s.dir === "limit" && s.ratio > 1;
    const tone = limitTone(s.dir, s.ratio);
    const center = isOver ? `+${fmt(s.value - s.target)}` : `${Math.round(s.ratio * 100)}%`;

    // Added Sugar: Custom 3D Glass Beaker Particle Box (Clean: No Emoji)
    if (s.k === "added") {
      return `
        <div class="metric-card ${tone}${isOver ? " is-over" : ""} ring-clickable mc-card-glass"
             data-metric="${s.k}" data-value="${s.value}" data-target="${s.target}" data-unit="${s.unit}"
             data-label="${s.label}" data-color="${s.color}" data-user="${s.user || ""}"
             tabindex="0" role="button"
             title="Click to view breakdown of what contributed to ${s.label.toLowerCase()}">
          <div class="mc-glass-wrap">
            <canvas class="sugar-beaker-canvas" data-value="${s.value}" data-target="${s.target}" width="72" height="72"></canvas>
            <div class="mc-center mc-glass-center" style="color:${isOver ? "#e11d48" : "#0f172a"}">${center}</div>
          </div>
          <div class="mc-info">
            <div class="mc-label">${esc(s.label)}${isOver ? ' <span class="mc-over-tag">OVER</span>' : ""}</div>
            <div class="mc-val">${fmt(s.value)}/${fmt(s.target)} ${esc(s.unit)}</div>
          </div>
          <div class="mc-bar-track">
            <i class="mc-bar-fill" style="width:${Math.round(clamp(s.ratio, 0, 1) * 100)}%;background:${s.color}"></i>
          </div>
        </div>
      `;
    }

    const r = 24.5, c = 2 * Math.PI * r;
    const fill = clamp(s.ratio, 0, 1) * c;

    // Donut Rings (Clean: No Emoji)
    return `
      <div class="metric-card ${tone}${isOver ? " is-over" : ""} ring-clickable"
           data-metric="${s.k}" data-value="${s.value}" data-target="${s.target}" data-unit="${s.unit}"
           data-label="${s.label}" data-color="${s.color}" data-user="${s.user || ""}"
           tabindex="0" role="button"
           title="Click to view breakdown of what contributed to ${s.label.toLowerCase()}">
        <div class="mc-ring-wrap">
          <svg class="mc-svg" viewBox="0 0 64 64" aria-hidden="true">
            <circle class="mc-track" cx="32" cy="32" r="${r}" />
            <circle class="mc-stroke" cx="32" cy="32" r="${r}" stroke="${s.color}"
                    stroke-dasharray="${fill.toFixed(2)} ${(c - fill).toFixed(2)}" />
          </svg>
          <div class="mc-center" style="color:${s.color}">${center}</div>
        </div>
        <div class="mc-info">
          <div class="mc-label">${esc(s.label)}${isOver ? ' <span class="mc-over-tag">OVER</span>' : ""}</div>
          <div class="mc-val">${fmt(s.value)}/${fmt(s.target)} ${esc(s.unit)}</div>
        </div>
        <div class="mc-bar-track">
          <i class="mc-bar-fill" style="width:${Math.round(clamp(s.ratio, 0, 1) * 100)}%;background:${s.color}"></i>
        </div>
      </div>
    `;
  }

  // ── Metric Contribution Breakdown Modal ───────────────────
  async function openBreakdownModal({ user, metric, label, color, unit, val, tgt, range }) {
    closeBreakdownModal();
    const isMe = user === state.user;
    const uIdx = USERS.indexOf(user);

    const overlay = el("div", "breakdown-overlay");
    overlay.id = "breakdown-modal";
    overlay.innerHTML = `
      <div class="breakdown-backdrop" id="bb-backdrop"></div>
      <div class="breakdown-dialog" style="--metric-color:${color}">
        <div class="breakdown-head">
          <div class="bh-user">
            <span class="rank-avatar ${avatarFor(uIdx)}">${esc((user[0] || "?").toUpperCase())}</span>
            <div class="bh-user-meta">
              <span class="bh-name">${esc(cap(user))}${isMe ? ' <span class="active-badge">⚡ you</span>' : ""}</span>
              <span class="bh-pill" style="color:${color}">${esc(label)} · ${range === "week" ? "This Week" : "Today"}</span>
            </div>
          </div>
          <button type="button" class="breakdown-close" id="bb-close" title="Close">✕</button>
        </div>

        <div class="breakdown-summary">
          <div class="bs-stat">
            <span class="bs-val" style="color:${color}">${fmt(val)} <span class="bs-unit">${esc(unit)}</span></span>
            <span class="bs-lbl">${fmt(val)} / ${fmt(tgt)} ${esc(unit)} ${range === "week" ? "weekly allotment" : "daily limit"}</span>
          </div>
          <div class="bs-bar-track">
            <div class="bs-bar-fill" style="width:${Math.min(100, Math.round((Number(val) / (Number(tgt) || 1)) * 100))}%;background:${color}"></div>
          </div>
        </div>

        <div class="breakdown-content">
          <div class="bc-title">Top Contributing Items (${range === "week" ? "This Week" : "Today"})</div>
          <div class="bc-list" id="bb-list">
            <div class="bb-loading"><div class="spinner"></div> Loading breakdown...</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    const close = () => closeBreakdownModal();
    overlay.querySelector("#bb-close").addEventListener("click", close);
    overlay.querySelector("#bb-backdrop").addEventListener("click", close);

    const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);

    // Fetch live breakdown
    try {
      const data = await api(`/api/users/${user}/breakdown?metric=${metric}&range=${range}`);
      const listEl = overlay.querySelector("#bb-list");
      if (!listEl) return;

      const items = data.items || [];
      if (!items.length) {
        listEl.innerHTML = `
          <div class="empty-state" style="padding: 24px 0;">
            <span class="big">🌱</span>
            No items logged for ${esc(label.toLowerCase())} ${range === "week" ? "this week" : "today"} yet
          </div>
        `;
        return;
      }

      listEl.innerHTML = items.map((it, idx) => {
        const itemVal = it.metric_val || 0;
        const pct = it.contribution_pct || 0;
        const timeStr = it.created_at ? new Date(it.created_at + (it.created_at.endsWith("Z") ? "" : "Z")).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
        const dateStr = range === "week" && it.entry_date ? `${it.entry_date.slice(5)} · ` : "";

        return `
          <div class="breakdown-item" data-id="${it.id}">
            <div class="bi-left">
              <span class="bi-rank">#${idx + 1}</span>
              <span class="bi-emoji">${it.emoji || "🍽️"}</span>
              <div class="bi-details">
                <span class="bi-name">${esc(it.food_item)}</span>
                <span class="bi-sub">${esc(it.serving || "")}${timeStr ? ` · ${dateStr}${timeStr}` : ""}</span>
              </div>
            </div>
            <div class="bi-right">
              <span class="bi-val" style="color:${color}">+${fmt(itemVal)} ${esc(unit)}</span>
              <span class="bi-pct">${pct}% of total</span>
            </div>
            <div class="bi-bar" style="width:${pct}%;background:${color}"></div>
          </div>
        `;
      }).join("");

    } catch (err) {
      const listEl = overlay.querySelector("#bb-list");
      if (listEl) listEl.innerHTML = `<div class="bb-error">Failed to load breakdown.</div>`;
    }
  }

  function closeBreakdownModal() {
    const m = document.getElementById("breakdown-modal");
    if (m) {
      m.remove();
      document.body.style.overflow = "";
    }
  }

  function userRowHTML(userName, range) {
    const isMe = userName === state.user;
    const onlineList = state.onlineUsers || (state.leaderboard?.online_users) || [];
    const isOnline = isMe || onlineList.includes(userName);
    const uIdx = USERS.indexOf(userName);
    const rows = rowsForUser(userName, range);
    const lb = state.leaderboard || {};
    const act = lb.active || [];
    const lead = act.find((a) => a.name === userName);

    const dayEntries = lead ? (lead.day_entries || 0) : 0;
    const weekEntries = lead ? (lead.week_entries || 0) : 0;
    const entriesCount = range === "week" ? weekEntries : dayEntries;
    const isActive = entriesCount > 0;
    const minNeeded = range === "week" ? 5 : 2;
    const isQualified = entriesCount >= minNeeded;

    // Medals & Winner logic:
    // Only active & qualified users can receive 1st place!
    let medal = "";
    let isWinner = false;

    if (isActive && lead) {
      if (lead.rank === 1) {
        if (isQualified) {
          medal = "🥇";
          isWinner = true;
        } else {
          medal = ""; // Leading score, but not awarded 1st place until reaching threshold
        }
      } else if (lead.rank === 2) {
        medal = "🥈";
      } else if (lead.rank === 3) {
        medal = "🥉";
      }
    }

    let metaLabel = "";
    if (!isActive) {
      metaLabel = "Inactive · 0 entries";
    } else if (lead && lead.rank === 1 && !isQualified) {
      const remaining = minNeeded - entriesCount;
      metaLabel = `${entriesCount} item${entriesCount === 1 ? "" : "s"} (${remaining} more to qualify 1st)`;
    } else {
      metaLabel = `${medal ? `${medal} ` : ""}${entriesCount} item${entriesCount === 1 ? "" : "s"} ${range === "week" ? "this week" : "today"}`;
    }

    return `
      <div class="matrix-user-row ${isMe ? "is-me" : ""} ${isWinner ? "is-winner" : ""} ${!isActive ? "is-inactive" : ""}" data-user="${userName}">
        <div class="mur-user-col" role="button" tabindex="0" title="${isOnline ? "Online now · " : ""}Click to log entries for ${esc(cap(userName))}">
          <div class="mur-avatar-wrap">
            ${isOnline ? '<span class="online-indicator" title="Online now"><span class="online-pulse"></span><span class="online-dot"></span></span>' : '<span class="online-indicator is-offline"></span>'}
            <span class="rank-avatar ${avatarFor(uIdx)}">${esc((userName[0] || "?").toUpperCase())}</span>
          </div>
          <div class="mur-user-info">
            <div class="mur-user-name">${esc(cap(userName))}${isMe ? ' <span class="active-badge">⚡ active</span>' : ""}</div>
            <div class="mur-user-meta">${esc(metaLabel)}</div>
          </div>
        </div>
        <div class="mur-cards-grid">
          ${rows.map((s) => metricCardHTML(s, isMe)).join("")}
        </div>
      </div>
    `;
  }

  function familyMatrixHTML() {
    const range = state.vizRange === "week" ? "week" : "day";
    const lb = state.leaderboard || {};
    const act = lb.active || [];
    const sortedUsers = [...USERS].sort((a, b) => {
      const la = act.find((x) => x.name === a);
      const lbUser = act.find((x) => x.name === b);

      const aEntries = la ? (range === "week" ? (la.week_entries || 0) : (la.day_entries || 0)) : 0;
      const bEntries = lbUser ? (range === "week" ? (lbUser.week_entries || 0) : (lbUser.day_entries || 0)) : 0;

      const aActive = aEntries > 0;
      const bActive = bEntries > 0;

      // Active users on top, inactive users below
      if (aActive !== bActive) {
        return aActive ? -1 : 1;
      }

      const ra = la ? la.rank || 999 : 999;
      const rb = lbUser ? lbUser.rank || 999 : 999;
      return ra - rb || USERS.indexOf(a) - USERS.indexOf(b);
    });

    return `
      <section class="card matrix-card">
        <div class="matrix-head">
          <div class="matrix-title-group">
            <h2>📊 ${range === "week" ? "Weekly" : "Today’s"} Metrics</h2>
            <p class="matrix-hint">Side-by-side comparison across all metrics. Tap any tile to view top contributors.</p>
          </div>
          <div class="matrix-toggles">
            <div class="seg" role="tablist" aria-label="Time range">
              <button type="button" class="seg-btn${range === "day" ? " active" : ""}" data-matrix-range="day">Today</button>
              <button type="button" class="seg-btn${range === "week" ? " active" : ""}" data-matrix-range="week">This week</button>
            </div>
          </div>
        </div>
        <div class="matrix-table-wrap">
          <div class="matrix-col-headers">
            <div class="mch-cell mch-user">Family Member</div>
            ${MATRIX_METRICS.map((m) => `<div class="mch-cell">${m.emoji} ${esc(m.label)}</div>`).join("")}
          </div>
          <div class="matrix-rows-list">
            ${sortedUsers.map((u) => userRowHTML(u, range)).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function setupMatrixEvents() {
    document.querySelectorAll("[data-matrix-range]").forEach((b) => {
      b.addEventListener("click", () => {
        state.vizRange = b.dataset.matrixRange;
        localStorage.setItem("sugar_viz_range", state.vizRange);
        renderMatrixOnly();
      });
    });
    document.querySelectorAll(".mur-user-col").forEach((col) => {
      col.addEventListener("click", () => {
        const row = col.closest(".matrix-user-row");
        const clickedUser = row && row.dataset.user;
        if (!clickedUser || clickedUser === state.user) return;
        if (window.confirm(`Switch to logging as ${cap(clickedUser)} on this device?`)) {
          login(clickedUser);
        }
      });
    });
    document.querySelectorAll(".matrix-user-row .metric-card").forEach((t) => {
      const open = (e) => {
        e.stopPropagation();
        const row = t.closest(".matrix-user-row");
        const user = t.dataset.user || (row && row.dataset.user) || state.user;
        const metric = t.dataset.metric;
        const label = t.dataset.label;
        const color = t.dataset.color;
        const unit = t.dataset.unit;
        const val = t.dataset.value;
        const tgt = t.dataset.target;
        const range = state.vizRange === "week" ? "week" : "day";
        openBreakdownModal({ user, metric, label, color, unit, val, tgt, range });
      };
      t.addEventListener("click", open);
      t.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(e);
        }
      });
    });
  }

  function renderMatrixOnly() {
    const y = window.scrollY;
    const card = document.querySelector(".matrix-card");
    if (!card) {
      renderTrack();
      return;
    }
    const wrap = document.createElement("div");
    wrap.innerHTML = familyMatrixHTML().trim();
    const next = wrap.firstElementChild;
    if (next) card.replaceWith(next);
    setupMatrixEvents();
    app.querySelectorAll(".ring-clickable").forEach((t) => {
      const open = () => openAdjustPopover(t);
      t.addEventListener("click", open);
      t.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  function summaryRows() {
    const me0 = state.me || { today_total: 0, today_added_total: 0, today_carbs: 0, today_protein: 0, today_calories: 0, today_caffeine: 0, today_ounces: 0 };
    return METRICS.map((m) => {
      const value = num(m.today(me0));
      const target = targetFor(m.k);
      return { ...m, value, target, ratio: target ? value / target : 0, user: state.user };
    });
  }

  // ── Track view ─────────────────────────────────────────────
  function renderTrack(opts = {}) {
    const y = window.scrollY;
    const me = state.me || { user: state.user, today_total: 0, today_added_total: 0, all_time_total: 0, entries: [], week_entries: [] };
    const todayEntries = me.entries || [];
    const weekEntries = me.week_entries || [];
    const mainTab = state.mainTab || "log";
    const logRange = state.logRange || "day";
    const activeEntries = logRange === "week" ? weekEntries : todayEntries;

    document.getElementById("view").innerHTML = `
      ${onboardingBanner()}

      <div class="main-tabs-bar">
        <div class="main-tabs-seg" role="tablist" aria-label="Main navigation tabs">
          <button type="button" class="main-tab-btn ${mainTab === "log" ? "active" : ""}" data-main-tab="log">
            📝 My Log & Entries
          </button>
          <button type="button" class="main-tab-btn ${mainTab === "matrix" ? "active" : ""}" data-main-tab="matrix">
            📊 Metrics
          </button>
        </div>
      </div>

      ${mainTab === "log" ? `
        <div class="tab-pane">
          <section class="card">
            <div class="log-head-group">
              <div>
                <h2>🍩 Add Food or Drink for ${esc(cap(me.user))}</h2>
                <p class="section-hint" style="margin: 2px 0 0;">Tip: log whole meals at once — "chicken burrito and a sprite" parses both automatically.</p>
              </div>
              <div class="seg" role="tablist" aria-label="Log time range">
                <button type="button" class="seg-btn${logRange === "day" ? " active" : ""}" data-log-range="day">Today</button>
                <button type="button" class="seg-btn${logRange === "week" ? " active" : ""}" data-log-range="week">This week</button>
              </div>
            </div>

            <div class="search-shell">
              <div class="search-row">
                <input class="search-input" id="food-query" placeholder="e.g. 1/2 banana, 2 waters, 2 tbsp peanut butter…" autocomplete="off" />
                <button type="button" class="btn btn-scan ${state.qrActive ? "on" : ""}" id="scan-btn" title="Scan barcode / QR"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><rect x="7" y="7" width="3.4" height="3.4" rx="0.6" fill="currentColor" stroke="none"/><rect x="13.6" y="7" width="3.4" height="3.4" rx="0.6" fill="currentColor" stroke="none"/><rect x="7" y="13.6" width="3.4" height="3.4" rx="0.6" fill="currentColor" stroke="none"/><path d="M13.6 13.6h1.7v1.7h-1.7z" fill="currentColor" stroke="none"/><path d="M15.3 15.3h1.7v1.7h-1.7z" fill="currentColor" stroke="none"/></svg></button>
                <button type="button" class="btn btn-primary" id="add-btn">+ Add</button>
              </div>
              <div class="quick-qty-bar">
                <button type="button" class="quick-qty-chip" data-insert="1/2 ">½ Half</button>
                <button type="button" class="quick-qty-chip" data-insert="1.5 ">1.5×</button>
                <button type="button" class="quick-qty-chip" data-insert="2 ">2× Double</button>
                <button type="button" class="quick-qty-chip" data-insert="1 tbsp ">1 tbsp</button>
                <button type="button" class="quick-qty-chip" data-insert="2 tbsp ">2 tbsp</button>
                <button type="button" class="quick-qty-chip" data-insert="1 tsp ">1 tsp</button>
                <button type="button" class="quick-qty-chip" data-insert="8 oz ">8 oz</button>
                <button type="button" class="quick-qty-chip" data-insert="1 cup ">1 cup</button>
              </div>
              <div class="autofill hidden" id="autofill"></div>
            </div>
            <div id="scanner-wrap" class="scanner-wrap hidden"></div>
            <div class="estimate-copy hidden" id="estimate-copy"></div>
          </section>

          <section class="card">
            <div class="log-head-group">
              <h2>📅 ${logRange === "week" ? "This Week’s Entries" : "Today’s Entries"} · ${esc(cap(me.user))} (${activeEntries.length})</h2>
            </div>
            <ul class="entry-list" id="entry-list">
              ${
                activeEntries.length
                  ? activeEntries.map(entryHTML).join("")
                  : `<li class="entry-item"><div class="empty-state" style="width:100%"><span class="big">🌱</span>Nothing logged ${logRange === "week" ? "this week" : "today"} yet — add your first item above</div></li>`
              }
            </ul>
          </section>
        </div>
      ` : `
        <div class="tab-pane">
          ${familyMatrixHTML()}

          ${state.weekOffset > 0 ? `
          <section class="card week-card">
            <div class="week-card-head">
              <h2>📅 Past Week Breakdown</h2>
              ${weekStrip()}
            </div>
            ${weekArchive()}
          </section>` : ""}
        </div>
      `}

      ${feedbackDock()}
    `;

    document.getElementById("ab-switch").addEventListener("click", renderUserPicker);

    // Tab switching
    document.querySelectorAll("[data-main-tab]").forEach((b) => {
      b.addEventListener("click", () => {
        state.mainTab = b.dataset.mainTab;
        localStorage.setItem("sugar_main_tab", state.mainTab);
        renderTrack();
      });
    });

    document.querySelectorAll("[data-log-range]").forEach((b) => {
      b.addEventListener("click", () => {
        state.logRange = b.dataset.logRange;
        localStorage.setItem("sugar_log_range", state.logRange);
        renderTrack();
      });
    });

    if (mainTab === "matrix") {
      setupMatrixEvents();
      app.querySelectorAll(".ring-clickable").forEach((t) => {
        const open = () => openAdjustPopover(t);
        t.addEventListener("click", open);
        t.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      });
      const wPrev = document.getElementById("week-prev");
      const wNext = document.getElementById("week-next");
      const wCur = document.getElementById("week-current");
      if (wPrev) wPrev.addEventListener("click", async () => { await loadWeek(state.weekOffset + 1); renderTrack(); });
      if (wNext) wNext.addEventListener("click", async () => { await loadWeek(state.weekOffset - 1); renderTrack(); });
      if (wCur) wCur.addEventListener("click", async () => { await loadWeek(0); renderTrack(); });
    }

    if (mainTab === "log") {
      const qInput = document.getElementById("food-query");
      if (qInput) {
        qInput.value = state.pendingQuery;
        qInput.addEventListener("input", () => onQueryInput(qInput.value));
        qInput.addEventListener("keydown", (e) => onQueryKeydown(e, qInput.value));
      }
      app.querySelectorAll(".quick-qty-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const ins = chip.dataset.insert || "";
          if (qInput) {
            const cur = qInput.value.trim();
            if (/^(\d+(\.\d+)?|\d+\/\d+)\s*(tbsp|tsp|cups?|oz|bottles?|cans?|slices?|scoops?|g|ml)?\s*/i.test(cur)) {
              qInput.value = cur.replace(/^(\d+(\.\d+)?|\d+\/\d+)\s*(tbsp|tsp|cups?|oz|bottles?|cans?|slices?|scoops?|g|ml)?\s*/i, ins);
            } else {
              qInput.value = ins + cur;
            }
            qInput.focus();
            onQueryInput(qInput.value);
          }
        });
      });
      const addBtn = document.getElementById("add-btn");
      if (addBtn && qInput) addBtn.addEventListener("click", () => onAdd(qInput.value));
      const scanBtn = document.getElementById("scan-btn");
      if (scanBtn) scanBtn.addEventListener("click", toggleScanner);
      setupEntryDeletes();
      if (state.pendingQuery) renderAutofill(state.pendingQuery);
    }

    setupFeedback();
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekLabel = (ws, we) => {
    const s = new Date(ws + "T00:00:00"), e = new Date(we + "T00:00:00");
    const mo = (d) => d.toLocaleString(undefined, { month: "short" });
    return `${mo(s)} ${s.getDate()} – ${mo(e)} ${e.getDate()}`;
  };

  function weekStrip() {
    const weeks = state.weeksList || [];
    const wd = state.weekData;
    const canPrev = state.weekOffset < weeks.length - 1;
    const canNext = state.weekOffset > 0;
    const cur = wd
      ? `<span class="week-strip-label">${state.weekOffset === 0 ? "This week · " : ""}${weekLabel(wd.week_start, wd.week_end)}${state.weekOffset > 0 ? ` · Wk ${weeks.length - state.weekOffset}` : ""}</span>`
      : `<span class="week-strip-label">…</span>`;
    return `
      <div class="week-strip">
        <button class="week-nav" id="week-prev" ${canPrev ? "" : "disabled"} title="Older week">←</button>
        ${cur}
        <button class="week-nav" id="week-next" ${canNext ? "" : "disabled"} title="Newer week">→</button>
        ${state.weekOffset > 0 ? `<button class="week-nav week-jump" id="week-current" title="Jump to current week">Today</button>` : ""}
      </div>`;
  }

  function currentWeekBanner() {
    const lb = state.leaderboard || {};
    const lead = (lb.active || []).find((a) => a.rank === 1) || (lb.active || [])[0];
    if (!lead) return "";
    const uIdx = USERS.indexOf(lead.name);
    return `
      <div class="week-banner live lead-banner">
        <span class="lead-trophy">🏆</span>
        <span class="rank-avatar ${avatarFor(uIdx)}">${esc((lead.name[0] || "?").toUpperCase())}</span>
        <div class="lead-copy">
          <div class="lead-kicker">1st place this week</div>
          <div class="lead-name">${esc(cap(lead.name))}</div>
        </div>
        <div class="lead-stat">${fmt(lead.week_sugar)}g<span>week total</span></div>
      </div>`;
  }

  function weekArchive() {
    const wd = state.weekData;
    if (!wd || !wd.users) return `<div class="empty-state"><span class="big">📦</span>No data for this week</div>`;
    const today = wd.today;
    const banner = wd.complete
      ? (wd.winner
          ? `<div class="week-banner winner">🏆 Winner: <strong>${esc(cap(wd.winner.name))}</strong> · ${fmt(wd.winner.total)}g sugar over ${wd.winner.days_logged} logged day${wd.winner.days_logged === 1 ? "" : "s"}</div>`
          : `<div class="week-banner none">No entries logged this week — no winner</div>`)
      : currentWeekBanner();
    const head = `<div class="warc-row warc-head">
        <span class="warc-name"></span>
        ${wd.dates.map((d, i) => `<span class="warc-day ${d === today ? "today" : ""}">${DOW[i]}<small>${d.slice(8)}</small></span>`).join("")}
        <span class="warc-total">Total</span>
      </div>`;
    const rows = wd.users.map((u, ri) => {
      const uIdx = USERS.indexOf(u.name);
      const tgt = LIMITS.sugar;
      const isWinnerRow = wd.winner && wd.winner.name === u.name;
      const cells = wd.dates.map((d, i) => {
        const v = num(u.days[i]);
        const future = d > today;
        const ratio = v / tgt;
        const tone = v === 0 ? "" : ratio < 0.6 ? "good" : ratio <= 1 ? "warn" : "over";
        return `<span class="warc-cell ${tone} ${future ? "future" : ""}">${future ? "·" : fmt(v)}</span>`;
      }).join("");
      return `<div class="warc-row ${isWinnerRow ? "winner-row" : ""}">
        <span class="warc-name">
          <span class="rank-avatar ${avatarFor(uIdx)}">${esc(u.name[0] || "?").toUpperCase()}</span>
          ${esc(cap(u.name))}${isWinnerRow ? ' <span class="warc-crown">🏆</span>' : ""}
        </span>
        ${cells}
        <span class="warc-total ${u.days_logged ? "" : "none"}">${u.days_logged ? fmt(u.total) + "g" : "—"}</span>
      </div>`;
    }).join("");
    return `${banner}<div class="warc">${head}${rows}</div>`;
  }

  function familyRanking() {
    const lb = state.leaderboard || {};
    const act = lb.active || [];
    const activeUser = state.user;
    const inactive = lb.inactive || [];

    // Merge active + inactive, sorted: active by rank (smoothed per-entry avg, asc), inactive alpha
    const all = [
      ...act,
      ...inactive.map((n) => ({ name: n, rank: "-", day_sugar: 0, week_sugar: 0, entry_count: 0, day_entries: 0, week_entries: 0, day_avg: 0, week_avg: 0, is_me: false })),
    ];

    return `
      <div class="ranking-list">
        ${all.map((a) => {
          const isMe = a.name === activeUser;
          const tgt = LIMITS.sugar;
          const dayVal = num(a.day_sugar || 0), weekVal = num(a.week_sugar || 0);
          // Week target prorates by days elapsed this calendar week (Mon=1..Sun=7).
          const daysThisWeek = new Date().getDay() === 0 ? 7 : new Date().getDay();
          const weekTgt = tgt * daysThisWeek;
          const dayRatio = dayVal / tgt, weekRatio = weekVal / weekTgt;
          const medal = (a.rank >= 1 && a.rank <= 3 ? ["🥇","🥈","🥉"][a.rank - 1] : "");
          const uIdx = USERS.indexOf(a.name);
          const hasEntries = dayVal > 0 || weekVal > 0 || a.entry_count > 0;
          return `
            <div class="rank-row ${isMe ? "active-user" : ""} ${!hasEntries ? "inactive" : ""}" data-user="${a.name}" title="Click to log entries for ${esc(cap(a.name))}">
              <span class="rank-pos">${medal || a.rank}</span>
              <span class="rank-avatar ${avatarFor(uIdx)}">${esc(a.name[0] || "?").toUpperCase()}</span>
              <div class="rank-name-col">
                <span class="rank-name">${esc(cap(a.name))}${isMe ? ' <span class="active-badge">⚡ active</span>' : ""}</span>
              </div>
              <div class="rank-bars">
                <div class="rank-bar-wrap">
                  <div class="rank-bar-label">today</div>
                  <div class="rank-bar-track">
                    <div class="rank-bar-fill" style="width:${Math.round(clamp(dayRatio, 0, 1) * 100)}%"></div>
                    <div class="rank-bar-thresh" style="left:${Math.round(clamp(1, 0, 1) * 100)}%"></div>
                  </div>
                  <div class="rank-bar-val">${fmt(dayVal)}/${fmt(tgt)}g</div>
                  <div class="rank-bar-meta">${a.day_entries ? `${fmt(num(a.day_avg || 0))}g avg · ${a.day_entries} ${a.day_entries === 1 ? "entry" : "entries"}` : "no entries"}</div>
                </div>
                <div class="rank-bar-wrap">
                  <div class="rank-bar-label">this week</div>
                  <div class="rank-bar-track">
                    <div class="rank-bar-fill" style="width:${Math.round(clamp(weekRatio, 0, 1) * 100)}%"></div>
                    <div class="rank-bar-thresh" style="left:100%"></div>
                  </div>
                  <div class="rank-bar-val">${fmt(weekVal)}/${fmt(weekTgt)}g</div>
                  <div class="rank-bar-meta">${a.week_entries ? `${fmt(num(a.week_avg || 0))}g avg · ${a.week_entries} ${a.week_entries === 1 ? "entry" : "entries"}` : "no entries"}</div>
                </div>
              </div>
            </div>`;
        }).join("")}
      </div>`;
  }

  function entryMetricBoxHTML(entryId, key, label, emoji, val, unit, color) {
    const numVal = num(val);
    return `
      <div class="entry-metric-box" data-entry-id="${entryId}" data-metric="${key}" data-val="${numVal}" data-unit="${unit}" title="Click to edit ${label}">
        <span class="emb-label"><span class="emb-emoji">${emoji}</span> ${label}</span>
        <span class="emb-val-wrap">
          <span class="emb-val" style="color:${color}">${fmt(numVal)}</span><span class="emb-unit">${unit}</span>
        </span>
      </div>`;
  }

  function extractEntryQty(servingStr) {
    const s = String(servingStr || "");
    const m = s.match(/^(\d+(?:\.\d+)?)\s*[×x]\s*/i);
    if (m) {
      const q = parseFloat(m[1]);
      if (!isNaN(q) && q > 0) return q;
    }
    const m2 = s.match(/^(\d+(?:\.\d+)?)\s+(?:bottles?|cans?|cups?|glasses?|slices?|scoops?|eggs?|bananas?|apples?|items?|servings?|tbsp|tsp|oz)\b/i);
    if (m2) {
      const q = parseFloat(m2[1]);
      if (!isNaN(q) && q > 0) return q;
    }
    return 1;
  }

  function entryHTML(e) {
    const sVal = num(e.sugar_grams);
    const addedVal = e.added_sugar_grams != null ? num(e.added_sugar_grams) : sVal;
    const carbsVal = num(e.carbs_grams || sVal);
    const protVal = num(e.protein_grams);
    const calVal = num(e.calories_kcal);
    const caffVal = num(e.caffeine_mg);
    const ozVal = num(e.ounces);
    const qtyVal = extractEntryQty(e.serving);

    return `
      <li class="entry-item" data-entry="${e.id}" data-food="${esc(e.food_item)}"
          data-sugar="${sVal}" data-added="${addedVal}" data-carbs="${carbsVal}"
          data-protein="${protVal}" data-calories="${calVal}" data-caffeine="${caffVal}"
          data-ounces="${ozVal}" data-qty="${qtyVal}" data-serving="${esc(e.serving || "")}">
        <div class="entry-head-row">
          <span class="entry-emoji">${foodEmoji(e)}</span>
          <div class="entry-main">
            <div class="entry-title-line">
              <span class="entry-name">${esc(e.food_item)}</span>
              <div class="entry-qty-stepper" data-entry-id="${e.id}" data-qty="${qtyVal}">
                <button type="button" class="eq-btn eq-minus" data-action="minus" title="Decrease portion / quantity">−</button>
                <span class="eq-val" data-action="edit" title="Click to edit quantity or measurement multiplier">${qtyVal === 0.5 ? '½' : (qtyVal % 1 === 0 ? qtyVal : fmt(qtyVal))}×</span>
                <button type="button" class="eq-btn eq-plus" data-action="plus" title="Increase portion / quantity">+</button>
              </div>
            </div>
            <div class="entry-sub-line">
              <span class="entry-sub entry-sub-clickable" data-entry-id="${e.id}" title="Click to edit portion / measurement">${e.serving ? esc(e.serving) : ""}${e.source ? ` · ${esc(e.source)}` : ""}</span>
            </div>
          </div>
          <button class="entry-del" data-del="${e.id}" title="Delete entry">🗑</button>
        </div>
        <div class="entry-metric-boxes">
          ${entryMetricBoxHTML(e.id, "added_sugar_grams", "Added Sugar", "🩸", addedVal, "g", "#fb7185")}
          ${entryMetricBoxHTML(e.id, "carbs_grams", "Carbs", "🍞", carbsVal, "g", "#38bdf8")}
          ${entryMetricBoxHTML(e.id, "protein_grams", "Protein", "💪", protVal, "g", "#fbbf24")}
          ${entryMetricBoxHTML(e.id, "caffeine_mg", "Caffeine", "⚡", caffVal, "mg", "#a78bfa")}
          ${entryMetricBoxHTML(e.id, "ounces", "Ounces", "💧", ozVal, "oz", "#2dd4bf")}
          ${entryMetricBoxHTML(e.id, "calories_kcal", "Calories", "🔥", calVal, "kcal", "#60a5fa")}
        </div>
      </li>`;
  }

  function setupEntryDeletes() {
    app.querySelectorAll(".entry-del").forEach((b) =>
      b.addEventListener("click", async () => {
        const li = b.closest(".entry-item");
        if (li) li.style.opacity = "0.4";
        try {
          await api("/api/entries/" + b.dataset.del, { method: "DELETE" });
          toast("Entry removed 🗑");
          if (li) li.remove();
          await refreshAll();
        } catch (e) { toast(e.message, true); if (li) li.style.opacity = "1"; }
      })
    );
    setupEntryMetricBoxes();
    setupEntryQuantitySteppers();
  }

  function setupEntryQuantitySteppers() {
    app.querySelectorAll(".entry-qty-stepper").forEach((stepper) => {
      const entryId = stepper.dataset.entryId;
      const curQty = parseFloat(stepper.dataset.qty) || 1;

      stepper.querySelector(".eq-minus")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        let nextQty = curQty;
        if (curQty <= 0.5) nextQty = 0.25;
        else if (curQty <= 1.0) nextQty = 0.5;
        else if (curQty <= 2.0) nextQty = curQty - 0.5;
        else nextQty = Math.max(1, Math.round((curQty - 1) * 2) / 2);
        await updateEntryQuantity(entryId, nextQty);
      });

      stepper.querySelector(".eq-plus")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        let nextQty = curQty;
        if (curQty < 0.5) nextQty = 0.5;
        else if (curQty < 1.0) nextQty = 1.0;
        else if (curQty < 2.0) nextQty = curQty + 0.5;
        else nextQty = Math.round((curQty + 1) * 2) / 2;
        await updateEntryQuantity(entryId, nextQty);
      });

      stepper.querySelector(".eq-val")?.addEventListener("click", (e) => {
        e.stopPropagation();
        openQuantityPrompt(entryId, curQty);
      });
    });

    app.querySelectorAll(".entry-sub-clickable").forEach((elSub) => {
      elSub.addEventListener("click", (e) => {
        e.stopPropagation();
        const entryId = elSub.dataset.entryId;
        const li = elSub.closest(".entry-item");
        const curQty = parseFloat(li?.dataset.qty) || 1;
        openQuantityPrompt(entryId, curQty, li?.dataset.serving);
      });
    });
  }

  async function updateEntryQuantity(entryId, newQty) {
    try {
      await api("/api/entries/" + entryId, { method: "PATCH", body: { quantity: newQty } });
      toast(`Updated portion to ${newQty === 0.5 ? '½' : newQty}× ✓`);
      await refreshAll();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function openQuantityPrompt(entryId, currentQty, currentServing) {
    const raw = prompt(`Enter portion multiplier (e.g. 0.5, 1, 1.5, 2, 3) or measurement:`, currentQty);
    if (raw === null) return;
    const val = parseFloat(raw);
    if (!isNaN(val) && val > 0 && val <= 50) {
      updateEntryQuantity(entryId, val);
    } else if (raw.trim()) {
      api("/api/entries/" + entryId, { method: "PATCH", body: { food_item: raw.trim() } })
        .then(() => { toast("Reparsed with AI ✓"); refreshAll(); })
        .catch((e) => toast(e.message, true));
    }
  }

  function setupEntryMetricBoxes() {
    app.querySelectorAll(".entry-metric-box").forEach((box) => {
      box.addEventListener("click", (ev) => {
        if (box.querySelector("input")) return;
        ev.stopPropagation();

        const entryId = box.dataset.entryId;
        const metricKey = box.dataset.metric;
        const currentVal = box.dataset.val;
        const unit = box.dataset.unit;
        const originalHTML = box.innerHTML;

        box.classList.add("is-editing-box");
        box.innerHTML = `
          <form class="emb-inline-form">
            <input type="number" step="${metricKey === 'calories_kcal' || metricKey === 'caffeine_mg' ? '1' : '0.1'}"
                   min="0" class="emb-inline-input" value="${currentVal}" />
            <button type="submit" class="emb-inline-save" title="Save">✓</button>
          </form>
        `;

        const input = box.querySelector(".emb-inline-input");
        input.focus();
        input.select();

        let saved = false;
        const commitSave = async () => {
          if (saved) return;
          saved = true;
          const newVal = parseFloat(input.value);
          if (isNaN(newVal) || newVal < 0) {
            box.classList.remove("is-editing-box");
            box.innerHTML = originalHTML;
            return;
          }
          box.dataset.val = newVal;
          box.classList.remove("is-editing-box");
          const valEl = box.querySelector(".emb-val");
          if (valEl) valEl.textContent = fmt(newVal);

          try {
            const patchBody = {};
            patchBody[metricKey] = newVal;
            if (metricKey === "added_sugar_grams") {
              const li = box.closest(".entry-item");
              const curTotalSugar = parseFloat(li ? li.dataset.sugar : newVal);
              if (newVal > curTotalSugar) patchBody["sugar_grams"] = newVal;
            }
            await api("/api/entries/" + entryId, { method: "PATCH", body: patchBody });
            toast("Updated " + fmt(newVal) + unit + " ✓");
            await refreshAll();
          } catch (err) {
            toast(err.message, true);
            await refreshAll();
          }
        };

        const form = box.querySelector(".emb-inline-form");
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          commitSave();
        });

        input.addEventListener("blur", () => {
          setTimeout(() => { if (!saved) commitSave(); }, 160);
        });

        input.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            saved = true;
            box.classList.remove("is-editing-box");
            box.innerHTML = originalHTML;
          }
        });
      });
    });
  }

  function feedbackWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso.includes("T") || iso.includes("Z") ? iso : iso.replace(" ", "T") + "Z");
    if (Number.isNaN(d.getTime())) return iso;
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function feedbackDock() {
    const items = state.feedback || [];
    const list = items.length
      ? items.map((it) => `
          <li class="fb-item">
            <span class="fb-kind ${it.kind === "bug" ? "bug" : "feature"}">${it.kind === "bug" ? "🐛 Bug" : "✨ Feature"}</span>
            <p class="fb-body">${esc(it.body)}</p>
            <div class="fb-meta">${esc(cap(it.user))} · ${esc(feedbackWhen(it.created_at))}</div>
          </li>`).join("")
      : `<li class="fb-empty">Nothing yet — first one to drop a note?</li>`;
    const open = state.fbOpen ? " open" : "";
    return `
      <div class="fb-dock">
        <div class="fb-panel${open}" id="fb-panel" role="dialog" aria-label="Bug and idea board" ${state.fbOpen ? "" : "hidden"}>
          <div class="fb-panel-head">
            <h2>Board · bugs &amp; ideas</h2>
            <button type="button" class="fb-close" id="fb-close" aria-label="Close">×</button>
          </div>
          <p class="section-hint">Visible to everyone.</p>
          <form class="fb-form" id="fb-form">
            <div class="fb-kinds" role="group" aria-label="Type">
              <label class="fb-kind-pick"><input type="radio" name="fb-kind" value="bug" checked /> 🐛 Bug</label>
              <label class="fb-kind-pick"><input type="radio" name="fb-kind" value="feature" /> ✨ Feature</label>
            </div>
            <textarea id="fb-body" class="fb-input" maxlength="800" rows="3" placeholder="What’s broken, or what would you like?" required></textarea>
            <button class="btn btn-primary" type="submit" id="fb-submit">Post to board</button>
          </form>
          <ul class="fb-list" id="fb-list">${list}</ul>
        </div>
        <button type="button" class="fb-fab" id="fb-fab" aria-label="Open bug board" aria-expanded="${state.fbOpen ? "true" : "false"}" title="Bugs &amp; ideas">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 9V7a4 4 0 0 1 8 0v2"/>
            <rect x="6.5" y="9" width="11" height="10" rx="4"/>
            <path d="M12 13v3M8 12H5.5M18.5 12H16M7 18.5 5 21M17 18.5 19 21M7 10.5 4.5 8M17 10.5 19.5 8"/>
          </svg>
        </button>
      </div>`;
  }

  function setFeedbackOpen(on) {
    state.fbOpen = !!on;
    const panel = document.getElementById("fb-panel");
    const fab = document.getElementById("fb-fab");
    if (panel) {
      panel.classList.toggle("open", state.fbOpen);
      if (state.fbOpen) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    }
    if (fab) fab.setAttribute("aria-expanded", state.fbOpen ? "true" : "false");
  }

  function setupFeedback() {
    const fab = document.getElementById("fb-fab");
    const close = document.getElementById("fb-close");
    if (fab) fab.addEventListener("click", () => setFeedbackOpen(!state.fbOpen));
    if (close) close.addEventListener("click", () => setFeedbackOpen(false));
    const form = document.getElementById("fb-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = (document.getElementById("fb-body") || {}).value || "";
      const kindEl = form.querySelector('input[name="fb-kind"]:checked');
      const kind = (kindEl && kindEl.value) || "bug";
      const btn = document.getElementById("fb-submit");
      if (btn) btn.disabled = true;
      try {
        const res = await api("/api/feedback", { method: "POST", body: { kind, body } });
        if (res.item) state.feedback = [res.item, ...(state.feedback || [])];
        toast("Posted to the board");
        state.fbOpen = true;
        renderTrack();
      } catch (err) {
        toast(err.message, true);
        if (btn) btn.disabled = false;
      }
    });
  }

  async function refreshAll() {
    try {
      const [me, lb, wl, fb, ch] = await Promise.all([
        api("/api/me"),
        api("/api/leaderboard"),
        api("/api/weeks/list").catch(() => ({ weeks: state.weeksList || [] })),
        api("/api/feedback").catch(() => ({ items: state.feedback || [] })),
        api("/api/leaderboard/chart").catch(() => state.chart),
      ]);
      state.feedback = fb.items || [];
      state.chart = ch;
      state.me = me;
      state.leaderboard = lb;
      state.weeksList = wl.weeks || [];
      await loadWeek(state.weekOffset);
      sugarSand.syncTotal(me ? (me.today_added_total ?? me.today_total ?? 0) : 0, { bake: false });
      renderTrack();
    } catch (e) {
      toast(e.message, true);
    }
  }

// ── Autofill (AI-only, instant) ──────────────────────────────────────────────
  function onQueryInput(value) {
    state.pendingQuery = value;
    if (!value.trim()) {
      hideAutofill();
      return;
    }
    // Instant — synchronous, zero network wait
    renderAutofill(value);
  }

  function renderAutofill(query) {
    const box = document.getElementById("autofill");
    if (!box) return;
    const q = (query || "").trim();
    if (!q) { hideAutofill(); return; }
    const existing = box.querySelector(".autofill-custom .f-name");
    if (existing && !box.classList.contains("hidden")) {
      existing.textContent = `✨ Add "${q}" with AI`;
      return;
    }
    box.innerHTML = customRowHTML(q);
    box.classList.remove("hidden");
    state.autofillOpen = true;
    bindCustomRow(box);
  }

  function customRowHTML(query) {
    const q = (query || "").trim();
    return `
      <div class="autofill-item autofill-custom" data-custom="1">
        <div>
          <div class="f-name">✨ Add "${esc(q)}" with AI</div>
          <div class="f-meta"><span class="f-cat">AI splits multi-items &amp; estimates carbs, sugar, protein, calories</span></div>
        </div>
        <span class="autofill-custom-chip">AI</span>
      </div>`;
  }

  function bindCustomRow(box) {
    const row = box.querySelector(".autofill-custom");
    if (row) row.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.getElementById("food-query");
      const text = ((input && input.value) || "").trim();
      if (!text) { toast("Type a food or drink first", true); return; }
      hideAutofill();
      onAdd(text);
    });
  }

  function hideAutofill() {
    const box = document.getElementById("autofill");
    if (box) box.classList.add("hidden");
    state.autofillOpen = false;
  }

  function onQueryKeydown(ev, value) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      hideAutofill();
      onAdd(value);
    } else if (ev.key === "Escape") {
      hideAutofill();
    }
  }

  function onDocClick(ev) {
    if (!ev.target.closest(".search-shell")) hideAutofill();
  }

  // ── Add flow (always AI) ──────────────────────────────────
  async function onAdd(rawName) {
    const name = (rawName || "").trim();
    if (!name) { toast("Type a food or drink name first", true); return; }
    const addBtn = document.getElementById("add-btn");
    const copy = document.getElementById("estimate-copy");
    addBtn.disabled = true;

    copy.innerHTML = "";
    copy.classList.remove("hidden");

    const spin = el("span", "spinner");
    copy.appendChild(spin);
    copy.appendChild(document.createTextNode(" Parsing with AI…"));

    const payload = { food_item: name };
    if (copy.querySelector(".estimate-tag")) copy.querySelector(".estimate-tag").remove();

    try {
      const res = await api("/api/entries", { method: "POST", body: payload });
      copy.innerHTML = "";
      const clearInput = () => { state.q = ""; state.pendingQuery = ""; state.matches = []; hideAutofill();
        const qInput = document.getElementById("food-query"); if (qInput) qInput.value = "";
      };
      if (res.entry_count > 1 && res.entries) {
        copy.textContent = `✅ Logged ${res.entry_count} items: ` + res.entries.map((e2) => {
          const a = e2.added_sugar_grams != null ? num(e2.added_sugar_grams) : num(e2.sugar_grams);
          return `${e2.emoji || ""} ${e2.food_item} (+${fmt(a)}g added)`.trim();
        }).join(", ");
        toast(`Logged ${res.entry_count} items ✓`);
        sugarSand.pour(res.entries.reduce((s, e2) => s + (e2.added_sugar_grams != null ? num(e2.added_sugar_grams) : num(e2.sugar_grams)), 0));
        clearInput();
        await refreshAll();
        return;
      }
      const addedG = res.added_sugar_grams != null ? num(res.added_sugar_grams) : num(res.sugar_grams);
      const totalG = num(res.sugar_grams);
      const nutr = nutrientLine(res);
      if (addedG > 0) {
        copy.textContent = `✅ ${res.emoji || ""} ${res.food_item} · +${fmt(addedG)}g added sugar${nutr ? " · " + nutr : ""} (${res.source || "llm"})`.replace(/\s+/g, " ").trim();
        toast(`Logged +${fmt(addedG)}g added sugar · ${res.food_item}`);
      } else {
        const natStr = totalG > 0 ? ` (${fmt(totalG)}g natural)` : "";
        copy.textContent = `✅ ${res.emoji || ""} ${res.food_item} · 0g added sugar${natStr}${nutr ? " · " + nutr : ""} (${res.source || "llm"})`.replace(/\s+/g, " ").trim();
        toast(`Logged 0g added sugar · ${res.food_item}`);
      }
      sugarSand.pour(addedG);
      clearInput();
      await refreshAll();
      setTimeout(() => copy.classList.add("hidden"), 3500);
    } catch (e) {
      copy.classList.add("hidden");
      toast(e.message, true);
    } finally {
      addBtn.disabled = false;
    }
  }
// ── QR scanning ────────────────────────────────────────────
  async function toggleScanner() {
    if (state.qrActive) {
      stopScanner();
      renderApp();
      return;
    }
    const wrap = document.getElementById("scanner-wrap");
    const btn = document.getElementById("scan-btn");
    if (!wrap) return;
    wrap.innerHTML = "";
    wrap.classList.remove("hidden");

    const frame = el("div", "scanner-frame");
    frame.id = "qr-reader";
    frame.textContent = "Initializing camera…";
    const stopBtn = el("button", "btn btn-ghost scanner-stop", "✕ Stop scanning");
    stopBtn.addEventListener("click", stopScanner);
    wrap.appendChild(frame);
    wrap.appendChild(stopBtn);

    if (typeof Html5Qrcode === "undefined") {
      frame.textContent = "QR scanner library failed to load — check the CDN link.";
      return;
    }

    const qr = new Html5Qrcode("qr-reader");
    state.qrScanner = qr;
    state.qrActive = true;
    if (btn) btn.classList.add("on");
    btn.textContent = "✕";

    try {
      await qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => onQrDecoded(decoded, qr),
        () => {}
      );
    } catch (err) {
      frame.textContent = "Could not start camera: " + (err.message || err);
      state.qrActive = false;
      state.qrScanner = null;
      if (btn) { btn.classList.remove("on"); setScanIcon(btn); }
    }
  }

  function setScanIcon(btn) {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><rect x="7" y="7" width="3.4" height="3.4" rx="0.6" fill="currentColor" stroke="none"/><rect x="13.6" y="7" width="3.4" height="3.4" rx="0.6" fill="currentColor" stroke="none"/><rect x="7" y="13.6" width="3.4" height="3.4" rx="0.6" fill="currentColor" stroke="none"/><path d="M13.6 13.6h1.7v1.7h-1.7z" fill="currentColor" stroke="none"/><path d="M15.3 15.3h1.7v1.7h-1.7z" fill="currentColor" stroke="none"/></svg>';
  }

  function stopScanner() {
    if (state.qrScanner) {
      try { state.qrScanner.stop().then(() => state.qrScanner.clear()).catch(() => {}); } catch (e) { /* noop */ }
      state.qrScanner = null;
    }
    state.qrActive = false;
    const wrap = document.getElementById("scanner-wrap");
    if (wrap) { wrap.innerHTML = ""; wrap.classList.add("hidden"); }
    const btn = document.getElementById("scan-btn");
    if (btn) { btn.classList.remove("on"); setScanIcon(btn); }
  }

  async function onQrDecoded(decodedData, qr) {
    stopScanner();
    // Support plain food names, URLs like https://food.example/can?name=Coca-Cola, etc.
    let name = decodedData;
    try {
      const u = new URL(decodedData);
      name = u.searchParams.get("name") || u.searchParams.get("q") || u.searchParams.get("item")
        || decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || decodedData);
    } catch (e) { /* not a URL — use raw text */ }
    name = decodeURIComponent(String(name)).trim();
    if (!name) { toast("Could not read food name from QR", true); return; }

    // Barcode scans (UPC/EAN digits) must resolve to the real product label
    // via OpenFoodFacts instead of feeding raw digits to the LLM.
    if (/^\d{8,14}$/.test(name)) {
      toast(`Looking up barcode ${name}…`);
      try {
        const rec = await api("/api/barcode/" + encodeURIComponent(name));
        const suggestion = {
          sugar_grams: rec.sugar_grams,
          protein_grams: rec.protein_grams,
          calories_kcal: rec.calories_kcal,
          caffeine_mg: rec.caffeine_mg,
          ounces: rec.ounces,
          serving: rec.serving,
          category: rec.category,
        };
        renderApp();
        const qInput = document.getElementById("food-query");
        if (qInput) { qInput.value = rec.name; state.pendingQuery = rec.name; }
        await onAdd(rec.name);
        if (qInput) qInput.focus({ preventScroll: true });
        return;
      } catch (e) {
        toast(`${e.message || "Barcode not found"} — try typing the product name`, true);
        renderApp();
        const qInput = document.getElementById("food-query");
        if (qInput) qInput.focus({ preventScroll: true });
        return;
      }
    }

    toast(`Scanned: ${name} — auto-adding…`);
    renderApp();
    const qInput = document.getElementById("food-query");
    if (qInput) {
      qInput.value = name;
      state.pendingQuery = name;
    }
    await onAdd(name);
    if (qInput) qInput.focus({ preventScroll: true });
  }

  // ── Leaderboard view ──────────────────────────────────────
  // ── Leaderboard charts (SVG, no library) ──────────────────
  // ── Imperial ↔ metric (backend stores metric) ─────────────
  const KG_PER_LB = 0.45359237, CM_PER_IN = 2.54;
  const kgToLb = (kg) => kg / KG_PER_LB;
  const lbToKg = (lb) => lb * KG_PER_LB;
  const cmToIn = (cm) => cm / CM_PER_IN;
  const inToCm = (inch) => inch * CM_PER_IN;
  const parseHeight = (ft, inch) => {
    const f = num(ft), i = num(inch);
    const totalIn = f * 12 + i;
    return totalIn > 0 ? Math.round(inToCm(totalIn) * 10) / 10 : null;
  };
  const formatHeight = (cm) => {
    if (!cm) return { ft: "", inch: "" };
    let totalIn = cmToIn(num(cm));
    const ft = Math.floor(totalIn / 12);
    const inch = Math.round((totalIn - ft * 12) * 10) / 10;
    return { ft: String(ft), inch: String(inch) };
  };

  // ── Quick metric adjustment popover ───────────────────────
  // Clicking a summary ring opens a small card: drag the slider or type
  // a number to set today's total; Apply creates a signed manual entry
  // for the delta via POST /api/metrics/adjust.
  function closeAdjustPopover() {
    const p = document.getElementById("adjust-pop");
    if (p) p.remove();
  }

  function openAdjustPopover(tile) {
    closeAdjustPopover();
    const { metric, value, target, unit, label, color } = tile.dataset;
    const current = num(value), tgt = num(target);
    const max = Math.max(tgt * 2, current * 1.5, 10);
    const step = metric === "calories" ? 10 : metric === "ounces" ? 1 : 0.5;
    const DRAG_PX = 140; // px of horizontal drag = full scale

    const pop = el("div", "adjust-pop");
    pop.id = "adjust-pop";
    pop.style.setProperty("--pop-color", color);
    pop.innerHTML = `
      <div class="ap-head"><span class="ap-label">Adjust ${esc(label.toLowerCase())}</span><button class="ap-x" title="Close">✕</button></div>
      <div class="ap-value-row">
        <input class="ap-num" type="number" min="0" step="${step}" value="${fmt(current)}" />
        <span class="ap-unit">/ ${fmt(tgt)} ${unit}</span>
      </div>
      <input class="ap-slider" type="range" min="0" max="${Math.round(max)}" step="${step}" value="${fmt(current)}" />
      <div class="ap-hint">delta <span class="ap-delta">+0</span> ${unit} · drag here, slide, or type</div>
      <div class="ap-actions"><button class="btn btn-primary ap-apply">Apply</button></div>`;
    document.body.appendChild(pop);
    const r = tile.getBoundingClientRect();
    const pw = pop.offsetWidth;
    pop.style.left = `${clamp(r.left + r.width / 2 - pw / 2, 8, window.innerWidth - pw - 8)}px`;
    pop.style.top = `${r.bottom + 8 + window.scrollY}px`;

    const numIn = pop.querySelector(".ap-num");
    const slider = pop.querySelector(".ap-slider");
    const deltaEl = pop.querySelector(".ap-delta");
    const sync = (v, fromSlider) => {
      v = Math.max(0, num(v));
      if (!fromSlider) slider.value = Math.min(v, max);
      if (fromSlider) numIn.value = fmt(v);
      const d = v - current;
      deltaEl.textContent = (d >= 0 ? "+" : "") + fmt(d);
      deltaEl.style.color = d > 0 ? "#e11d48" : d < 0 ? "#059669" : "";
    };
    numIn.addEventListener("input", () => sync(num(numIn.value), false));
    slider.addEventListener("input", () => sync(num(slider.value), true));
    numIn.addEventListener("keydown", (e) => { if (e.key === "Enter") pop.querySelector(".ap-apply").click(); });

    // Direct drag on the popover body (no need to grab the slider thumb)
    let drag = null;
    pop.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input,button")) return;
      drag = { x: e.clientX, start: num(numIn.value) };
      pop.setPointerCapture(e.pointerId);
    });
    pop.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const v = drag.start + ((e.clientX - drag.x) / DRAG_PX) * max;
      sync(metric === "calories" || metric === "ounces" ? Math.round(v) : Math.round(v * 2) / 2, false);
    });
    pop.addEventListener("pointerup", () => { drag = null; });

    pop.querySelector(".ap-x").addEventListener("click", closeAdjustPopover);
    pop.querySelector(".ap-apply").addEventListener("click", async () => {
      const v = num(numIn.value);
      try {
        const res = await api("/api/metrics/adjust", { method: "POST", body: { metric, value: v } });
        closeAdjustPopover();
        toast(res.delta === 0 ? "No change" : `${label} ${res.delta > 0 ? "+" : ""}${fmt(res.delta)} ${unit} ✓`);
        await refreshAll();
      } catch (e) { toast(e.message, true); }
    });
    document.addEventListener("pointerdown", function outside(ev) {
      if (!pop.contains(ev.target) && ev.target !== tile) { closeAdjustPopover(); document.removeEventListener("pointerdown", outside); }
    });
  }

  const sugarSand = (() => {
    const COLORS = ["#fff7ed", "#fde68a", "#fbbf24", "#fb7185", "#fda4af", "#f0abfc"];
    const MAX_P = 220;
    const GRAINS_PER_G = 2;
    const FILL_G = 4000;
    const REPOSE = 2.4;
    let canvas, ctx, raf = 0, cols = 0, cw = 4, W = 0, H = 0, heights, dirty = true;
    let px, py, pc, pn = 0, queue = 0, totalG = 0, tick = 0, baked = false;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function hud() {
      const n = document.getElementById("sugar-total-val");
      if (n) n.textContent = `${fmt(totalG)}g`;
    }

    function resize() {
      canvas = document.getElementById("sugar-sand");
      if (!canvas) return;
      const dpr = Math.min(1.25, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(64, Math.min(160, Math.floor(W / 6)));
      const prev = heights;
      heights = new Float32Array(n);
      if (prev && prev.length) {
        for (let i = 0; i < n; i++) heights[i] = prev[(i * prev.length / n) | 0];
      }
      cols = n; cw = W / n;
      if (!px) {
        px = new Float32Array(MAX_P);
        py = new Float32Array(MAX_P);
        pc = new Uint8Array(MAX_P);
      }
      dirty = true;
    }

    function mound(grams) {
      const maxH = H * 0.82;
      const avg = maxH * Math.min(0.92, Math.max(0, grams) / FILL_G);
      for (let i = 0; i < cols; i++) {
        const u = i / Math.max(1, cols - 1);
        const bowl = 0.72 + 0.28 * Math.sin(u * Math.PI);
        const nse = 0.88 + 0.12 * Math.sin(i * 1.7) * Math.cos(i * 0.31);
        heights[i] = avg * bowl * nse;
      }
      baked = true; dirty = true;
    }

    function relax(i) {
      const last = cols - 1;
      for (let k = 0; k < 6; k++) {
        const a = Math.max(0, i - 4), b = Math.min(last, i + 4);
        for (let c = a; c <= b; c++) {
          if (c < last && heights[c] - heights[c + 1] > REPOSE) {
            const d = (heights[c] - heights[c + 1] - REPOSE) * 0.5;
            heights[c] -= d; heights[c + 1] += d;
          }
          if (c > 0 && heights[c] - heights[c - 1] > REPOSE) {
            const d = (heights[c] - heights[c - 1] - REPOSE) * 0.5;
            heights[c] -= d; heights[c - 1] += d;
          }
        }
      }
    }

    function land(x) {
      const i = Math.max(0, Math.min(cols - 1, (x / cw) | 0));
      if (heights[i] < H * 0.92) heights[i] += 2.2;
      relax(i);
      dirty = true;
    }

    function spawnOne() {
      if (pn >= MAX_P || queue <= 0) return;
      px[pn] = 8 + Math.random() * (W - 16);
      py[pn] = -8 - Math.random() * 40;
      pc[pn] = (Math.random() * COLORS.length) | 0;
      pn++; queue--;
    }

    function step() {
      if (reduce) return;
      if (queue > 0 && (tick & 3) === 0) spawnOne();
      if (queue > 0 && (tick & 7) === 0) spawnOne();
      let w = 0;
      for (let i = 0; i < pn; i++) {
        py[i] += 1.15 + (pc[i] & 1) * 0.25;
        px[i] += Math.sin((tick + i) * 0.04) * 0.35;
        const col = Math.max(0, Math.min(cols - 1, (px[i] / cw) | 0));
        const floor = H - heights[col] - 2;
        if (py[i] >= floor) { land(px[i]); continue; }
        if (w !== i) { px[w] = px[i]; py[w] = py[i]; pc[w] = pc[i]; }
        w++;
      }
      if (w !== pn) { pn = w; dirty = true; }
      else if (pn) dirty = true;
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      if (cols) {
        const g = ctx.createLinearGradient(0, H, 0, H * 0.2);
        g.addColorStop(0, "rgba(251,113,133,0.55)");
        g.addColorStop(0.45, "rgba(251,191,36,0.42)");
        g.addColorStop(1, "rgba(255,247,237,0.22)");
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(0, H - heights[0]);
        for (let i = 1; i < cols; i++) ctx.lineTo(i * cw, H - heights[i]);
        ctx.lineTo(W, H - heights[cols - 1]);
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        for (let i = 0; i < cols; i += 2) {
          if (((i * 13 + (tick >> 4)) & 7) !== 0) continue;
          ctx.fillRect(i * cw, H - heights[i] - 1.5, 2.2, 2.2);
        }
      }
      for (let i = 0; i < pn; i++) {
        ctx.fillStyle = COLORS[pc[i]];
        ctx.fillRect(px[i], py[i], 3, 3);
      }
      dirty = false;
    }

    function loop() {
      raf = 0;
      if (document.hidden) return;
      tick++;
      step();
      if (dirty || pn || queue) draw();
      if (pn || queue || dirty) raf = requestAnimationFrame(loop);
    }

    function kick() {
      if (reduce || raf || document.hidden) { if (reduce) draw(); return; }
      raf = requestAnimationFrame(loop);
    }

    function syncTotal(g, opts) {
      totalG = Math.max(0, num(g));
      hud();
      if (opts && opts.bake && !baked) mound(totalG);
      if (dirty) kick();
    }

    function pour(g) {
      g = num(g);
      if (g <= 0) return;
      totalG += g;
      hud();
      if (reduce) { mound(totalG); draw(); return; }
      queue += Math.max(1, Math.min(180, Math.round(g * GRAINS_PER_G)));
      kick();
    }

    function init() {
      resize();
      window.addEventListener("resize", () => { resize(); if (baked) mound(totalG); draw(); }, { passive: true });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
      draw();
    }

    return { init, pour, syncTotal };
  })();

  // ── Boot ──────────────────────────────────────────────────
  (async function boot() {
    sugarSand.init();
    sugarBeakerEngine.init();

    // Heartbeat for online user presence
    setInterval(async () => {
      if (state.token && state.user) {
        try {
          const res = await api("/api/presence/heartbeat", { method: "POST" });
          if (res && Array.isArray(res.online_users)) {
            state.onlineUsers = res.online_users;
            document.querySelectorAll(".matrix-user-row").forEach((row) => {
              const u = row.dataset.user;
              const isOnline = (u === state.user) || state.onlineUsers.includes(u);
              const ind = row.querySelector(".online-indicator");
              if (ind) {
                if (isOnline) {
                  ind.className = "online-indicator";
                  ind.title = "Online now";
                  ind.innerHTML = '<span class="online-pulse"></span><span class="online-dot"></span>';
                } else {
                  ind.className = "online-indicator is-offline";
                  ind.title = "";
                  ind.innerHTML = "";
                }
              }
            });
          }
        } catch (_) {}
      }
    }, 15000);

    if (state.token && state.user && USERS.includes(state.user.toLowerCase())) {
      try {
        await loadInitial();
        renderApp();
        return;
      } catch (e) { /* stale session — fall through to picker */ }
    }
    state.token = "";
    state.user = "";
    localStorage.removeItem("sugar_token");
    localStorage.removeItem("sugar_user");
    renderUserPicker(); // always require an explicit pick on an unknown device
  })();

})();