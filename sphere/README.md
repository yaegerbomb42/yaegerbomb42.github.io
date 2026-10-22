# 🌌 Sphere Quest

A cosmic click-to-mine idle game built on the original 3D starry sphere. Click the
sphere to harvest crystals, chain clicks for combo multipliers, catch comets, buy
upgrades, and level up through 18 achievements — with a full **User Explorer** panel.

> Live at [`/sphere`](https://yaegerbomb42.github.io/sphere/) on GitHub Pages.

## How to play

| Action | What happens |
| --- | --- |
| **Click the sphere** | Mine crystals (gain per click increases with Mining Laser + combo). |
| **Chain rapid clicks** | Combo multiplier (up to ×2 at 50 in a row). |
| **Click a golden comet** | Jackpot bonus, roughly 50 + 15×level. |
| **Store (S)** | Buy upgrades: Mining Laser, Auto-Miner Drone, Charge Core, Themes. |
| **Explorer (E)** | Profile, stats, achievements, journey log, settings, save data. |
| **Daily missions** | Three rotating objectives at the bottom; claim rewards. |
| **Offline** | Drones keep mining while you're away (up to 8h at 50% strength). |

Keys: `E` explorer · `S` store · `H` help · `M` mute · `Esc` close.

## Architecture

Static, zero-dependency client-side app (only Three.js from CDN). No backend — all
progress lives in `localStorage` and can be exported/imported as JSON.

```
sphere/
├── index.html          # shell: HUD, panels, import map, boot
├── styles.css          # glass UI, animations, responsive
├── js/
│   ├── logic.js        # ★ pure game logic (economy, XP, ranks, missions, achievements) — unit-tested
│   ├── save.js         # localStorage persistence + export/import
│   ├── audio.js        # synthesized WebAudio SFX (no assets)
│   ├── scene.js        # Three.js scene: sphere, stars, drones, comet, particle bursts
│   ├── ui.js           # HUD, store, missions, toasts, floating text
│   ├── explorer.js     # User Explorer panel
│   └── main.js         # orchestrator: state wiring, loops, input
└── test/
    └── logic.test.js   # node --test unit tests (13 passing)
```

### Design notes

- **logic.js is pure** — no DOM/Three.js imports, so it runs in Node for tests
  and stays easy to reason about.
- **Save versioning** — `GAME_VERSION` + tolerant merge of partial/corrupt saves.
- **Daily missions** are seeded by calendar date (deterministic per day).
- **Particles pool** — 500-alive buffer with a free-list, no per-frame allocation.
- **Performance mode** — Explorer → Settings → Low particles halves star count and bursts.
- **Comet targeting** uses screen-space distance (a few pixels of lenience), so it
  stays clickable even with drift.

## Develop

```bash
# tests
node --test test/

# local dev (ES modules + CDN need http, not file://)
python3 -m http.server 8000   # then open http://localhost:8000/sphere/
```

## Roadmap

- [ ] Comet leaderboard / best streak per session
- [ ] More themes + animated shader on the sphere
- [ ] Audio volume slider
- [ ] Shareable save as a short link
