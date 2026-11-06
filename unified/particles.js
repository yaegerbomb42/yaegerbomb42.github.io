// Procedural Particle Engine & Kinetic Typography for 5 MILE RUN. SHRED SEASON.
class KineticTextEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: -9999, y: -9999, radius: 120, isDown: false };
    this.width = canvas.width = window.innerWidth;
    this.height = canvas.height = window.innerHeight;
    this.mode = 'cyber'; // 'cyber' | 'solar' | 'shred'
    this.overdrive = false;
    this.targetPhrases = ["5 MILE RUN.", "SHRED SEASON."];
    this.initListeners();
    this.createParticlesFromText();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initListeners() {
    window.addEventListener('resize', () => {
      this.width = this.canvas.width = window.innerWidth;
      this.height = this.canvas.height = window.innerHeight;
      this.createParticlesFromText();
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this.mouse.x = e.touches[0].clientX;
        this.mouse.y = e.touches[0].clientY;
      }
    });

    window.addEventListener('touchend', () => {
      this.mouse.x = -9999;
      this.mouse.y = -9999;
    });

    window.addEventListener('mousedown', () => {
      this.mouse.isDown = true;
      this.mouse.radius = 240;
    });

    window.addEventListener('mouseup', () => {
      this.mouse.isDown = false;
      this.mouse.radius = 120;
    });
  }

  setOverdrive(val) {
    this.overdrive = val;
    if (val) {
      this.particles.forEach(p => {
        p.vx += (Math.random() - 0.5) * 18;
        p.vy += (Math.random() - 0.5) * 18;
      });
    }
  }

  createParticlesFromText() {
    this.particles = [];
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');
    offCanvas.width = this.width;
    offCanvas.height = this.height;

    const baseSize = Math.max(28, Math.min(this.width / 13, 90));
    offCtx.fillStyle = '#ffffff';
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    offCtx.font = `900 ${baseSize}px 'Chakra Petch', 'Impact', 'Arial Black', sans-serif`;

    const centerY = this.height / 2;
    const gap = baseSize * 1.15;
    offCtx.fillText(this.targetPhrases[0], this.width / 2, centerY - gap * 0.65);
    offCtx.fillText(this.targetPhrases[1], this.width / 2, centerY + gap * 0.65);

    const imgData = offCtx.getImageData(0, 0, this.width, this.height).data;
    const step = Math.max(3, Math.floor(baseSize / 15));

    for (let y = 0; y < this.height; y += step) {
      for (let x = 0; x < this.width; x += step) {
        const index = (y * this.width + x) * 4;
        const alpha = imgData[index + 3];
        if (alpha > 128) {
          const isSecondLine = y > centerY;
          this.particles.push({
            originX: x,
            originY: y,
            x: x + (Math.random() - 0.5) * 600,
            y: y + (Math.random() - 0.5) * 600,
            vx: 0,
            vy: 0,
            size: Math.random() * 2.2 + 1.2,
            line: isSecondLine ? 1 : 0,
            pulse: Math.random() * Math.PI * 2,
            baseAlpha: Math.random() * 0.4 + 0.6
          });
        }
      }
    }

    // Add 80 background speed stars / runner wind streak particles
    this.ambientParticles = [];
    for (let i = 0; i < 90; i++) {
      this.ambientParticles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        len: Math.random() * 40 + 10,
        speed: Math.random() * 5 + 3,
        alpha: Math.random() * 0.3 + 0.1
      });
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Render ambient speed streaks (wind of the 5-mile run)
    const streakSpeedMultiplier = this.overdrive ? 4.5 : 1.0;
    this.ctx.lineWidth = 1;
    for (let s of this.ambientParticles) {
      s.x -= s.speed * streakSpeedMultiplier;
      if (s.x < -s.len) {
        s.x = this.width + Math.random() * 100;
        s.y = Math.random() * this.height;
      }
      this.ctx.strokeStyle = this.mode === 'solar' 
        ? `rgba(255, 60, 0, ${s.alpha * 0.6})` 
        : `rgba(0, 255, 200, ${s.alpha * 0.5})`;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x, s.y);
      this.ctx.lineTo(s.x + s.len, s.y);
      this.ctx.stroke();
    }

    // Update and draw kinetic typography particles
    const pLen = this.particles.length;
    const friction = this.overdrive ? 0.88 : 0.82;
    const spring = this.overdrive ? 0.09 : 0.06;
    const mRadius = this.mouse.radius;
    const mRadiusSq = mRadius * mRadius;

    for (let i = 0; i < pLen; i++) {
      const p = this.particles[i];
      p.pulse += 0.05;

      // Distance to mouse
      const dx = this.mouse.x - p.x;
      const dy = this.mouse.y - p.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < mRadiusSq) {
        const dist = Math.sqrt(distSq);
        const force = (1 - dist / mRadius) * (this.mouse.isDown ? 24 : 12);
        const angle = Math.atan2(dy, dx);
        p.vx -= Math.cos(angle) * force;
        p.vy -= Math.sin(angle) * force;
      }

      // Spring back to origin
      const returnX = (p.originX - p.x) * spring;
      const returnY = (p.originY - p.y) * spring;
      p.vx = (p.vx + returnX) * friction;
      p.vy = (p.vy + returnY) * friction;

      p.x += p.vx;
      p.y += p.vy;

      // Color scheme based on phrase
      let color;
      if (this.mode === 'cyber') {
        color = p.line === 0 
          ? `rgba(0, 255, 230, ${p.baseAlpha})`   // Cyan for "5 MILE RUN."
          : `rgba(255, 30, 80, ${p.baseAlpha})`;  // Hot pink / crimson for "SHRED SEASON."
      } else if (this.mode === 'solar') {
        color = p.line === 0 
          ? `rgba(255, 210, 0, ${p.baseAlpha})` 
          : `rgba(255, 70, 0, ${p.baseAlpha})`;
      } else { // Shred Monochrome Hyper-Gold
        color = p.line === 0 
          ? `rgba(255, 255, 255, ${p.baseAlpha})` 
          : `rgba(255, 190, 40, ${p.baseAlpha})`;
      }

      this.ctx.fillStyle = color;
      this.ctx.fillRect(p.x, p.y, p.size, p.size);

      // Web connections between nearby particles on hover/overdrive
      if (this.overdrive && i % 8 === 0 && i < pLen - 2) {
        const nextP = this.particles[i + 1];
        const distNext = Math.hypot(p.x - nextP.x, p.y - nextP.y);
        if (distNext < 35) {
          this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 * (1 - distNext / 35)})`;
          this.ctx.beginPath();
          this.ctx.moveTo(p.x, p.y);
          this.ctx.lineTo(nextP.x, nextP.y);
          this.ctx.stroke();
        }
      }
    }

    requestAnimationFrame(this.animate);
  }
}

window.KineticTextEngine = KineticTextEngine;
