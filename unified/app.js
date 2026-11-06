// Orchestrator for UNIFIED // 5 MILE RUN. SHRED SEASON.
import { EarthEngine } from './earth.js';
import { RosePetalEngine } from './rose.js';
import { CeilingLatticeEngine } from './lattice.js';

function startUnifiedApp() {
  // 1. Initialize 3D Ceiling Tile Lattice & Quantum Singularity Engine
  const latticeCanvas = document.getElementById('latticeCanvas');
  let latticeEngine = null;
  if (latticeCanvas) {
    try {
      latticeEngine = new CeilingLatticeEngine(latticeCanvas);
    } catch (e) {
      console.error('LatticeEngine error:', e);
    }
  }

  // 2. Initialize 3D Earth Engine
  const earthContainer = document.getElementById('earthContainer');
  let earthEngine = null;
  if (earthContainer) {
    try {
      earthEngine = new EarthEngine(earthContainer);
    } catch (e) {
      console.error('EarthEngine error:', e);
    }
  }

  // 3. Initialize Big Rose Petal Hero Engine
  const roseCanvas = document.getElementById('roseCanvas');
  let roseEngine = null;
  if (roseCanvas) {
    try {
      roseEngine = new RosePetalEngine(roseCanvas);
    } catch (e) {
      console.error('RosePetalEngine error:', e);
    }
  }

  // 4. Initialize Kinetic Canvas
  const kineticCanvas = document.getElementById('kineticCanvas');
  let kineticEngine = null;
  if (kineticCanvas && window.KineticTextEngine) {
    try {
      kineticEngine = new window.KineticTextEngine(kineticCanvas);
    } catch (e) {
      console.error('KineticTextEngine error:', e);
    }
  }

  // 5. Initialize Topo Elevation Radar
  const topoCanvas = document.getElementById('topoCanvas');
  let topoEngine = null;
  if (topoCanvas && window.TopoEngine) {
    try {
      topoEngine = new window.TopoEngine(topoCanvas);
    } catch (e) {
      console.error('TopoEngine error:', e);
    }
  }

  // 6. Audio Toggle
  const audioBtn = document.getElementById('audioToggleBtn');
  const audioLabel = document.getElementById('audioLabel');
  const audioIcon = document.getElementById('audioIcon');
  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      const isPlaying = window.shredAudio.toggle();
      if (isPlaying) {
        audioBtn.classList.add('active');
        audioLabel.textContent = 'AUDIO ACTIVE';
        audioIcon.textContent = '🔊';
      } else {
        audioBtn.classList.remove('active');
        audioLabel.textContent = 'AUDIO OFF';
        audioIcon.textContent = '🔇';
      }
    });
  }

  // 7. Theme Switcher (Cyber -> Solar -> Lambo)
  const themes = ['cyber', 'solar', 'lambo'];
  let currentThemeIdx = 0;
  const themeBtn = document.getElementById('themeToggleBtn');
  const themeLabel = document.getElementById('themeLabel');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      currentThemeIdx = (currentThemeIdx + 1) % themes.length;
      const nextTheme = themes[currentThemeIdx];
      document.body.setAttribute('data-theme', nextTheme);
      themeLabel.textContent = `THEME: ${nextTheme.toUpperCase()}`;
      if (kineticEngine) kineticEngine.mode = nextTheme;
    });
  }

  // 8. Overdrive Mode (Hold Space or button)
  const overdriveBtn = document.getElementById('overdriveBtn');
  let isOverdrive = false;

  function activateOverdrive() {
    if (isOverdrive) return;
    isOverdrive = true;
    if (overdriveBtn) overdriveBtn.classList.add('active');
    if (kineticEngine) kineticEngine.setOverdrive(true);
    if (telemetry) telemetry.setOverdrive(true);
    if (earthEngine) earthEngine.setOverdrive(true);
    if (roseEngine) roseEngine.setOverdrive(true);
    if (latticeEngine) latticeEngine.setOverdrive(true);
    if (window.shredAudio) {
      window.shredAudio.triggerOverdriveSweep();
      window.shredAudio.setCadence(195);
    }
  }

  function deactivateOverdrive() {
    if (!isOverdrive) return;
    isOverdrive = false;
    if (overdriveBtn) overdriveBtn.classList.remove('active');
    if (kineticEngine) kineticEngine.setOverdrive(false);
    if (telemetry) telemetry.setOverdrive(false);
    if (earthEngine) earthEngine.setOverdrive(false);
    if (roseEngine) roseEngine.setOverdrive(false);
    if (latticeEngine) latticeEngine.setOverdrive(false);
    if (window.shredAudio) {
      window.shredAudio.setCadence(176);
    }
  }

  if (overdriveBtn) {
    overdriveBtn.addEventListener('mousedown', activateOverdrive);
    window.addEventListener('mouseup', deactivateOverdrive);
    overdriveBtn.addEventListener('touchstart', (e) => { e.preventDefault(); activateOverdrive(); });
    window.addEventListener('touchend', deactivateOverdrive);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT') {
      activateOverdrive();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
      deactivateOverdrive();
    }
  });

  // 9. DOM Metrics References & Telemetry
  const metricDistance = document.getElementById('metricDistance');
  const metricTime = document.getElementById('metricTime');
  const metricPace = document.getElementById('metricPace');
  const metricHeartRate = document.getElementById('metricHeartRate');
  const metricCadence = document.getElementById('metricCadence');
  const metricElevation = document.getElementById('metricElevation');
  const metricCalories = document.getElementById('metricCalories');
  const metricLactate = document.getElementById('metricLactate');
  const progressFill = document.getElementById('progressFill');
  const hudStatus = document.getElementById('hudStatus');
  const splitsList = document.getElementById('splitsList');
  const splitStatusBadge = document.getElementById('splitStatusBadge');

  let lastMileIndex = -1;

  let telemetry = null;
  if (window.TelemetryEngine) {
    telemetry = new window.TelemetryEngine((state) => {
      if (metricDistance) metricDistance.innerHTML = `${state.distanceMiles} <small>MI</small>`;
      if (metricTime) metricTime.textContent = state.formattedTime;
      if (metricPace) metricPace.innerHTML = `${state.formattedPace} <small>/MI</small>`;
      if (metricHeartRate) metricHeartRate.innerHTML = `${state.heartRate} <small>BPM</small>`;
      if (metricCadence) metricCadence.innerHTML = `${state.cadence} <small>SPM</small>`;
      if (metricElevation) metricElevation.innerHTML = `${state.elevationGainFt} <small>FT</small>`;
      if (metricCalories) metricCalories.innerHTML = `${state.caloriesBurned} <small>KCAL</small>`;

      const lactate = ((state.heartRate - 120) * 0.08 + 1.2).toFixed(1);
      if (metricLactate) metricLactate.innerHTML = `${lactate} <small>MMOL</small>`;

      if (progressFill) progressFill.style.width = `${state.progressPct}%`;
      if (hudStatus) {
        hudStatus.textContent = isOverdrive 
          ? `OVERDRIVE // CADENCE ${state.cadence}` 
          : `CADENCE ${state.cadence} // LIVE`;
      }

      if (topoEngine) topoEngine.setProgress(parseFloat(state.progressPct));
      renderSplits(state.splits, state.currentMileIndex);

      if (state.currentMileIndex !== lastMileIndex) {
        if (lastMileIndex !== -1 && window.shredAudio) {
          window.shredAudio.playMilestone();
        }
        lastMileIndex = state.currentMileIndex;
        if (splitStatusBadge) {
          splitStatusBadge.textContent = state.distanceMiles >= 5.0 
            ? "SHRED COMPLETE" 
            : `MILE ${state.currentMileIndex + 1} ACTIVE`;
        }
      }
    });
  }

  function renderSplits(splits, currentMileIdx) {
    if (!splitsList) return;
    splitsList.innerHTML = '';
    splits.forEach((s, idx) => {
      const item = document.createElement('div');
      item.className = 'split-item';
      if (idx < currentMileIdx) item.classList.add('completed');
      else if (idx === currentMileIdx) item.classList.add('active');

      item.innerHTML = `
        <div class="split-info">
          <div class="split-info-title">${s.title}</div>
          <div class="split-info-desc">${s.note}</div>
        </div>
        <div class="split-stats">
          <div class="split-pace">${s.pace} /mi</div>
          <div class="split-hr">${s.hr} bpm</div>
        </div>
      `;
      splitsList.appendChild(item);
    });
  }

  // 10. Persistent Frontier AI Chat Feed
  const chatFeed = document.getElementById('chatFeed');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const modelSelector = document.getElementById('modelSelector');

  const BACKEND_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3017' 
    : 'https://unified.147-224-158-118.sslip.io';

  async function loadChatMessages() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/messages`);
      if (res.ok) {
        const msgs = await res.json();
        renderChat(msgs);
        return;
      }
    } catch (_) {}
    const saved = localStorage.getItem('unified_chat_history');
    if (saved) {
      renderChat(JSON.parse(saved));
    } else {
      renderChat([
        { author: 'B0 Singularity Core', model: 'core', text: '5 MILE RUN. SHRED SEASON. Ceiling lattice online. Singularity online.' }
      ]);
    }
  }

  function renderChat(messages) {
    if (!chatFeed) return;
    chatFeed.innerHTML = '';
    messages.forEach(m => {
      const row = document.createElement('div');
      row.style.lineHeight = '1.4';
      row.innerHTML = `<span style="color: ${m.model === 'user' ? '#00ffe6' : '#ff1e50'}; font-weight: 700;">[${m.author}]:</span> ${m.text}`;
      chatFeed.appendChild(row);
    });
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';

      const [provider, model] = (modelSelector ? modelSelector.value : 'groq:llama-3.3-70b-versatile').split(':');
      const userMsg = { author: 'You', model: 'user', text, timestamp: new Date().toISOString() };

      const currentMsgs = JSON.parse(localStorage.getItem('unified_chat_history') || '[]');
      currentMsgs.push(userMsg);
      renderChat(currentMsgs);

      try {
        const res = await fetch(`${BACKEND_URL}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ author: 'You', text, provider, model })
        });

        if (res.ok) {
          const data = await res.json();
          currentMsgs.push(data.ai);
          localStorage.setItem('unified_chat_history', JSON.stringify(currentMsgs));
          renderChat(currentMsgs);
          return;
        }
      } catch (_) {}

      const aiMsg = {
        author: `${provider.toUpperCase()} (${model})`,
        model: model,
        text: `Logged to Singularity: "${text}". Cadence accelerating.`,
        timestamp: new Date().toISOString()
      };
      currentMsgs.push(aiMsg);
      localStorage.setItem('unified_chat_history', JSON.stringify(currentMsgs));
      renderChat(currentMsgs);
    });
  }

  loadChatMessages();

  // Reset Button
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (telemetry) {
        telemetry.elapsedSeconds = 0;
        telemetry.distanceMiles = 0.00;
      }
      lastMileIndex = -1;
      if (topoEngine) topoEngine.setProgress(0);
      if (kineticEngine) kineticEngine.createParticlesFromText();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startUnifiedApp);
} else {
  startUnifiedApp();
}
