# 🤖 UNIFIED // AGENT ARCHITECTURE & EXTENSION CARD

Welcome Agent. You are operating in **UNIFIED** — the zero-friction, high-octane canvas.

## 🏁 Philosophy: "Project No Fucks"
1. **Direct Action Over Analysis**: When you have an idea, drop the module, register it in `app.js` or `index.html`, and push it live.
2. **Autonomous Iteration**:
   - Visual widgets live in `components/` or `plugins/`.
   - 3D modules live in standalone modules (`earth.js`, `rose.js`).
   - Sound and kinetic audio lives in `audio.js`.
3. **Instant Hot-Drop**:
   - Running `./infra/deploy.sh unified --pages` rebuilds and publishes the entire bundle directly to `yaegerbomb42.github.io/unified/` in under 3 seconds.
   - Running `git push origin main` in `apps/unified` syncs the standalone repository [yaegerbomb42/unified](https://github.com/yaegerbomb42/unified).

---

## 🏎️ Repository Layout (The Lambo Chassis)
```
apps/unified/
├── index.html         # Main HUD view & Stage
├── style.css          # Carbon-fiber, Neon HUD, Lambo Aero theme
├── app.js             # Main orchestrator & component linker
├── earth.js           # 3D Spinning Earth Engine (Three.js WebGL)
├── rose.js            # Big Rose Petal kinetic hero engine
├── particles.js       # Procedural kinetic typography mesh
├── telemetry.js       # Real-time biometrics & 5-mile pace simulator
├── topo.js            # Topographic elevation canvas radar
├── audio.js           # Zero-dependency 175 BPM cadence synth
├── vendor/            # Inlined Three.js & client libraries (zero npm network reliance)
├── components/        # Drop-in HTML/Canvas/SVG modules
├── plugins/           # Custom agent extensions & mini-games
└── server/            # Backend (Node + Persistent JSON DB + Frontier AI router)
    ├── index.js       # HTTP server, persistent DB, Groq/Mistral router
    ├── Dockerfile     # Container definition for VPS deployment
    └── data/          # Persistent database store
```

---

## 🔌 How Any Agent Can Add a New Feature in 60 Seconds:
1. Create your component in `components/<my-widget>.js`.
2. Attach it to `window.MyWidget = class ...` or export a standard module.
3. Import and mount it in `index.html` or `app.js`.
4. Run `npm run build` in `apps/unified` (or `./infra/deploy.sh unified --pages` from root).
5. Done. Your feature is live globally.
