// Interactive Rose Petal Kinetic Engine
// Renders procedural ultra-detailed blooming rose petals in 3D perspective with wind physics
export class RosePetalEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width = canvas.offsetWidth || window.innerWidth;
    this.height = canvas.height = canvas.offsetHeight || 500;
    this.petals = [];
    this.bloomProgress = 0; // 0 to 1
    this.targetBloom = 1;
    this.isOverdrive = false;

    this.initPetals();
    this.initListeners();
    this.render = this.render.bind(this);
    requestAnimationFrame(this.render);
  }

  initListeners() {
    window.addEventListener('resize', () => {
      this.width = this.canvas.width = this.canvas.offsetWidth || window.innerWidth;
      this.height = this.canvas.height = this.canvas.offsetHeight || 500;
    });

    this.canvas.addEventListener('click', () => {
      this.bloomProgress = 0.2; // pulse reopen
      this.burstFloatingPetals();
    });
  }

  initPetals() {
    this.petals = [];
    const layers = 5;
    const petalsPerLayer = [5, 7, 9, 12, 16];

    let globalIndex = 0;
    for (let layer = 0; layer < layers; layer++) {
      const count = petalsPerLayer[layer];
      const radiusBase = (layer + 1) * 26 + 18;

      for (let i = 0; i < count; i++) {
        const baseAngle = (i / count) * Math.PI * 2 + (layer * 0.4);
        this.petals.push({
          id: globalIndex++,
          layer,
          baseAngle,
          currentAngle: baseAngle,
          radius: radiusBase,
          w: radiusBase * 0.95,
          h: radiusBase * 1.35,
          curl: 0.15 + layer * 0.1,
          hue: 345 - layer * 3, // Deep crimson to vibrant electric rose
          lightness: 42 + layer * 4,
          driftAngle: Math.random() * Math.PI * 2,
          driftSpeed: Math.random() * 0.02 + 0.01,
          flutter: Math.random() * Math.PI
        });
      }
    }

    // Ambient floating wind petals
    this.floatingPetals = [];
    for (let i = 0; i < 45; i++) {
      this.floatingPetals.push(this.createFloatingPetal());
    }
  }

  createFloatingPetal() {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      z: Math.random() * 200 + 50,
      size: Math.random() * 18 + 10,
      vx: -(Math.random() * 2.5 + 1.2),
      vy: Math.random() * 1.5 - 0.5,
      rotX: Math.random() * Math.PI * 2,
      rotY: Math.random() * Math.PI * 2,
      rotZ: Math.random() * Math.PI * 2,
      vRotX: (Math.random() - 0.5) * 0.05,
      vRotY: (Math.random() - 0.5) * 0.05,
      vRotZ: (Math.random() - 0.5) * 0.04,
      hue: Math.random() > 0.3 ? 348 : 330,
      opacity: Math.random() * 0.6 + 0.3
    };
  }

  burstFloatingPetals() {
    for (let i = 0; i < 25; i++) {
      const p = this.createFloatingPetal();
      p.x = this.width / 2 + (Math.random() - 0.5) * 80;
      p.y = this.height / 2 + (Math.random() - 0.5) * 80;
      p.vx = (Math.random() - 0.5) * 12;
      p.vy = (Math.random() - 0.5) * 12;
      this.floatingPetals.push(p);
    }
  }

  setOverdrive(val) {
    this.isOverdrive = val;
    if (val) this.burstFloatingPetals();
  }

  drawPetal(ctx, cx, cy, p, bloom) {
    ctx.save();
    ctx.translate(cx, cy);

    // Dynamic bloom expansion
    const currentR = p.radius * bloom;
    const px = Math.cos(p.currentAngle) * currentR;
    const py = Math.sin(p.currentAngle) * currentR;

    ctx.translate(px, py);
    ctx.rotate(p.currentAngle + Math.PI / 2 + Math.sin(p.flutter) * 0.08);

    // Scale with bloom
    const pw = p.w * (0.6 + bloom * 0.4);
    const ph = p.h * (0.5 + bloom * 0.5);

    // Velvet gradient fill
    const grad = ctx.createRadialGradient(0, -ph * 0.2, pw * 0.1, 0, 0, ph);
    grad.addColorStop(0, `hsla(${p.hue}, 95%, ${p.lightness + 12}%, 0.95)`);
    grad.addColorStop(0.5, `hsla(${p.hue}, 90%, ${p.lightness}%, 0.9)`);
    grad.addColorStop(0.85, `hsla(${p.hue - 10}, 92%, ${p.lightness - 15}%, 0.85)`);
    grad.addColorStop(1, `hsla(${p.hue - 15}, 95%, 12%, 0.8)`);

    ctx.fillStyle = grad;
    ctx.strokeStyle = `hsla(${p.hue + 10}, 100%, 75%, 0.35)`;
    ctx.lineWidth = 1.2;

    // Organic Petal Bezier Curve
    ctx.beginPath();
    ctx.moveTo(0, 0); // Base attach
    ctx.bezierCurveTo(-pw * 0.7, -ph * 0.35, -pw * 0.8, -ph * 0.85, 0, -ph);
    ctx.bezierCurveTo(pw * 0.8, -ph * 0.85, pw * 0.7, -ph * 0.35, 0, 0);
    ctx.fill();
    ctx.stroke();

    // Central vein
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(pw * 0.08, -ph * 0.5, 0, -ph * 0.85);
    ctx.strokeStyle = `hsla(${p.hue + 20}, 100%, 85%, 0.25)`;
    ctx.stroke();

    ctx.restore();
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    const cx = this.width / 2;
    const cy = this.height / 2;

    // Smooth bloom transition
    this.bloomProgress += (this.targetBloom - this.bloomProgress) * 0.04;

    // Draw Hero Blooming Rose (Render from outermost layer to innermost core)
    for (let l = 4; l >= 0; l--) {
      const layerPetals = this.petals.filter(p => p.layer === l);
      for (const p of layerPetals) {
        p.flutter += p.driftSpeed * (this.isOverdrive ? 3 : 1);
        this.drawPetal(this.ctx, cx, cy, p, this.bloomProgress);
      }
    }

    // Golden Core Stamen
    const coreGrad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, 24);
    coreGrad.addColorStop(0, '#ffe066');
    coreGrad.addColorStop(0.6, '#ff9900');
    coreGrad.addColorStop(1, 'rgba(160, 20, 40, 0.2)');
    this.ctx.fillStyle = coreGrad;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 22 * this.bloomProgress, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw Flying Wind Petals
    const windSpeedMult = this.isOverdrive ? 3.5 : 1.0;
    for (let i = this.floatingPetals.length - 1; i >= 0; i--) {
      const fp = this.floatingPetals[i];
      fp.x += fp.vx * windSpeedMult;
      fp.y += fp.vy * windSpeedMult;
      fp.rotX += fp.vRotX * windSpeedMult;
      fp.rotY += fp.vRotY * windSpeedMult;
      fp.rotZ += fp.vRotZ * windSpeedMult;

      if (fp.x < -60 || fp.y > this.height + 60 || fp.y < -60) {
        fp.x = this.width + 50;
        fp.y = Math.random() * this.height;
      }

      this.ctx.save();
      this.ctx.translate(fp.x, fp.y);
      this.ctx.rotate(fp.rotZ);
      const scaleX = Math.cos(fp.rotY);
      const scaleY = Math.sin(fp.rotX);
      this.ctx.scale(scaleX, scaleY);

      this.ctx.fillStyle = `hsla(${fp.hue}, 90%, 48%, ${fp.opacity})`;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, fp.size, fp.size * 0.55, 0, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    }

    requestAnimationFrame(this.render);
  }
}
