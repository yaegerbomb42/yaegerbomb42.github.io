// Audio Synthesis Engine for 5 MILE RUN: SHRED SEASON
// Generates real-time runner cadence pulses (175 BPM), heartbeat kicks, riser sweeps, and milestone synth chimes
class ShredAudio {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.bpm = 175;
    this.stepInterval = null;
    this.currentStep = 0;
    this.masterGain = null;
    this.isMuted = false;
    this.volume = 0.4;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  toggle() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
    return this.isPlaying;
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    const intervalMs = (60 / this.bpm) * 1000 / 2; // eighth notes
    this.stepInterval = setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  stop() {
    this.isPlaying = false;
    if (this.stepInterval) {
      clearInterval(this.stepInterval);
      this.stepInterval = null;
    }
  }

  setCadence(bpm) {
    this.bpm = Math.min(220, Math.max(140, bpm));
    if (this.isPlaying) {
      this.stop();
      this.start();
    }
  }

  tick() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const step = this.currentStep % 16;
    this.currentStep++;

    // Heartbeat / Sub Kick on steps 0, 4, 8, 12
    if (step % 4 === 0) {
      this.playKick(t, step === 0 ? 68 : 54);
    }

    // Hi-hat / footfall grit on alternate steps
    if (step % 2 === 1) {
      this.playFootfall(t);
    }

    // Cyber synth bass pulse on 16th grid
    if ([0, 3, 6, 8, 11, 14].includes(step)) {
      this.playBassStab(t, step);
    }
  }

  playKick(time, freq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(15, time + 0.16);

    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  playFootfall(time) {
    // Noise buffer foot impact
    const bufferSize = this.ctx.sampleRate * 0.04;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, time);
    filter.Q.setValueAtTime(3, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
  }

  playBassStab(time, step) {
    const notes = [44, 44, 49, 52, 55, 59];
    const root = notes[step % notes.length];
    const freq = 440 * Math.pow(2, (root - 69) / 12);

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.frequency.exponentialRampToValueAtTime(300, time + 0.12);

    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  playMilestone() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const chords = [523.25, 659.25, 783.99, 1046.50]; // C Major arpeggio shimmer
    chords.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);
      gain.gain.setValueAtTime(0.3, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.6);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.65);
    });
  }

  triggerOverdriveSweep() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.4);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.48);
  }
}

window.shredAudio = new ShredAudio();
