// Star-Rider - Procedural Web Audio Synthwave Music Synthesizer & Adaptive Audio Engine
// Exposed on window so other modules + the test harness can reach the Proxy
// (game.js references the global `AudioSys` everywhere; without this, fresh
// sandboxes have no handle for direct SFX assertions).
window.AudioSys = (() => {
  let ctx = null;
  let masterGain = null, sfxGain = null, musicGain = null;
  let sidechainGain = null, musicFilter = null;
  let muted = false;

  let masterVolVal = 0.8, sfxVolVal = 0.8, musicVolVal = 0.5;

  // Adaptive Music Sequencer State
  let musicTimer = null;
  let step = 0;
  let BPM = 128;
  let stepDur = 60 / BPM / 4; // 16th notes
  let currentIntensity = 0.0; // 0.0 = calm/ambient, 0.5 = swarm, 1.0 = boss
  let targetIntensity = 0.0;
  let bossMode = false;
  let lowHpMode = false; // sub-30% HP danger flutter layer
  let beatPulse = 0.0; // [0..1] decays over time for UI / visual sync
  let beatCallbacks = [];

  // WS-8 adaptive combo sub-bass state (fed by game.js via setCombo)
  let comboLevel = 0;      // raw combo count from gameplay
  let comboIntensity = 0;  // smoothed 0..1 drive for sub-bass layer

  // MIDI note pitch calculation helper
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // --- Synthwave Scales & Chords ---
  // Progression 1 (Ambient Baseline): Am -> F -> C -> G
  const CHORDS_AMBIENT = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 52, 55], // C
    [55, 59, 62]  // G
  ];

  // Progression 2 (Horde Swarm): Am -> F -> Dm -> Em
  const CHORDS_SWARM = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [50, 53, 57], // Dm
    [52, 55, 59]  // Em
  ];

  // Progression 3 (Boss Fight Drive): Am -> Dm -> F -> E7
  const CHORDS_BOSS = [
    [57, 60, 64], // Am
    [50, 53, 57], // Dm
    [53, 57, 60], // F
    [52, 56, 59]  // E7 (high chromatic tension)
  ];

  const BASS_AMBIENT = [45, 41, 36, 43]; // A1, F1, C1, G1
  const BASS_SWARM   = [45, 41, 38, 40]; // A1, F1, D1, E1
  const BASS_BOSS    = [45, 38, 41, 40]; // A1, D1, F1, E1

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();

      // Node Graph Construction
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : masterVolVal;
      masterGain.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = sfxVolVal;
      sfxGain.connect(masterGain);

      musicGain = ctx.createGain();
      musicGain.gain.value = musicVolVal * 0.45;

      // Music Master Bus Lowpass Filter (Dynamic cutoff sweep with intensity)
      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = 1800;
      musicFilter.Q.value = 2.5;

      // Sidechain Ducking Gain Node (Iconic synthwave pumping effect)
      sidechainGain = ctx.createGain();
      sidechainGain.gain.value = 1.0;

      // Connect music chain: sidechainGain -> musicFilter -> musicGain -> masterGain
      sidechainGain.connect(musicFilter);
      musicFilter.connect(musicGain);
      musicGain.connect(masterGain);

      startMusic();
    } catch (e) {
      console.warn("AudioContext init error:", e);
    }
  }

  function setMasterVolume(v) {
    masterVolVal = Math.max(0, Math.min(1, v));
    if (masterGain && ctx) masterGain.gain.setValueAtTime(muted ? 0 : masterVolVal, ctx.currentTime);
  }

  function setSfxVolume(v) {
    sfxVolVal = Math.max(0, Math.min(1, v));
    if (sfxGain && ctx) sfxGain.gain.setValueAtTime(sfxVolVal, ctx.currentTime);
  }

  function setMusicVolume(v) {
    musicVolVal = Math.max(0, Math.min(1, v));
    if (musicGain && ctx) musicGain.gain.setValueAtTime(musicVolVal * 0.45, ctx.currentTime);
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain && ctx) masterGain.gain.setValueAtTime(muted ? 0 : masterVolVal, ctx.currentTime);
    return muted;
  }

  function isMuted() { return muted; }

  function resume() {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  // --- Dynamic Intensity API ---
  function setBossMode(on) {
    bossMode = !!on;
    targetIntensity = bossMode ? 1.0 : Math.min(targetIntensity, 0.7);
  }

  function setIntensity(lvl) {
    if (bossMode) { targetIntensity = 1.0; return; }
    targetIntensity = Math.max(0.0, Math.min(1.0, lvl));
  }

  function updateIntensity(enemyCount, isBossActive, lowHp) {
    if (isBossActive) {
      bossMode = true;
      targetIntensity = 1.0;
      lowHpMode = false;
    } else {
      bossMode = false;
      // Smooth scaling based on active enemy count: 0 enemies -> 0.0, 20 -> 0.4, 45+ -> 0.85
      targetIntensity = Math.min(0.85, (enemyCount || 0) / 45);
      // Danger flutter: subtle fast pulse layer when the player is nearly dead
      lowHpMode = !!lowHp;
    }
  }

  // --- Adaptive Beat Sync API ---
  function getBeatPulse() { return beatPulse; }
  function onBeat(fn) { if (typeof fn === 'function') beatCallbacks.push(fn); }

  // WS-8: feed live combo count (game.js owns the counter; audio only reads it)
  function setCombo(n) { comboLevel = Math.max(0, Math.min(500, n | 0)); }

  // --- Music Sequencer Engine ---
  function startMusic() {
    if (musicTimer || !ctx) return;
    BPM = 128;
    stepDur = 60 / BPM / 4; // 16th notes (0.117s)
    let nextTime = ctx.currentTime + 0.1;

    musicTimer = setInterval(() => {
      if (!ctx) return;
      if (ctx.state === 'suspended') return;

      // Smooth intensity interpolation
      currentIntensity += (targetIntensity - currentIntensity) * 0.08;

      // WS-8: smoothed combo drive — 0 at combo<10, ramps to 1.0 at 100+
      const comboTarget = Math.max(0, Math.min(1, (comboLevel - 10) / 90));
      comboIntensity += (comboTarget - comboIntensity) * 0.06;

      // Update Filter Cutoff on Music Bus (1200Hz in ambient -> 7500Hz in intense boss mode)
      if (musicFilter) {
        const targetCutoff = 1200 + currentIntensity * 6300 + comboIntensity * 2500;
        musicFilter.frequency.setTargetAtTime(targetCutoff, ctx.currentTime, 0.1);
      }

      // Decaying Beat Pulse for UI sync
      beatPulse = Math.max(0, beatPulse - 0.05);

      // Schedule steps ahead into Web Audio context buffer
      while (nextTime < ctx.currentTime + 0.2) {
        if (!muted) {
          scheduleStep(step, nextTime, stepDur);
        }
        step++;
        nextTime += stepDur;
      }
    }, 25);
  }

  function triggerSidechain(t) {
    if (!sidechainGain || !ctx) return;
    // Iconic synthwave pumping duck: rapid drop to 0.35, then exponential ramp back to 1.0
    sidechainGain.gain.cancelScheduledValues(t);
    sidechainGain.gain.setValueAtTime(0.35, t);
    sidechainGain.gain.exponentialRampToValueAtTime(1.0, t + 0.18);
  }

  function scheduleStep(s, t, dur) {
    const measure = Math.floor(s / 16);
    const bar = measure % 4; // 4-bar chord progression
    const pos16 = s % 16;     // 16th note position in measure

    const isBoss = currentIntensity > 0.85 || bossMode;
    const isSwarm = currentIntensity > 0.35 && !isBoss;

    const chords = isBoss ? CHORDS_BOSS : (isSwarm ? CHORDS_SWARM : CHORDS_AMBIENT);
    const bassline = isBoss ? BASS_BOSS : (isSwarm ? BASS_SWARM : BASS_AMBIENT);
    const chord = chords[bar];
    const rootMidi = bassline[bar];

    // Trigger Beat Pulse on Quarter Notes (pos16 % 4 === 0)
    if (pos16 % 4 === 0) {
      beatPulse = 1.0;
      beatCallbacks.forEach(fn => { try { fn(s, t); } catch(e){} });
    }

    // --- 1. BEAT DRUMS / PERCUSSION ---
    // Kick: Four on the floor for Boss & Swarm; beats 0 & 8 for Ambient
    const playKickBeat = isBoss ? (pos16 % 4 === 0) : (isSwarm ? (pos16 % 4 === 0 || (pos16 === 14 && Math.random() < 0.4)) : (pos16 === 0 || pos16 === 8));
    if (playKickBeat) {
      playKick(t);
      triggerSidechain(t);
    }

    // Snare: Beats 4 & 12 (i.e. beats 2 & 4 of measure) in Swarm & Boss
    if (isBoss || isSwarm) {
      if (pos16 === 4 || pos16 === 12) {
        playSnare(t, isBoss ? 0.35 : 0.25);
      } else if (isBoss && pos16 === 15) {
        playSnare(t, 0.18);
      }
    }

    // Hi-Hats: 8ths for Ambient, 16ths for Swarm/Boss
    if (isBoss || isSwarm) {
      if (pos16 % 2 === 0) {
        playHat(t, 0.05, false); // closed hat
      } else {
        playHat(t, 0.035, pos16 === 10 || pos16 === 14); // open hat decay on offbeats
      }
    } else if (pos16 % 4 === 2) {
      playHat(t, 0.03, false);
    }

    // Tom / Crash fills on measure changes
    if (pos16 === 0 && measure % 4 === 0 && (isSwarm || isBoss)) {
      playCrash(t, isBoss ? 0.25 : 0.15);
    }

    // Low-HP danger flutter: fast eighth-note pulse so the mix itself panics
    if (lowHpMode && !isBoss && pos16 % 2 === 0) {
      playPulseBlip(t);
    }

    // --- 2. RETRO SYNTH BASSLINE ---
    // Ambient: gentle pulsing 8th notes on root
    // Swarm: 16th rolling synth bass with octave accents
    // Boss: Aggressive dual-oscillator 16th octave sawtooth bass with sharp lowpass envelope filter decay
    if (isBoss) {
      const oct = (pos16 % 2 === 1) ? 12 : 0;
      const f = mf(rootMidi - 12 + oct);
      playSynthBass(f, t, dur * 0.85, 'sawtooth', 0.28, true);
    } else if (isSwarm) {
      if (pos16 % 2 === 0 || pos16 % 4 === 3) {
        const oct = (pos16 % 4 === 2) ? 12 : 0;
        const f = mf(rootMidi - 12 + oct);
        playSynthBass(f, t, dur * 0.9, 'sawtooth', 0.22, false);
      }
    } else {
      if (pos16 % 2 === 0) {
        const f = mf(rootMidi - 12);
        playSynthBass(f, t, dur * 1.5, 'triangle', 0.18, false);
      }
    }

    // --- 2b. WS-8 COMBO SUB-BASS LAYER ---
    // Thicker 16th-note tunnel as combo rises (8ths at low drive, doubles at high)
    const subDiv = comboIntensity >= 0.85 ? 1 : (comboIntensity >= 0.45 ? 2 : 4);
    if (comboIntensity > 0.02 && pos16 % subDiv === 0) {
      const accent = comboIntensity > 0.7 && pos16 % 8 === 7 ? 3 : 0; // tritone tension at high combo
      const fSub = mf(rootMidi - 24 + accent);
      const volSub = 0.05 + comboIntensity * 0.13;
      playSubBass(fSub, t, dur * 1.1, volSub, 220 + comboIntensity * 1600);
    }

    // --- 3. SYNTH ARPEGGIOS ---
    // Multi-octave synthwave arpeggio patterns
    const arpNotes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24, chord[1] + 24, chord[2] + 24];
    if (isBoss) {
      const pattern = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 3, 2, 4, 1, 3];
      const noteMidi = arpNotes[pattern[pos16] % arpNotes.length];
      playSynthArp(mf(noteMidi), t, dur * 0.8, 'square', 0.08, true);
    } else if (isSwarm) {
      const pattern = [0, 2, 1, 3, 0, 2, 4, 2];
      const noteMidi = arpNotes[pattern[pos16 % 8] % arpNotes.length];
      playSynthArp(mf(noteMidi), t, dur * 0.7, 'sawtooth', 0.06, false);
    } else {
      if (pos16 % 2 === 0) {
        const pattern = [0, 1, 2, 1];
        const noteMidi = arpNotes[pattern[(pos16 / 2) % 4]];
        playSynthArp(mf(noteMidi), t, dur * 1.2, 'sine', 0.045, false);
      }
    }

    // --- 4. ATMOSPHERIC SYNTH PADS ---
    // Sustained chord pads on measure start
    if (pos16 === 0) {
      const padVol = isBoss ? 0.04 : (isSwarm ? 0.035 : 0.03);
      chord.forEach((n, idx) => {
        playSynthPad(mf(n), t, dur * 15, idx === 0 ? 'sawtooth' : 'sine', padVol);
      });
    }
  }

  // --- Sound Generation Helpers ---

  function playKick(t) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.11);

    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    o.connect(g);
    g.connect(sidechainGain);
    o.start(t);
    o.stop(t + 0.14);
  }

  function playSnare(t, vol) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    og.gain.setValueAtTime(vol * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og); og.connect(sidechainGain);
    o.start(t); o.stop(t + 0.1);

    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2200;
    f.Q.value = 1.2;

    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    src.connect(f); f.connect(ng); ng.connect(sidechainGain);
    src.start(t);
  }

  function playHat(t, vol, isOpen) {
    if (!ctx) return;
    const dur = isOpen ? 0.12 : 0.04;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, isOpen ? 1.5 : 3.0);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(f); f.connect(g); g.connect(sidechainGain);
    src.start(t);
  }

  function playCrash(t, vol) {
    if (!ctx) return;
    const dur = 0.6;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.0);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 5000;
    f.Q.value = 0.5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(f); f.connect(g); g.connect(sidechainGain);
    src.start(t);
  }

  // Low-HP danger flutter: quiet square blip with a fast gain tremolo (~7.7Hz,
  // one cycle per 16th at 128 BPM) so the mix feels urgent without new drums.
  function playPulseBlip(t) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(98, t);
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(7.7, t);
    lfoGain.gain.setValueAtTime(0.05, t);
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    g.gain.setValueAtTime(0.015, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g); g.connect(sidechainGain);
    o.start(t); o.stop(t + 0.1);
    lfo.start(t); lfo.stop(t + 0.1);
  }

  function playSynthBass(freq, t, dur, type, vol, isAggressive) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const startFreq = isAggressive ? 2800 : 1400;
    f.frequency.setValueAtTime(startFreq, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    f.Q.value = isAggressive ? 4.5 : 2.0;

    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    o.connect(f); f.connect(g); g.connect(sidechainGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // WS-8: dedicated sub-bass voice — pure sine fundamental with sharp lowpass
  // envelope; cutoff scales with combo drive so streak highs physically open up
  function playSubBass(freq, t, dur, vol, cutoff) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(90, t + dur);
    f.Q.value = 1.5;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(sidechainGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function playSynthArp(freq, t, dur, type, vol, isBright) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(isBright ? 5500 : 2500, t);
    f.frequency.exponentialRampToValueAtTime(800, t + dur);
    f.Q.value = 3.0;

    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    o.connect(f); f.connect(g); g.connect(sidechainGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function playSynthPad(freq, t, dur, type, vol) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);

    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    o.connect(g); g.connect(sidechainGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // --- Sound Effects ---
  function beep(freq, dur, type, vol, delay, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, delay) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t);
  }

  const SFX_MAP = {
    shoot()      { beep(880, 0.08, 'square', 0.05, 0, 660); },
    shoot2()     { beep(1320, 0.06, 'square', 0.04, 0, 880); },
    saw()        { beep(220, 0.05, 'sawtooth', 0.03, 0, 330); },
    nova()       { beep(150, 0.35, 'sawtooth', 0.15, 0, 1200); noise(0.25, 0.12, 1500); },
    tesla()      { beep(1800, 0.12, 'square', 0.08, 0, 300); noise(0.08, 0.06, 5000); },
    hit()        { noise(0.06, 0.08, 3000); },
    enemyDie()   { beep(440, 0.12, 'square', 0.09, 0, 110); noise(0.1, 0.1, 1200); },
    eliteDie()   { beep(330, 0.25, 'square', 0.14, 0, 55); noise(0.2, 0.15, 800); },
    gem()        { beep(988, 0.06, 'sine', 0.09); beep(1319, 0.09, 'sine', 0.09, 0.05); },
    heart()      { beep(523, 0.1, 'sine', 0.12); beep(784, 0.15, 'sine', 0.12, 0.08); },
    chest()      { [523,659,784,1047].forEach((f,i)=>beep(f, 0.15, 'square', 0.1, i*0.08)); },
    levelup()    { [523.25, 659.25, 784].forEach((f,i)=>beep(f, 0.12, 'square', 0.11, i*0.12)); }, // WS-F: C5-E5-G5 major-pentatonic triad, 0.4s total
    hurt()       { beep(220, 0.15, 'sawtooth', 0.2, 0, 110); noise(0.12, 0.15, 900); },
    shockwave()  { beep(100, 0.5, 'sawtooth', 0.2, 0, 30); noise(0.4, 0.18, 500); },
    gameover()   { [440,415,392,330,262,196].forEach((f,i)=>beep(f, 0.3, 'sawtooth', 0.12, i*0.22)); },
    victory()    { [523,659,784,1047,1319,1568].forEach((f,i)=>beep(f, 0.25, 'square', 0.12, i*0.15)); },
    bossRoar()   { beep(80, 0.8, 'sawtooth', 0.25, 0, 45); noise(0.6, 0.2, 300); },
    bossWarn()   { beep(220, 0.3, 'square', 0.15); beep(220, 0.3, 'square', 0.15, 0.4); },
    dash()       { beep(600, 0.12, 'sine', 0.1, 0, 1200); },
    magnet()     { beep(440, 0.2, 'sine', 0.08, 0, 1760); },
    snipe()      { beep(1200, 0.06, 'square', 0.05, 0, 300); },
    combo()      { [660, 880, 1109].forEach((f, i) => beep(f, 0.09, 'square', 0.08, i * 0.04)); },
    lance()      { beep(80, 0.4, 'sawtooth', 0.22, 0, 1600); noise(0.18, 0.18, 2500); },
    drone()      { beep(500, 0.1, 'triangle', 0.07, 0, 1200); },
    frost()      { beep(1800, 0.08, 'sine', 0.04, 0, 400); noise(0.05, 0.03, 6000); },
    prism()      { beep(1567, 0.07, 'triangle', 0.06, 0, 2093); beep(1175, 0.09, 'sine', 0.05, 0.04, 1567); noise(0.04, 0.03, 8000); },
    milestone()  { [440, 587, 880, 1175].forEach((f, i) => beep(f, 0.18, 'square', 0.12, i * 0.09)); },
    evolve()     { [330, 415, 494, 659, 830, 988].forEach((f, i) => beep(f, 0.16, 'sawtooth', 0.1, i * 0.05)); noise(0.5, 0.12, 3000); },
    shatter()    { beep(1400, 0.08, 'sine', 0.08, 0, 300); noise(0.1, 0.1, 4000); },
    burnDoT()    { noise(0.04, 0.04, 2200); beep(120, 0.06, 'sawtooth', 0.03, 0, 60); },
    shockChain() { beep(1600, 0.05, 'square', 0.04, 0, 800); noise(0.04, 0.04, 6000); },
    freezeApply(){ beep(2200, 0.08, 'sine', 0.04, 0, 1100); },
    voidDecay()  { beep(90, 0.12, 'sawtooth', 0.07, 0, 45); noise(0.06, 0.05, 1000); },
    // --- Dopamine juice pack (7.1) ---
    crit()       { beep(2400, 0.05, 'square', 0.05, 0, 3600); noise(0.04, 0.035, 7000); },
    comboUp(tier){ const semis = [0, 4, 7, 12, 16, 19][clampJuiceTier(tier)]; [660 * st(semis), 990 * st(semis)].forEach((f, i) => beep(f, 0.1, 'square', 0.08, i * 0.05)); },
    levelupChord(){ [523.25, 659.25, 784, 1046.5].forEach((f, i) => beep(f, 0.15, 'square', 0.09, i * 0.07)); noise(0.2, 0.06, 5000, 0.05); },
    gemVacuum(_v, pitch)  { if (!_gate('vacuum', 30)) return; const p = clampVacPitch(pitch); const f = 660 * st(_vacStep) * p; _vacStep = (_vacStep + 1) % 12; beep(f, 0.06, 'sine', 0.09, 0, f * 1.19); }, // WS-F tick + WS-6 pitch ramp (absorb-rate scaled)
    enemyLatch() { beep(95, 0.18, 'sine', 0.11, 0, 42); beep(130, 0.12, 'sine', 0.07, 0.09, 70); noise(0.08, 0.05, 500, 0.02); noise(0.05, 0.05, 700, 0.1); },
    webSnare()   { beep(920, 0.08, 'triangle', 0.06, 0, 460); beep(690, 0.09, 'triangle', 0.045, 0.02, 345); },
    overkill()   { if (!_gate('overkill', 100)) return; beep(80, 0.3, 'sine', 0.32, 0, 40); noise(0.22, 0.2, 900); [1568, 2093].forEach((f, i) => beep(f, 0.05, 'square', 0.04, i * 0.04)); },
    milestoneBig(){ [440, 587, 880, 1175, 1760].forEach((f, i) => beep(f, 0.2, 'square', 0.12, i * 0.08)); noise(0.35, 0.1, 3000, 0.1); },
    // --- WS-F dopamine pack ---
    kill(tier)   { if (!_gate('kill', 45)) return; const f = 220 * (1 + 0.25 * Math.max(0, Math.min(4, tier | 0))); beep(f * 2, 0.05, 'square', 0.11, 0, f); noise(0.03, 0.06, 4000); },
    phantomBlink(){ if (!_gate('blink', 60)) return; noise(0.2, 0.12, 600); noise(0.12, 0.05, 2400); beep(900, 0.12, 'sine', 0.04, 0, 220); },
    weaverWeb()  { beep(660, 0.15, 'triangle', 0.08, 0, 495); beep(330, 0.1, 'sine', 0.05, 0.01, 247); },
    splitterSplit(){ beep(300, 0.15, 'square', 0.12, 0, 620); beep(150, 0.08, 'sine', 0.1, 0, 90); },
    // --- WS-8: Dynamic Bass Synth & Impact Audio Pack ---
    dodgeStun() { if (!_gate('dodgeStun', 90)) return; subDrop(); },
    feverStart() { if (!_gate('feverStart', 250)) return; feverBurst(); },
    shrinePact() { if (!_gate('shrinePact', 400)) return; voidDrone(); }
  };

  // WS-8: pitch-down sub-bass drop — dodge-cancel stun impact
  function subDrop() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(22, t + 0.38);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.38, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.42);
    noise(0.14, 0.1, 900);
  }

  // WS-8: high-energy arpeggiated synth chord burst — Neon Fever trigger
  function feverBurst() {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    [57, 60, 64, 69, 72].forEach((n, i) => { // Am pentatonic stack A3-A5
      const f = mf(n);
      beep(f, 0.09, 'sawtooth', 0.07, i * 0.045, f);
      beep(f * 2, 0.06, 'square', 0.03, i * 0.045);
    });
    beep(mf(81), 0.5, 'sawtooth', 0.09, 0.24); // A5 sustain tail
  }

  // WS-8: dark resonant void drone — shrine pact accepted
  function voidDrone() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const dur = 1.4;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sine';
    o.frequency.setValueAtTime(mf(33), t);  // A1
    o2.frequency.setValueAtTime(mf(28), t); // E1 sub-anchor
    o.frequency.linearRampToValueAtTime(mf(32), t + dur);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(140, t);
    f.frequency.exponentialRampToValueAtTime(900, t + dur * 0.5);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    f.Q.value = 8; // resonant void body
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.12);
    g.gain.setValueAtTime(0.2, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
    o2.start(t); o2.stop(t + dur + 0.05);
  }

  let _vacStep = 0; // gemVacuum 12-step chromatic cycle — pickup streaks sound musical
  function clampJuiceTier(t) { return Math.max(0, Math.min(5, (t | 0) - 1)); }
  function clampVacPitch(p) { return (typeof p === 'number' && isFinite(p)) ? Math.max(0.5, Math.min(2.5, p)) : 1; }
  function st(semis) { return Math.pow(2, semis / 12); }

  // Throttle gate for high-frequency SFX (kill/overkill/blink): at most one play
  // per key per `ms` window so kill-storms can't stack dozens of nodes a frame.
  const _gateAt = {};
  function _gate(key, ms) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const last = _gateAt[key] ?? -1e9; // ?? not ||: a stamp of exactly 0 (frozen clocks in tests) is falsy but valid
    if (now - last < ms) return false;
    _gateAt[key] = now;
    return true;
  }

  // Defensive Proxy for SFX: Any missing SFX method call falls back gracefully
  const SFX = new Proxy(SFX_MAP, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return function fallbackSFX() {
        beep(440, 0.05, 'sine', 0.05);
      };
    }
  });

  return {
    init,
    resume,
    toggleMute,
    isMuted,
    setMasterVolume,
    setSfxVolume,
    setMusicVolume,
    SFX,
    setBossMode,
    setIntensity,
    updateIntensity,
    getBeatPulse,
    onBeat,
    setCombo
  };
})();
