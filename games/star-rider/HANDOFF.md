# 🌟 NEON SURVIVORS — AGENT HANDOFF & CODEBASE CONTEXT

> **Read this first.** This document is the single source of truth for any agent or developer jumping into this project. It's kept alive alongside AGENT_CHAT.md and TODO.md. Update it when you ship something significant.

## Phase 8 — COSMIC EXPLORATION & MAP POLISH (COMPLETE — 281/0 green, integrated 2026-08-05)

**Status: SHIPPED.**
- **Pseudo-3D Player Fighter**: Multi-layered isometric hull plates, raised canopy, and dynamic 3D banking/roll matrix driven by lateral velocity.
- **Deep-Space Nebula Clouds**: Parallax cosmic nebulae rendered with dynamic radial gradients behind the starfield.
- **Planet Exploration & Gravity**: 4 celestial planets (Aegis Prime, Pyro-IX, Neon Lagoon, Void Citadel) exerting inverse-distance gravitational pull vectors on the player.
- **Destructible Shard Pylons (WS-9)**: Interactive pylons taking weapon damage and detonating into 140px Frost/Fire elemental storm fields.
- **Elite Nemesis Affixes (WS-10)**: 7 unique elite affixes (`fortify`, `swift`, `rage`, `molten`, `vortex`, `reflective`, `chrono`) with custom ring auras and mechanics.
- **Rare Loot Pickups**: Added `overcharge` (instant max heat + damage boost) and `warp` (teleport + 2s enemy time freeze) to supply caches.

---

## ⚡ What Is This Game?

**Neon Survivors** is a browser-based arena survival roguelite built with pure HTML5 Canvas + vanilla JS (no frameworks, no build step). The player fights endless waves of neon geometric enemies, levels up, collects weapons and upgrades, and tries to survive 10 minutes to fight the final boss.

**Open `index.html` directly in a browser to play.** No server needed.

---

## 📁 File Map — Where Everything Lives

```
/game
├── index.html          ← DOM: all screens, HUD, menus, overlays
├── css/style.css       ← All visual styles (~906 lines)
├── js/
│   ├── audio.js        ← AudioSys: all Web Audio API sound + procedural music (~540 lines)
│   ├── game.js         ← Main game (~4151 lines, single IIFE)
│   └── gamepad.js      ← GamepadSys: Web Gamepad API, axis-stick → movement, A → dash
├── test/
│   ├── harness.js      ← Node-based DOM + rAF mock for tests
│   ├── run.js          ← Main test suite (`node test/run.js`)
│   └── verify.js       ← Secondary verification suite
├── AGENT_CHAT.md       ← Live multi-agent communication log
├── TODO.md             ← Feature roadmap with status flags
├── PLAYTEST_CHECKLIST.md ← Operator-run live-browser checklist
└── HANDOFF.md          ← THIS FILE — context for new agents
```

---

## 🧠 Architecture in Plain English

### game.js (the whole game is one big IIFE)

The game is structured in vertical sections. Read top-to-bottom:

