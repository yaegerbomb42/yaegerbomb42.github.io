// High-Energy Web Audio Cyber-Techno & Synthwave Music Generator
// Infinite looping driving bassline, kick drum, offbeat hi-hats, arpeggiated synths, and riser sweeps
class HighEnergySoundtrack {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.bpm = 174;
    this.step = 0;
    this.timer = null;
    this.masterGain = null;
    this.filter = null;
    this.isOverdrive = false;

    // Cyberpunk minor scale arpeggio notes (F minor / C minor dark drive)
    this.bassNotes = [34.65, 34.65, 38.89, 43.65, 34.65, 34.65, 41.20, 46.25]; // C# / F roots
    this.synthNotes = [
      174.61, 207.65, 261.63, 311.13, 349.23, 415.30, 523.25, 622.25
    ];
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // Master bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.45, this.ctx.currentTime);

    // Global resonant lowpass filter
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(2200, this.ctx.currentTime);
    this.filter.Q.setValueAtTime(4, this.ctx.currentTime);

    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  start() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.isPlaying) return;
    this.isPlaying = true;

    // 16th note timing clock
    const stepTimeMs = (60 / this.bpm / 4) * 1000;
    this.timer = setInterval(() => this.tick(), stepTimeMs);
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  toggle() {
    if (this.isPlaying) this.stop();
    else this.start();
    return this.isPlaying;
  }

  setOverdrive(val) {
    this.isOverdrive = val;
    if (!this.ctx || !this.filter) return;
    const t = this.ctx.currentTime;
    if (val) {
      this.filter.frequency.setTargetAtTime(8000, t, 0.1);
      this.bpm = 192;
    } else {
      this.filter.frequency.setTargetAtTime(2200, t, 0.2);
      this.bpm = 174;
    }
  }

  tick() {
    if (!this.ctx || !this.isPlaying) return;
    const t = this.ctx.currentTime;
    const s = this.step % 16;
    this.step++;

    // 1. Kick on every beat (0, 4, 8, 12)
    if (s % 4 === 0) {
      this.playKick(t);
    }

    // 2. Snare / Clap on beats 4 and 12
    if (s === 4 || s === 12) {
      this.playSnare(t);
    }

    // 3. Fast offbeat 16th Hi-Hats
    if (s % 2 === 1) {
      this.playHiHat(t, s % 4 === 2 ? 0.25 : 0.12);
    }

    // 4. Heavy Rolling Sub-Bass (Driving 16th groove)
    if ([0, 2, 3, 6, 8, 10, 11, 14].includes(s)) {
      const noteIdx = Math.floor(this.step / 8) % this.bassNotes.length;
      const freq = this.bassNotes[noteIdx];
      this.playRollingBass(t, freq);
    }

    // 5. Arpeggiator Melody
    if (s % 2 === 0) {
      const arpNote = this.synthNotes[(this.step + (s > 8 ? 2 : 0)) % this.synthNotes.length];
      this.playArpLead(t, arpNote);
    }
  }

  playKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);

    gain.gain.setValueAtTime(0.85, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.24);
  }

  playSnare(time) {
    // Noise burst + mid tone
    const bufferSize = this.ctx.sampleRate * 0.12;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    noise.connect(noiseFilter);
    noiseFilter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
  }

  playHiHat(time, vol) {
    const bufferSize = this.ctx.sampleRate * 0.04;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * (this.isOverdrive ? 1.5 : 1.0), time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
  }

  playRollingBass(time, freq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const subFilter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(320, time);
    subFilter.frequency.exponentialRampToValueAtTime(140, time + 0.1);

    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);

    osc.connect(subFilter);
    subFilter.connect(gain);
    gain.connect(this.filter);

    osc.start(time);
    osc.stop(time + 0.14);
  }

  playArpLead(time, freq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(gain);
    gain.connect(this.filter);

    osc.start(time);
    osc.stop(time + 0.11);
  }
}

window.highEnergyMusic = new HighEnergySoundtrack();
