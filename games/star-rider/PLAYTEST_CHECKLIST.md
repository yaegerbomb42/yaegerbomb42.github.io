# ✅ LIVE PLAYTEST CHECKLIST — Neon Survivors

Run this **in a real browser** just before handoff. Open `index.html` directly; no build step.
Check each box in order. If anything fails, note it in `AGENT_CHAT.md` with `[BLOCKER]`.

---

## 0. Boot
- [ ] Page loads with **zero red errors** in DevTools console
- [ ] Menu screen appears with: PLAY / UPGRADES / TROPHIES / SETTINGS / RECENT RUNS / SEED BOARD
- [ ] Music/SFX play on first click (AudioContext unmuted by user gesture)

## 1. Start a run
- [ ] **Standard** run: player spawns, WASD moves, camera follows
- [ ] **Daily** mode: mutator card on menu matches HUD badge in-run; seed tag shows `#YYYYMMDD`
- [ ] **Custom seed**: same seed twice → same first-wave spawn pattern (determinism)

## 2. Core loop (first 2 minutes)
- [ ] Enemies spawn and chase/attack correctly (dot/tri/quad at minimum)
- [ ] Weapon auto-fires (restarts from menu with starting weapon)
- [ ] XP gems drop on kill, fly to player, fill XP bar
- [ ] **Level-up card UI overlays the screen** with 3 choices; clicking one applies it and unpauses
- [ ] Chained level-ups queue (pick one, next card appears) — `pendingLevels` drains to 0
- [ ] HP heart drops heal; magnet pulls pickups; shock pickup zaps; chest gives upgrade/evolve
- [ ] Dash (Space/Shift) works, cooldown ring animates

## 3. HUD & overlays (round-trip each)
- [ ] Pause (Esc/P) → Resume / Settings / Codex all reachable → return to game resumes cleanly
- [ ] Codex overlay: ENEMIES tab shows encountered types, WEAPONS tab shows owned levels, STATS tab shows damage bars + lifetime damage
- [ ] Settings modal: master/SFX/music sliders live-apply; screenshake toggle; reduced flash toggle; survives reload
- [ ] Trophies modal opens/closes; unlocked achievements show timestamps
- [ ] Minimap (N) toggles on/off + shows enemies/pickups/boss markers
- [ ] Edge danger arrows appear toward off-screen enemies near borders

## 4. Mid-game systems (3–7 min)
- [ ] Supply drop event telegraphs and lands; standing in ring grants bundle
- [ ] Elite enemies spawn with visible aura and buffed nearby enemies
- [ ] Elemental statuses visibly apply on hit (burn/freeze/shock/void rings)
- [ ] Combo meter increments on chained kills; milestone at 10 combo grants XP
- [ ] Kill milestone announcements at 100/250/500 (shatter wave + banner)
- [ ] **Boss at ~3:00** (Warden Mk.I): intro letterbox/cinematic plays, boss engages, HP bar shows
- [ ] Boss telegraphs (pulsing ring + aim arrow) visible; enrage at 50% HP triggers visual + spray

## 5. Weapons (test with console unlocks if needed)
- [ ] All 8 weapons fire and render (bolt/saws/nova/tesla/lance/drones/frost/prism)
- [ ] Weapon evolutions apply their bonus behavior (e.g. Cryo shatter AoE)
- [ ] Per-weapon damage breakdown renders in Codex STATS + game-over recap

## 6. Death & persistence
- [ ] On death: game-over screen with run stats (time/level/kills/KPM), weapon damage chart, RECENT RUNS entry added
- [ ] Reload page → menu: best run updated, codex kill counts persisted, achievements kept, meta shards credited
- [ ] Kill tab mid-run (close and reopen) → codex/meta/history not lost (beforeunload flush)

## 7. Victory & restart
- [ ] Survive 10:00 → final boss; defeat → victory screen + confetti/SFX
- [ ] RESTART button starts a fresh run with all arrays clean (no leftover enemies/projectiles/pickups/stats)
- [ ] BACK TO MENU returns without console errors

## 8. Input surfaces (skip any the tester won't use)
- [ ] Touch: virtual joystick + dash button appear on a touch device; game pauses via top-right button
- [ ] Gamepad: stick moves, A/X/RT dashes, Start pauses, Y mutes, haptic rumble on hit
- [ ] Keyboard: WASD + arrows both move; N minimap; M mute; Esc/P pause

## 9. Stability spot-checks
- [ ] FPS stays smooth with 100+ enemies + particles (pool caps engaged — no runaway memory)
- [ ] No NaN in HUD (hp/xp/time/level readouts render as real numbers throughout)
- [ ] Audio intensity ramps with enemy count, shifts to boss layer on boss, ducks on kick

---

### Sign-off

| Tester | Date | Build hash | Result |
|---|---|---|---|
|  |  |  | ☐ PASS ☐ FAIL — issues filed in AGENT_CHAT.md |