| Lines (approx) | Section | What it Does |
|---|---|---|
| 1–30 | Constants & Canvas | TAU, clamp, lerp helpers; canvas + post-processing caCanvas |
| 31–60 | DOM refs (ui object) | All `$('id')` lookups — add new UI refs here |
| 61–130 | Settings System | Volume, screenshake, reducedFlash — persisted to localStorage |
| 131–300 | Achievements & Trophy System | 12 achievements, unlock toasts, trophies modal rendering |
| 300–400 | Meta Progression (META_DEFS) | Permanent upgrades bought with Neon Shards 💎 |
| 400–520 | Input & Touch Controls | WASD/arrows/joystick, dash button |
| 520–645 | RNG & Daily Seed System | Mulberry32 PRNG, daily/custom/standard run modes |
| 645–790 | Codex/Bestiary + Damage Stats | Enemy encounter tracking, weapon damage breakdown |
| 790–825 | Player object | Stats, flags, reset function, mutation application |
| 825–1033 | Object Pools | particlePool, projectilePool, shockwavePool, floatTextPool |
| 1033–1085 | Spatial Hash Grid | `enemyGrid` — O(1) broadphase enemy queries |
| 1085–1135 | Enemy Types (ENEMY_TYPES) | All enemy stat defs including swarm, bosses |
| 1136–1265 | Spawn Director | Wave timing, supply drops, boss triggers, swarm bursts |
| 1265–1415 | Projectile Update | Homing, boomerang (Megalodon), hit resolution, pool release |
| 1415–1960 | Weapon Defs & Engine | WEAPON_DEFS, nearestEnemy, updateWeapons, spawnLightning |
| 1960–2005 | Elemental Status Engine | applyBurn/Freeze/Shock/VoidDecay, updateEnemyStatuses |
| 2005–2090 | Damage Functions | damageEnemy (crit/void/pool), damagePlayer, killEnemy |
| 2090–2125 | Float Texts & Particles | addFloatText, showFloatingShard |
| 2125–2185 | Update Loop | update(dt) — calls all subsystem updates in order |
| 2185–2340 | Enemy AI (updateEnemies) | Movement, dashing, shooting, healing, bombers, bosses |
| 2340–2390 | Main draw() function start | Background clear, shake calc, chromatic aberration |
| 2390–2490 | Draw scene | Stars → grid → gems → hazards → shockwaves → enemies → projectiles → saws → frost → player → particles → float texts |
| 2490–2563 | Post-processing & HUD | Chromatic aberration, combo HUD, edge danger indicators, minimap |
| 2563–2890 | Draw helpers | drawBossIntro, drawStars, drawGrid, drawGem, drawPlayer, drawShockwave, etc. |
| 2890–2960 | Game flow | startGame, gameOver, victory, togglePause, saveBest |
| 2960–3100 | Codex overlay | renderCodex, showCodexTab, openCodex/closeCodex |
| 3100–3170 | Main loop & boot | requestAnimationFrame frame(), updateHUD(), event listeners |

### audio.js

`AudioSys` is a self-contained namespace:
- `AudioSys.init()` — creates AudioContext on first user gesture
- `AudioSys.SFX.*` — all sound effects (shoot, hit, dash, levelup, chest, milestone, hurt, gameover, victory...)
- `AudioSys.updateIntensity(enemyCount, isBossActive)` — drives procedural music intensity
- `AudioSys.getBeatPulse()` — returns [0..1] beat pulse scalar for visual sync
- `AudioSys.setBossMode(bool)` — switches music to boss drive layer
- `AudioSys.setMasterVolume/setSfxVolume/setMusicVolume/toggleMute`
- **Defensive Proxy** wraps SFX — missing methods are silently no-ops, won't crash

---

## ✅ What's Already Built (Shipped)

### Core Systems
- ✅ Arena survival loop (10 min win condition, boss defeat)
- ✅ WASD + touch controls (360° virtual joystick)
- ✅ Spatial Hash Grid (`enemyGrid`) — O(1) enemy broadphase
- ✅ Object Pool system — particles (800), projectiles (300), shockwaves (100), floatTexts (80)
- ✅ Deterministic seeded RNG (Mulberry32) + daily/custom/standard run modes

### Weapons (7 + 7 evolutions)
| Weapon | Key | Evolution at L5 | Synergy Stat |
|---|---|---|---|
| Neon Bolt | bolt | Quantum Storm (split bolts) | Overclock |
| Orbit Saws | saws | Megalodon Blades (boomerang) | Swiftness |
| Nova Pulse | nova | Supernova Core (gravity well + burn) | Max HP |
| Tesla Arc | tesla | Mjolnir Matrix (storm zones + shock) | Data Mind |
| Rail Lance | lance | Spiral Lance (360° sweep) | Swiftness |
| Seeker Drones | drones | Cluster Drones (4 micro-missiles) | Luck Module |
| Freeze Ray | frost | Absolute Zero (360° freeze shatter) | Repair |

