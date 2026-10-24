# NEON SURVIVORS — Long-term plan

Legend: [ ] todo, [x] done, [WIP x] in progress by x

## Phase 7 — NEXT-LEVEL EXPANSION (COMPLETE — 275/0 green, integrated 2026-07-30)

**User directive**: more dopamine, better/more unique enemies, auto XP collection, better auto weapon upgrades that make killing more fun, NON-BLOCKING level-up & power-up choices, persisting saves across sessions.
**Status: ALL SHIPPED.** Details + line map in `HANDOFF.md → Phase 7`. Commits `b964a27..4cdaa06`.

### Workstream registry — final
| WS | Deliverable | Owner | Status |
|---|---|---|---|
| A | **Magnetism core** — XP gems auto-stream (dwell→surge), gemVacuum SFX + absorb pop | Agent-Havoc (7.4) | ✅ DONE |
| B | **Non-blocking level-up HUD** — left-edge `#levelup-hud` dock, never pauses, 1-4/click, 8s auto-pick | Agent-Velocity | ✅ DONE |
| C | **Killing-blow weapon drama** — overkill burst, kill-feel tiers, combo-tier escalation, crit radial sparks | Agent-Dopamine/WS-C | ✅ DONE |
| D | **5 new unique enemies** — splitter mitosis, phantom blink-flank, weaver web-slow, bulwark shield, necro resurrect | Agent-Bestiary (7.2/7.3) | ✅ DONE |
| E | **Weapon upgrade auto-tuning** — AUTO-FORGE weapon-heat micro-boosts + 7.5 weapon-level flavor bursts (L2-L4) | Agent-Arsenal/Havoc | ✅ DONE |
| F | **Procedural audio dopamine pack** — comboUp tier pitch, levelupChord, crit/gemVacuum/overkill/webSnare/enemyLatch | Agent-Synth (audio.js) | ✅ DONE |
| G | **Full save persistence v2** — mid-run `neonSurvivorsRunSave` + CONTINUE btn, version-gated, quota-safe, safeLoad/safeSave | Agent-Persist (WS-G) | ✅ DONE |
| 7.8 | **Chest power-up choice** — 3-option non-blocking cache dock, 8s auto-resolve, busy-fallback to shards | Agent-Havoc | ✅ DONE |
| QA | **Guardian** — suite now 275/0; regression tests for every shipped system | all owners | ✅ DONE |

### Shared-file edit schedule (reduce merge pain)
- `js/game.js` — primary: A, B, C, D, E; F touches only `AudioSys.*` callsites; G touches startGame/menu/persistence
- `js/audio.js` — exclusive: F (Agent-Synth)
- `index.html` + `css/style.css` — primary: B (level-up HUD); A/G minor additive blocks
- `test/*.js` — primary: QA; each owner adds tests for own feature (QA owns merge)

### Rules of engagement (wave 2)
1. Claim in AGENT_CHAT.md before first edit; log timestamp + name on every ship.
2. `node test/run.js` before AND after every change. Red on your watch = fix or revert before logging off.
3. Re-read ledger right before editing a shared file section. StrReplace small hunks, never rewrite whole files.
4. Seeded `rand()/pick()` for gameplay; `Math.random()` cosmetics only. Pools: swap-and-pop + release.
5. New localStorage key → add to HANDOFF.md persistence table same session.

### ⚡ PERFORMANCE MANDATE (user directive — all agents)
60fps is a hard requirement. Every Phase-7 feature ships allocation-free hot paths:
- No per-frame allocations (closures, arrays, objects, string concat) in update/draw loops — reuse module-level temps
- Enemy/neighbor queries via `enemyGrid` spatial hash only — never nested O(n²) enemy loops
- DOM writes ONLY on state change (level-up event, HUD tick) — never per frame
- Respect pool caps (particles 800 / projectiles 300 / shockwaves 100 / floatTexts 80) — shed oldest, never grow
- New enemy shapes prebuilt once (buildShapes pattern), not re-pathed per frame
- Stress-proof: QA runs a 40-enemy + all-systems 600-frame soak; pool caps must hold
- Note perf considerations in every ship log

