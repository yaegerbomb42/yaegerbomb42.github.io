// Orchestrator for 5 MILE RUN. SHRED SEASON.
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Kinetic Canvas
  const kineticCanvas = document.getElementById('kineticCanvas');
  const kineticEngine = new KineticTextEngine(kineticCanvas);

  // Initialize Topo Elevation Radar
  const topoCanvas = document.getElementById('topoCanvas');
  const topoEngine = new TopoEngine(topoCanvas);

  // Audio Toggle
  const audioBtn = document.getElementById('audioToggleBtn');
  const audioLabel = document.getElementById('audioLabel');
  const audioIcon = document.getElementById('audioIcon');
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

  // Theme Switcher (Cyber -> Solar -> Gold)
  const themes = ['cyber', 'solar', 'gold'];
  let currentThemeIdx = 0;
  const themeBtn = document.getElementById('themeToggleBtn');
  const themeLabel = document.getElementById('themeLabel');
  themeBtn.addEventListener('click', () => {
    currentThemeIdx = (currentThemeIdx + 1) % themes.length;
    const nextTheme = themes[currentThemeIdx];
    document.body.setAttribute('data-theme', nextTheme);
    themeLabel.textContent = `THEME: ${nextTheme.toUpperCase()}`;
    kineticEngine.mode = nextTheme;
  });

  // Overdrive Mode (Hold Space or button)
  const overdriveBtn = document.getElementById('overdriveBtn');
  let isOverdrive = false;

  function activateOverdrive() {
    if (isOverdrive) return;
    isOverdrive = true;
    overdriveBtn.classList.add('active');
    kineticEngine.setOverdrive(true);
    telemetry.setOverdrive(true);
    window.shredAudio.triggerOverdriveSweep();
    window.shredAudio.setCadence(195);
  }

  function deactivateOverdrive() {
    if (!isOverdrive) return;
    isOverdrive = false;
    overdriveBtn.classList.remove('active');
    kineticEngine.setOverdrive(false);
    telemetry.setOverdrive(false);
    window.shredAudio.setCadence(176);
  }

  overdriveBtn.addEventListener('mousedown', activateOverdrive);
  window.addEventListener('mouseup', deactivateOverdrive);
  overdriveBtn.addEventListener('touchstart', (e) => { e.preventDefault(); activateOverdrive(); });
  window.addEventListener('touchend', deactivateOverdrive);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      activateOverdrive();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      deactivateOverdrive();
    }
  });

  // DOM Metrics References
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

  // Initialize Telemetry Engine
  const telemetry = new TelemetryEngine((state) => {
    // Update DOM numbers
    metricDistance.innerHTML = `${state.distanceMiles} <small>MI</small>`;
    metricTime.textContent = state.formattedTime;
    metricPace.innerHTML = `${state.formattedPace} <small>/MI</small>`;
    metricHeartRate.innerHTML = `${state.heartRate} <small>BPM</small>`;
    metricCadence.innerHTML = `${state.cadence} <small>SPM</small>`;
    metricElevation.innerHTML = `${state.elevationGainFt} <small>FT</small>`;
    metricCalories.innerHTML = `${state.caloriesBurned} <small>KCAL</small>`;

    // Lactate calculation based on heart rate
    const lactate = ((state.heartRate - 120) * 0.08 + 1.2).toFixed(1);
    metricLactate.innerHTML = `${lactate} <small>MMOL</small>`;

    progressFill.style.width = `${state.progressPct}%`;
    hudStatus.textContent = isOverdrive 
      ? `OVERDRIVE // CADENCE ${state.cadence}` 
      : `LIVE // CADENCE ${state.cadence}`;

    // Update Topo engine
    topoEngine.setProgress(parseFloat(state.progressPct));

    // Render Splits
    renderSplits(state.splits, state.currentMileIndex);

    // Audio chime on new mile milestone
    if (state.currentMileIndex !== lastMileIndex) {
      if (lastMileIndex !== -1) {
        window.shredAudio.playMilestone();
      }
      lastMileIndex = state.currentMileIndex;
      splitStatusBadge.textContent = state.distanceMiles >= 5.0 
        ? "SHRED COMPLETE" 
        : `MILE ${state.currentMileIndex + 1} ACTIVE`;
    }
  });

  function renderSplits(splits, currentMileIdx) {
    splitsList.innerHTML = '';
    splits.forEach((s, idx) => {
      const item = document.createElement('div');
      item.className = 'split-item';
      if (idx < currentMileIdx) {
        item.classList.add('completed');
      } else if (idx === currentMileIdx) {
        item.classList.add('active');
      }

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

  // Reset Button
  document.getElementById('resetBtn').addEventListener('click', () => {
    telemetry.elapsedSeconds = 0;
    telemetry.distanceMiles = 0.00;
    lastMileIndex = -1;
    topoEngine.setProgress(0);
    kineticEngine.createParticlesFromText();
  });
});