### Enemy Types (10 + 3 bosses)
| Type | Notes |
|---|---|
| dot | Basic seeker |
| tri | Dashy charger |
| quad | Slow tanky |
| penta | Splits into 2x tri on death |
| sniper | Holds range, telegraphed beam shot |
| healer | Aura heals nearby allies (1.7× heal / 0.9s to 4% maxHp) |
| bomber | Charges + detonates on death |
| **swarm**  | tiny/fast/fragile, spawn in dense bursts of 6–12, cyan NANITE in Codex |
| **lurker** | VOID MAW: stalk→submerge (untargetable)→breach (telegraph ring + shockwave + lunge). Joins special waves after 200s |
| boss1 | WARDEN MK.I (spawns at 3:00) |
| boss2 | WARDEN MK.II (spawns at 7:00) |
| boss3 | THE ARCHITECT (final boss at 10:00) |

Elites (any non-boss type flagged `elite`) carry a random **aura** (fortify green/swift cyan/rage orange) that buffs nearby allies in a 160-radius ring.

### Elemental Status Effects
| Status | Applied By | Effect | Visual |
|---|---|---|---|
| 🔥 Burn | Nova/Supernova | DoT every 0.2s | Orange pulsing flame ring |
| ❄️ Freeze | Frost/Absolute Zero | Slows to 45% or freezes solid | Cyan ice ring + crystal spikes |
| ⚡ Shock | Tesla/Mjolnir | Micro-stun + chain discharge | Yellow arc ring + sparks |
| 🌀 Void Decay | Void Rift mutator | 1.35x damage vulnerability | Purple swirling aura |

### Meta/Progression
- ✅ Meta Progression (Neon Shards 💎, permanent stat upgrades, weapon unlocks)
- ✅ Daily Seeded Mutations (Glass Cannon, Magnet Chaos, Hyper Swarm, Chrono Shift, Titan Protocol, Vampire Curse, Overcharge, Void Rift)
- ✅ Achievements & Trophy System (12 achievements, persistent localStorage, unlock toasts)
- ✅ Codex/Bestiary (enemy encounter log + kill counts, weapon discovery — accessed from Pause menu)
- ✅ Settings Menu (Volume, Screenshake toggle, Reduced Flash mode)

### Polish & Juice
- ✅ Procedural Synthwave BGM (Web Audio API oscillators, dynamic intensity 0→1→2)
- ✅ Chromatic Aberration post-processing (RGB channel split on hitStop/shake)
- ✅ Boss intro cinematic (letterbox bars, danger header, boss title card)
- ✅ Combo streak system (combo meter, 🔥Nx HUD, bonus XP on milestones)
- ✅ Kill milestones at 100/250/500/1000 kills (shockwave, audio chord, float text)
- ✅ Supply drop events every ~90s (telegraphed landing, chest+heart+magnet)
- ✅ Parallax starfield + neon grid background (beat-synced grid pulse)
- ✅ Screen-edge danger indicators (neon arrows at screen edges toward off-screen enemies)
- ✅ Minimap (toggle with 'N' key, bottom-right corner HUD, color-coded enemies/pickups/bosses)
- ✅ **Boss Phase Transitions** — at 50% HP all bosses enter Enraged mode: speed boost, periodic projectile spray fan, pulsing crimson corona aura, one-shot shockwave burst ring, cinematic `⚠ BOSS ENRAGED!` alert

---

## 🔴 Open TODOs — Pick One and Claim It

Add `[WIP YourName]` in TODO.md when you start. Remove when done.

### All shipped (recently closed)
- ✅ **Run-Stats Recap Screen** — post-run stat card on gameover/victory (Composer)
- ✅ **Damage Breakdown Chart** — bar chart on gameover + codex STATS tab (Composer/Composer-B)
- ✅ **Codex kill count persistence on close** — `beforeunload` hook + per-25-kill flush (Composer)
- ✅ **Gamepad support** — `js/gamepad.js` with left-stick move + A dash (Agent-Nova)
- ✅ **Run History** — last 5 runs in `neonSurvivorsRunHistory`, panel on menu (Composer)
- ✅ **Daily Seed Leaderboard** — `neonSurvivorsSeedBoard` per-seed best (Agent-Modifiers)
- ✅ **Elite Enemy Visual Variants** — fortify/swift/rage auras w/ ring colors (Composer-B)

### Medium Priority  
- `[ ]` **Passive Ability System** — random passive abilities on level-up that DON'T add weapons (e.g. "Afterburn", "Vampiric Strike", "Overclock").
- `[ ]` **Colorblind Mode** — alt color palette for status effects and enemies.
- `[ ]` **Elemental synergy recipes** — combine elements for evolved weapons (revive evolve system with ELEMENT_INFO as source of truth).

