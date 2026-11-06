# UNIFIED // AGENT ARCHITECTURE CARD

**Project No Fucks. Pure unbound creation.** This is an experiential art system, not a generic landing page.

## Runtime contract
- index.html is the semantic stage and interaction surface.
- style.css owns responsive layout, theme variables, typography, and industrial glass styling.
- app.js owns the Canvas world, animation, simulation telemetry, interactions, and Frontier chat client.
- audio.js is the existing zero-dependency Web Audio cadence synthesizer. It remains opt-in.
- build.js expands source.bundle.b64 into the readable source files and copies the production assets to dist/.

## System boundaries
1. Keep the core experience dependency-free. No remote libraries, fonts, images, or animation packages.
2. Cap device-pixel ratio and keep scene geometry bounded for mobile performance.
3. Preserve keyboard, pointer, touch, reduced-motion, and narrow-screen behavior.
4. Simulated biometric values must remain clearly labeled as simulation.
5. Audio begins only after a user gesture.
6. API keys stay in the backend and api_keys.md. Never expose secrets to the browser.
7. Render model output as text nodes, never injected HTML.
8. Preserve a local chat fallback when the remote service is offline.

## Build and publish
npm run build
./infra/deploy.sh unified --pages

Standalone mirror: yaegerbomb42/unified. Hosted output: yaegerbomb42.github.io/unified/.
