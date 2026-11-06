// Topographic Elevation Radar & 5-Mile GPS Course Visualizer
class TopoEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width = canvas.offsetWidth;
    this.height = canvas.height = canvas.offsetHeight;
    this.progress = 0;
    this.points = [];
    this.generateCoursePoints();
    this.render = this.render.bind(this);
    window.addEventListener('resize', () => {
      this.width = this.canvas.width = this.canvas.offsetWidth;
      this.height = this.canvas.height = this.canvas.offsetHeight;
    });
  }

  generateCoursePoints() {
    this.points = [];
    const totalPoints = 120;
    for (let i = 0; i <= totalPoints; i++) {
      const t = i / totalPoints;
      // Procedural elevation profile: starts flat, climb mile 2-3, ridge mile 4, descent & sprint mile 5
      const elevation = Math.sin(t * Math.PI) * 0.45 
        + Math.sin(t * Math.PI * 4) * 0.15 
        + (t > 0.6 ? (t - 0.6) * 0.4 : 0);
      this.points.push({ t, elevation });
    }
  }

  setProgress(pct) {
    this.progress = Math.min(1.0, Math.max(0, pct / 100));
  }

  render() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);

    const padX = 20;
    const padY = 24;
    const plotW = this.width - padX * 2;
    const plotH = this.height - padY * 2;

    // Grid lines & topo levels
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    this.ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = padY + (plotH / 3) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(padX, y);
      this.ctx.lineTo(this.width - padX, y);
      this.ctx.stroke();
    }

    // Mile tick marks (0 to 5)
    for (let m = 0; m <= 5; m++) {
      const x = padX + (plotW / 5) * m;
      this.ctx.beginPath();
      this.ctx.moveTo(x, padY);
      this.ctx.lineTo(x, this.height - padY);
      this.ctx.stroke();

      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      this.ctx.font = '10px monospace';
      this.ctx.fillText(`${m}M`, x - 8, this.height - 8);
    }

    // Path
    this.ctx.beginPath();
    for (let i = 0; i < this.points.length; i++) {
      const pt = this.points[i];
      const x = padX + pt.t * plotW;
      const y = this.height - padY - pt.elevation * plotH;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.strokeStyle = 'rgba(0, 255, 230, 0.5)';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Fill underneath path with gradient
    const grad = this.ctx.createLinearGradient(0, padY, 0, this.height - padY);
    grad.addColorStop(0, 'rgba(0, 255, 230, 0.25)');
    grad.addColorStop(1, 'rgba(0, 255, 230, 0.0)');
    this.ctx.lineTo(this.width - padX, this.height - padY);
    this.ctx.lineTo(padX, this.height - padY);
    this.ctx.closePath();
    this.ctx.fillStyle = grad;
    this.ctx.fill();

    // Draw active runner bead
    const currentT = this.progress;
    const ptIdx = Math.min(this.points.length - 1, Math.floor(currentT * (this.points.length - 1)));
    const activePt = this.points[ptIdx];
    if (activePt) {
      const currX = padX + currentT * plotW;
      const currY = this.height - padY - activePt.elevation * plotH;

      // Glow halo
      this.ctx.fillStyle = 'rgba(255, 30, 80, 0.4)';
      this.ctx.beginPath();
      this.ctx.arc(currX, currY, 12, 0, Math.PI * 2);
      this.ctx.fill();

      // Core bead
      this.ctx.fillStyle = '#ff1e50';
      this.ctx.beginPath();
      this.ctx.arc(currX, currY, 5, 0, Math.PI * 2);
      this.ctx.fill();

      // Coordinate marker
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '9px monospace';
      this.ctx.fillText(`${(this.progress * 5).toFixed(2)} mi`, currX - 16, currY - 14);
    }

    requestAnimationFrame(this.render);
  }
}

window.TopoEngine = TopoEngine;