### Polish / QoL
- `[ ]` **Pause Menu: Weapon Status Display** — show current weapon levels + elemental tags in pause screen.
- `[ ]` **Tooltips on codex** — hover to expand weapon tips.

---

## 🗺️ Quick Patterns / How-Tos for New Agents

### Add a new enemy type
1. Add to `ENEMY_TYPES` (line ~1086) — follow existing pattern
2. Add to `CODEX.enemies` array (line ~669)
3. Add spawn logic in `updateSpawning` (line ~1159)
4. Handle special AI in `updateEnemies` if needed (line ~2185)
5. Color in the `col` lookup in `killEnemy` (line ~2055)
6. Add `recordEncounter(type)` is already called in `spawnEnemy` ✅

### Add a new weapon
1. Add to `WEAPON_DEFS` object (line ~1418)
2. Add firing logic in `updateWeapons` (line ~1460)
3. Add draw logic in `draw()` or use existing projectile/shockwave rendering
4. Add evolution entry in the synergy system if desired
5. Call `recordWeaponUnlock(id)` in `addWeapon()` — already done ✅

### Add a new upgrade card (stat buff)
1. Add to `UPGRADE_POOL` array in game.js (search for `UPGRADE_POOL`)
2. Apply the stat change in the `onPick` function
3. Hook into evolution check if it's a synergy stat

### Spawn a projectile
```js
pushProjectile({
  x, y, vx, vy,           // position + velocity
  r: 4,                    // radius
  damage: 25,              // raw damage (critChance/weaponDamageMul applied in damageEnemy)
  pierce: 0,               // 0 = destroyed on first hit, N = passes through N enemies
  homing: true,            // activates homing AI
  homingT: 2.0,            // seconds of homing
  life: 1.5,               // seconds before expiry
  color: '#4ff',           // glow color
  hostile: false,          // true = damages player, false = damages enemies
  isQuantumBolt: true,     // triggers split-on-impact
  chainOnHit: { radius: 200, damage: 15 },  // chain lightning to nearest
  clusterSplit: { damage: 10 },              // spawns 4 micro-missiles on hit
});
```

### Spawn a shockwave
```js
pushShockwave({
  x, y,
  r: 10,          // start radius
  maxR: 200,      // expand to this radius
  speed: 700,     // px/sec expansion
  damage: 40,     // damage to enemies inside ring
  nova: true,     // applies Burn status if true
  knock: true,    // knockback impulse
  cosmetic: false,// true = visual only, no damage
  hostile: false, // true = damages player
});
```

### Apply a status effect
```js
applyBurn(enemy, duration_secs, dps);
applyFreeze(enemy, duration_secs, slowFactor);   // slowFactor 0..1
applyShock(enemy, duration_secs, dps);
applyVoidDecay(enemy, duration_secs, vulnerability);  // 1.35 = +35% dmg taken
```

### Spawn a particle
```js
pushParticle({
  type: 'shard',   // 'shard' | 'line' | 'beam'
  x, y, vx, vy,
  life: 0.35, maxLife: 0.35,
  color: '#ff6600',
  size: 3,          // for shard
  // for 'line'/'beam': x2, y2, w (lineWidth)
});
```

---

## 🎨 Style Guide

- **Color palette**: `#4ff` (cyan), `#ff4` (gold/crits), `#f4f` (purple/lance), `#fa4` (orange/drone), `#f66` (damage/red), `#4f8` (green/hp), `#f44` (danger/burn), `#8ff` (frost/electric)
- **All enemy damage** goes through `damageEnemy(e, dmg, color)` — crit/void/pools handled there
- **All text popups** use `addFloatText(x, y, text, color, isBig)`
- **Big center announcements** use `showFloatingShard(text)`
- **Audio**: always guard with `AudioSys.SFX.methodName?.()` or just call it — Proxy protects against missing methods

---

## 🧩 Known Quirks & Watch-Outs

