// Real-time Telemetry & Biometrics Simulator for 5 MILE RUN. SHRED SEASON.
class TelemetryEngine {
  constructor(updateCallback) {
    this.updateCallback = updateCallback;
    this.elapsedSeconds = 0;
    this.distanceMiles = 0.00;
    this.targetDistance = 5.00;
    this.heartRate = 142; // bpm
    this.targetHeartRate = 168;
    this.cadence = 176; // spm
    this.elevationGainFt = 0;
    this.caloriesBurned = 0;
    this.currentPaceSecPerMile = 420; // 7:00 / mi base pace
    this.timer = null;
    this.isRunning = true;
    this.overdrive = false;

    // Splits for the 5 miles
    this.splits = [
      { mile: 1, title: "MILE 1: IGNITE", pace: "6:54", hr: 154, note: "Cold start rhythm, legs warming up" },
      { mile: 2, title: "MILE 2: THE FLOW", pace: "6:42", hr: 162, note: "Breathing locked to 176 SPM cadence" },
      { mile: 3, title: "MILE 3: THE WALL", pace: "6:38", hr: 171, note: "Lactate threshold surge, hill crest" },
      { mile: 4, title: "MILE 4: BEAST MODE", pace: "6:25", hr: 178, note: "Accelerating down the spine" },
      { mile: 5, title: "MILE 5: SHRED SEASON", pace: "5:58", hr: 185, note: "Sprint finish into the void" }
    ];

    this.start();
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.isRunning) return;
      this.tick();
    }, 1000);
  }

  stop() {
    this.isRunning = false;
  }

  resume() {
    this.isRunning = true;
  }

  setOverdrive(val) {
    this.overdrive = val;
  }

  tick() {
    const timeDelta = this.overdrive ? 4 : 1;
    this.elapsedSeconds += timeDelta;

    // Advance distance
    const milesPerSec = 1 / (this.overdrive ? 320 : this.currentPaceSecPerMile);
    this.distanceMiles += milesPerSec * timeDelta;
    if (this.distanceMiles > this.targetDistance) {
      this.distanceMiles = this.targetDistance;
    }

    // Dynamic biometrics fluctuations
    const hrNoise = (Math.random() - 0.48) * 3;
    const targetHr = this.overdrive ? 188 : (150 + (this.distanceMiles / 5) * 32);
    this.heartRate = Math.round(Math.min(195, Math.max(130, this.heartRate + (targetHr - this.heartRate) * 0.08 + hrNoise)));

    this.cadence = Math.round(175 + (Math.random() - 0.5) * 6 + (this.overdrive ? 20 : 0));
    this.elevationGainFt = Math.round(this.distanceMiles * 68 + Math.sin(this.elapsedSeconds * 0.05) * 12);
    this.caloriesBurned = Math.round(this.distanceMiles * 124);

    if (this.updateCallback) {
      this.updateCallback(this.getState());
    }
  }

  getState() {
    const mins = Math.floor(this.elapsedSeconds / 60);
    const secs = this.elapsedSeconds % 60;
    const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    const paceMins = Math.floor(this.currentPaceSecPerMile / 60);
    const paceSecs = Math.floor(this.currentPaceSecPerMile % 60);
    const formattedPace = `${paceMins}'${String(paceSecs).padStart(2, '0')}"`;

    const progressPct = Math.min(100, (this.distanceMiles / this.targetDistance) * 100);

    // Current split milestone index
    const currentMileIndex = Math.min(4, Math.floor(this.distanceMiles));

    return {
      formattedTime,
      distanceMiles: this.distanceMiles.toFixed(2),
      targetDistance: this.targetDistance.toFixed(2),
      heartRate: this.heartRate,
      cadence: this.cadence,
      formattedPace,
      elevationGainFt: this.elevationGainFt,
      caloriesBurned: this.caloriesBurned,
      progressPct: progressPct.toFixed(1),
      currentMileIndex,
      splits: this.splits
    };
  }
}

window.TelemetryEngine = TelemetryEngine;