---
## LIVE-TEST READINESS — group goals (QA phase, feature freeze) — wave 1, COMPLETE
- [x] `node test/run.js` fully green at all times (129 checks, 0 failures) — Nova watchdog
- [x] Full journey verified: menu → modes → run → pause/settings/codex → level-up cards → bosses 1-3 → gameover & victory — Nova + Verity + Nexus
- [x] Run-reset audit: no stale state leaking between runs — Nova
- [x] Meta persistence round-trip: settings/best/shards/achievements/trophies/seedBoard survive corrupt JSON + reload — Nova
- [x] Fuzz soak: randomized inputs, zero exceptions, no NaN leaks, 1500 frames — Nova
- [x] Wire audit: every clickable element in index.html has a working handler — Nova
- [x] Perf sanity: no unbounded arrays; particle/damage-number caps hold under stress — Nova
- [ ] Browser smoke test by @Yaeger (agents can't open the browser) — STILL OPEN, do after Phase 7 lands

## Phase 1 — Gameplay depth (wave 1)
- [x] New enemies: sniper / healer / bomber — Composer
- [x] Supply drops ~ every 90s w/ telegraphed landing — Composer
- [x] Combo streak system + HUD meter — Composer
- [x] Rail Lance + Seeker Drones weapons — Composer
- [x] Freeze Ray weapon — Agent B0
- [x] Kill milestones at 100/250/500/1000/2000/5000 — Agent-Juice
- [x] Boss intro cinematic — Agent-Juice
- [x] Meta progression (localStorage unlocks) — Agent-Systems
- [x] Daily modifier (seeded mutation) — Agent-Modifiers
- [x] Deterministic seeded run — Agent-Modifiers
- [x] Swarm enemy type — Yaeger/Agent-Atlas
- [x] Arc Prism weapon — Agent-Atlas
- [x] Lurker enemy type — Agent-Atlas
- [x] Boss enrage phases — Agent-Atlas
- [x] Weapon evolve trigger wired at L5 — Composer

## Phase 2 — Juice & polish (wave 1)
- [x] Parallax starfield background — Composer
- [x] Dash cooldown ring — Composer
- [x] Chromatic aberration on hitStop / screen-shake — Agent-Juice
- [x] Run-stats recap screen — Composer
- [x] Screen edge danger indicators — Composer
- [x] Boss attack telegraph — Composer
- [x] Minimap HUD — Agent-Nova / Composer

## Phase 3 — Tech & hardening (wave 1)
- [x] Object pooling — Agent-Performance
- [x] Spatial hash for enemy queries — Agent B0
- [x] Touch controls — Agent-Systems
- [x] Settings menu — Agent-Systems
- [x] CI/test suite — Agent-Nova / Composer
- [x] Gamepad support (js/gamepad.js) — Agent-Nova

## Phase 4 — Deep Mechanics (wave 1)
- [x] Weapon Synergy & Evolution System — Agent-Synergy
- [x] Elemental Status Engine (Burn/Freeze/Shock/Void) — Agent-Combat
- [x] Critical Hit System — Yaeger
- [x] Damage-dealt breakdown per weapon — Composer
- [x] Codex / Bestiary — Composer

## Phase 5 — Polish & Audio (wave 1)
- [x] Dynamic Music Synthesizer & Adaptive Beat Sync — Agent-Audio
- [x] Particle Recycling Engine — Agent-Performance
- [x] Achievements & Trophy System — Agent-Achievements
- [x] Hurt-number aggregation — AgentSigma

## Phase 6 — Expansion & Cross-Cutting (wave 1)
- [x] CODEBASE_MAP.md / CONVENTIONS.md (merged into HANDOFF.md) — Composer
- [x] Weapon elemental tag system (ELEMENT_INFO) — Composer-B
- [x] Per-weapon damage history persistence — Composer-B
- [x] Seed board per-seed leaderboard — Agent-Nova
- [ ] Daily leaderboard (cross-session global) — superseded by seedBoard unless re-asked
- [ ] New Game+ mode — OPEN (post-Phase-7 candidate)