1. **`pendingLevels` declared twice** — once in state section (~line 523) and once auto-added. Don't add it again.
2. **Seeded RNG** — use `rand()` / `randInt()` / `pick()` for gameplay logic so seeded runs are reproducible. Use `Math.random()` only for cosmetics.
3. **Pool objects must be released** — when removing projectiles/particles/shockwaves/floatTexts, always call `release*()` and use swap-and-pop. Never `splice` from the middle of these arrays.
4. **`drawEnemyStatusRings(e)`** is called at end of `drawEnemy(e)` — add new status visuals there.
5. **`WEAPON_DEFS` is defined TWICE** — once as a forward declaration for meta screen and once fully in the weapon engine section. The engine version (~line 1418) is canonical.
6. **All screens are overlays** — `.overlay` class with `z-index: 10`. Show/hide via `.classList.add/remove('hidden')`.

---

## 🔄 Coordination Protocol

1. **Before starting work**: Write your claim to `AGENT_CHAT.md` with `[YourName] CLAIMING: <feature>`
2. **Mark in TODO.md**: Change `[ ]` to `[WIP YourName]`
3. **After shipping**: Update both files with `[x]` in TODO and a summary in AGENT_CHAT
4. **Check AGENT_CHAT.md** before editing `game.js` or `audio.js` — another agent may be mid-edit
5. **Run a syntax check** (no browser testing): `node -c js/game.js && node -c js/audio.js`

---

## 🚀 Creative Directions (Uninhabited Territory)

These are ideas no agent has touched yet. Pick one and run:

- **🌊 Environmental Hazards** — periodic map events: meteor shower (falling hazard zones), gravity wells that pull enemies, EMP pulses that disrupt enemy AI
- **🔮 Rune System** — collect rune fragments from boss drops, combine to forge passive effects (e.g. "Inferno Rune" → all shockwaves leave burn patches)
- **📡 Distress Signal Events** — rare beacon pickups that summon a friendly AI turret for 15s
- **🎭 Rival Player Ghost** — replay a recorded best-run ghost as a "rival" that follows the same path, creating ghost co-op tension
- **🏗️ Destructible Terrain** — static obstacles that block enemy pathing until destroyed
- **⏳ Time Warp Ability** — temporary bullet-time effect (reduce timeScale for X seconds), triggered by a super-meter filled by kills
- **🌈 Prismatic Weapon** — weapon that randomly cycles through all element types each shot
- **📊 Kill Heatmap** — canvas overlay showing where the most kills happened during a run (shown on game-over screen)

---

## 💾 Persistence Keys (localStorage)

| Key | Contents |
|---|---|
| `neonSurvivorsSettings` | `{masterVol, sfxVol, musicVol, screenshake, reducedFlash}` |
| `neonSurvivorsMeta` | `{shards, hpRank, speedRank, unlockedWeapons[], startingWeapon}` |
| `neonSurvivorsBest` | `{time, level, kills}` — overall best run |
| `neonSurvivorsCodex` | `{encountered: {type: {kills, firstSeen}}, unlockedWeapons: {id: true}, lifetimeWeaponDamage: {id: {damage, kills}}}` |
| `neonSurvivorsAchievements` | `[achievementId, ...]` unlocked list |
| `neonSurvivorsSeedBoard` | `{seed\|mode: {attempts, victories, bestTime, bestKills, bestLevel}}` — per-seed leaderboard |
| `neonSurvivorsRunHistory` | `[{timestamp, outcome, time, level, kills, gems, comboBest, shards, seed, mode, mutators[], weapons}]` — last 5 runs |
| `neonSurvivorsRunSave` | `{v:2, s:{playerStats}, w:[{id,level,evolved,heat,milestoneBoost?}], time, kills, gems, seed, mode, muts[], comboBest}` — mid-run snapshot (WS-G). Written ≤1 per 15s + beforeunload; cleared on gameOver/victory/fresh startGame/resume. Unknown `v` → ignore+clear. Resume respawns clean field at saved timestamp (no enemy state stored). |

**Rule**: any new localStorage key gets added to this table in the same session. Use the `Object.assign(defaults, JSON.parse(getItem() || '{}'))` merge pattern so old saves stay forward-compatible.

---
## 🆕 2026-07-30 Additions (Agent-Atlas)

**New weapon: Arc Prism (`prism`)** 🔺 — orbiting prismatic shards (1–3) that contact-zap (guarded by enemy `pHitCd`) and periodically refract lightning to the N nearest enemies per shard (`spawnLightning` + `applyShock`). In `WEAPON_DEFS`, `drawPrism()`, meta unlock (450💎), and level-up pool.

**New enemy: VOID MAW / Lurker (`lurker`)** ◣ — stalk→submerge→breach state machine. Submerged = untargetable (`nearestEnemy`/projectile loops skip `e.sub`) + invisible w/ ripple tell. Breach = telegraph ring + shockwave + lunge. Joins special-wave rotation after 200s. In `ENEMY_TYPES`, `SHAPES`, `buildShapes`, codex, killEnemy shard color (#a4f).

**Level-Up Card System (the core progression loop — was completely unwired):**
- `levelUp()` increments `pendingLevels`, calls `presentLevelUpChoices()` when `state==='playing'`.
- `buildLevelUpPool()` — weapon-upgrade cards (owned weapons <L5) + one NEW-weapon card (registry-respecting, cap 6) + 9 stat cards. All seeded (`rand`/`pick`). `weightedSample()` draws 2–4 (scales with level).
- `applyLevelUpChoice()` applies, SFX, chains queued levels, returns to `playing`.
- **Invariant:** `gameOver()`/`victory()` flush `pendingLevels` and hide the levelup overlay — death always wins, queue never leaks across runs.

**Hardening shipped:**
- Frost cone + boss HP bar gradient draws guard falsy/`addColorStop` with solid-fill fallback.
- Pool integrity: `getProjectile`/`releaseProjectile`/`getShockwave`/`releaseShockwave` re-init `hitSet = new Set()` if missing — never assume pooled Sets survive foreign mutations.
- `renderMetaScreen` uses `createElement('button')` + `appendChild` (not `querySelector`) — harness-safe.

**Test suite: `node test/run.js` = 150/0 GREEN.** Soak-verified: 40-level card loop, 120s mixed-input, meta BUY flow, overlay round-trips, stale-save rehydrate.

## 🧭 Docs Discipline

- **`HANDOFF.md` is the single source of orientation truth.** Update it when you ship a system that changes a section boundary or adds a registry/persistence key.
- **`AGENT_CHAT.md`** stays chronological ledger — claims, ships, blocks. Don't copy it to handoff; distill.
- **`TODO.md`** is aspiration (long-term). Don't bug people for stale entries.
- If you add a new JS module (like `js/minimap.js`, `js/gamepad.js`), list it in the **File Map** table above with who owns what it talks to (game.js sections + DOM).

---

## 🆕 2026-07-30 Additions (Agent-Velocity, WS-B)

**Non-blocking Level-Up HUD:** level-up offers render as a left-edge dock (`#levelup-hud` → `#levelup-cards`, up to 4 cards) while the run keeps simulating — `state` stays `'playing'`. Pick with `1/2/3/4` or click; badge `Lv +N` when queued; 8s sim-time auto-pick (first card); ESC/P force-pause hides the dock (restored on resume). Perf: DOM writes only on offer-open/pick/pause-toggle — countdown is pure sim-time (`levelupTimer` module var), cards animate via CSS `@keyframes luSlideIn`. Reuses `buildLevelUpPool()`/`applyLevelUpChoice()` unchanged. Legacy `#levelup-screen` overlay remains in DOM (mirrored, hidden) for harness compat but is no longer driven. Opt-level-up UI entry point for future HUD-based choices (WS-E chest power-ups reuse the same `levelupChoices`/`levelupOpen` dock).

*Handoff version: 2.0 — Keep this file updated as the game evolves.*

---

## 🚀 Phase 7 — "Next Level" Expansion (SHIPPED 2026-07-30, suite 275/0)

Multi-agent sprint against the directive: more dopamine, better/unique enemies, auto-XP, fun auto weapon upgrades, non-blocking choices, save persistence. Coordination via `AGENT_CHAT.md` + `scripts/chat.sh`; unified board in `TODO.md Phase 7`. All green; pickled commits `b964a27..4cdaa06`.

| System | Where it lives | Notes |
|---|---|---|
| **Non-blocking level-up HUD** | `#levelup-hud` left-edge dock (index.html), `presentLevelUpChoices` (~2430) | Never pauses; `state` stays `'playing'`. `pendingLevels` queues; `Lv +N` badge; hotkeys 1–4 + click; 8s auto-pick (smart priority + low-HP crisis override). WS-B. Legacy `#levelup-screen`/`#cards` kept as harness-compat mirror — `ui.cards` falls back `$(levelup-cards) || $(cards)`. |
| **Chest power-up choice (7.8)** | `buildChestPool/presentChestChoices/applyChestChoice` (after `applyLevelUpChoice`) | Supply chest pickup opens a 3-option non-blocking cache in the SAME dock. `chest:true` tags route `applyChestChoice` (never drains `pendingLevels`); 8s auto-resolve takes option 1. Dock busy → legacy +15–30 shard fallback. |
| **Weapon-level flavor (7.5)** | `addWeapon` (~2477) | L2–L4 mid-tier ups fire element-colored radial burst + ring + float text + ramping shake/hitStop. Cosmetic-only, seeded `pick()`. L5 evolve unchanged. |
| **Auto-XP vacuum (7.4)** | `updatePickups` | XP gems dwell 1.2s (0 if `magnetSurge>0`) then self-stream with age-ramped speed; `AudioSys.SFX.gemVacuum(value)` + absorb pop particle on pickup. Other pickups keep radius magnet. |
| **Dopamine juice (WS-C/F)** | `registerKill` (combo tiers `COMBO_TIERS=[10,25,50,100,250,500]` escalating `comboUp(tier)` + STREAK text), `damageEnemy` (crit 4 radial gold `line` sparks + `SFX.crit`), overkill ≥2.5× lethal → 12 shards + shockwave + `OVERKILL!` + `SFX.overkill`, kill-feel tiers (swarm/normal/elite/boss), `levelupChord`, `milestoneBig`, low-HP LFO flutter via `updateIntensity(3rd param)` | `audio.js`: crit/comboUp(tier)/levelupChord/gemVacuum/enemyLatch/webSnare/overkill/milestoneBig. |
| **AUTO-FORGE weapon heat** | `weaponHeat`, `smartChestFeed` | Weapon kill-heat drives micro auto-boosts (WS-E); chest feeds top-killer. |
| **New enemies** | `ENEMY_TYPES` + `updateEnemies` AI + `SHAPES`/`buildShapes` + codex (~905-914) | splitter (FISSION CELL mitosis), phantom (PHASE WRAITH blink-flank, untargetable mid-blink), weaver (SPINSTRESS web-slow hazards, see below), bulwark (AEGIS WALL frontal shield), necro (GRAVE CALLER resurrection). 19 types + 3 bosses total. |
| **Weaver web slow** | `updateEnemies` (weaver drops `{type:'web',r:70,t:4}` hazards) + `updatePlayer` speed loop (~3202) | Standing in a web → `spd *= 0.6`. Test gotcha: soak must shield the player (unshielded dies → `state=gameover` → 0px displacement flakes the assertion). |
| **WS-G save/continue** | ~4648–4706 `RUN_SAVE_KEY`, `saveRunSave/loadRunSave/hasRunSave/resumeRun/updateContinueButton`, boot `continue-btn` wiring | Mid-run snapshot (no enemy state), written ≤1/15s + beforeunload; cleared on gameOver/victory/fresh start/resume. Version-gated (`v:2`) → unknown v ignored+cleared. Quota-throw safe (`safeLoad/safeSave` helpers at boot ~64). CONTINUE button toggles via `updateContinueButton`. |

**Perf (Phase-7 mandate held):** DOM writes only on state change; countdowns are sim-time module vars; new shapes prebuilt in `buildShapes`; enemy lookups via `enemyGrid`; pool caps (800/300/100/80) respected.

**Coordination pitfalls (for future multi-agent runs):** whole-file `game.js` overwrites clobbered concurrent StrReplace hunks three times this session — always StrReplace targeted hunks, re-verify presence via `rg` before logging off, and `git commit` after every green hunk so nothing is lost.

*Last updated: 2026-07-30 by Agent-Havoc (Phase 7 integration)*
