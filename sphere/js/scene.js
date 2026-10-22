// ============================================================
// Sphere Quest — Three.js scene (sphere, stars, drones, comet, particles)
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { THEMES } from './logic.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const SPHERE_R = 2.2;
const MAX_PARTICLES = 500;

export class SphereScene {
  constructor(container, hooks = {}, opts = {}) {
    this.hooks = hooks;
    this.low = !!opts.lowParticles;
    this.pos = new THREE.Vector3();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.012);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 1.4, 6.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);
    this.dom = this.renderer.domElement;

    this.controls = new OrbitControls(this.camera, this.dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.8;
    this.controls.maxDistance = 22;

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const key = new THREE.PointLight(0xffffff, 2.4, 60);
    key.position.set(12, 10, 12);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x3b82f6, 3, 60);
    rim.position.set(-12, -10, -12);
    this.scene.add(rim);

    this._makeStarfield();
    this._makeSphere();
    this._makeDrones();
    this._makeParticles();
    this._makeComet();
    this._bindEvents();
    this._resize = () => this._onResize();
    window.addEventListener('resize', this._resize);
  }

  // ---- Construction helpers -------------------------------------------
  _makeStarfield() {
    const count = this.low ? 2200 : 5500;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 45 + Math.random() * 90;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      const c = new THREE.Color().setHSL(0.6 + Math.random() * 0.12, 0.7, 0.65 + Math.random() * 0.35);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: this.low ? 0.28 : 0.35, vertexColors: true, transparent: true, opacity: 0.85 });
    this.starField = new THREE.Points(geo, mat);
    this.scene.add(this.starField);
  }

  _makeSphere() {
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(SPHERE_R, 80, 80),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.28, metalness: 0.55 })
    );
    this.scene.add(this.sphere);

    // soft glow halo (sprite)
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x60a5fa, transparent: true, opacity: 0.38,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.halo.scale.setScalar(6.8);
    this.scene.add(this.halo);

    // inner core light
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(1.55, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.scene.add(this.core);

    // orbit ring
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.9, 0.035, 12, 120),
      new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.ring.rotation.x = Math.PI / 2.4;
    this.scene.add(this.ring);
  }

  _makeDrones() {
    this.drones = [];
    this.droneGroup = new THREE.Group();
    this.scene.add(this.droneGroup);
    const M = 12;
    for (let i = 0; i < M; i++) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09, 0),
        new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.9 })
      );
      mesh.userData = {
        r: 2.55 + Math.random() * 0.9,
        speed: 0.25 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        tilt: (Math.random() - 0.5) * 1.4,
        bob: Math.random() * 0.5
      };
      mesh.visible = false;
      this.droneGroup.add(mesh);
      this.drones.push(mesh);
    }
  }

  setDroneCount(n) {
    const show = Math.min(n, this.drones.length);
    this.drones.forEach((d, i) => { d.visible = i < show; });
  }

  _makeParticles() {
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.active = [];
    this.free = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this.free.push(i);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.17, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);
  }

  spawnBurst(at, color, count = 10, speed = 0.9) {
    const n = this.low ? Math.max(3, Math.floor(count / 2)) : count;
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (!this.free.length) break;
      const idx = this.free.pop();
      this.pPos[idx * 3] = at.x; this.pPos[idx * 3 + 1] = at.y; this.pPos[idx * 3 + 2] = at.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.5 + Math.random() * 0.8);
      this.pVel[idx * 3] = sp * Math.sin(ph) * Math.cos(th);
      this.pVel[idx * 3 + 1] = sp * Math.sin(ph) * Math.sin(th);
      this.pVel[idx * 3 + 2] = sp * Math.cos(ph);
      this.pLife[idx] = 0.7 + Math.random() * 0.7;
      this.pCol[idx * 3] = c.r; this.pCol[idx * 3 + 1] = c.g; this.pCol[idx * 3 + 2] = c.b;
      this.active.push(idx);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  _makeComet() {
    this.cometGroup = new THREE.Group();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xfbbf24, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.setScalar(1.5);
    this.cometGroup.add(glow);
    this.cometMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.cometMesh.add(new THREE.PointLight(0xfbbf24, 4, 8));
    this.cometGroup.add(this.cometMesh);
    this.scene.add(this.cometGroup);

    this.trailPts = [];
    this.trailLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.5 })
    );
    this.scene.add(this.trailLine);

    this.cometGroup.visible = false;
    this.cometTimer = 8; // first comet appears quickly
    this.cometAngle = 0;
  }

  // ---- Theme -----------------------------------------------------------
  setTheme(index) {
    const t = THEMES[index];
    if (!t) return;
    this.sphere.material.color.setHex(t.core);
    this.sphere.material.emissive.setHex(t.emis);
    this.halo.material.color.setHex(t.hi);
    this.halo.material.opacity = 0.38;
    this.core.material.color.setHex(t.hi);
    this.ring.material.color.set(t.accent);
    this.drones.forEach(d => { d.material.color.set(t.accent); });
  }

  // ---- Projection (world -> CSS px) -----------------------------------
  project(v) {
    const p = v.clone().project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * window.innerWidth,
      y: (-p.y * 0.5 + 0.5) * window.innerHeight,
      inFront: p.z < 1
    };
  }

  pulse(power = 1) {
    this.halo.material.opacity = Math.min(0.9, 0.38 + 0.3 * power);
    this.core.material.opacity = 0.16 + 0.2 * power;
  }

  // ---- Events ----------------------------------------------------------
  _bindEvents() {
    const dom = this.dom;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    this._dragStart = null;

    dom.addEventListener('pointerdown', (e) => {
      this._dragStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });

    dom.addEventListener('pointerup', (e) => {
      const s = this._dragStart;
      if (!s) return;
      this._dragStart = null;
      const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y);
      if (moved > 7 || performance.now() - s.t > 700) return;

      ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;

      // Comet first (rare jackpot — prioritize over sphere)
      if (this.cometGroup.visible) {
        const p = this.project(this.cometGroup.position);
        if (p.inFront && Math.hypot(p.x - e.clientX, p.y - e.clientY) < 34) {
          this.hooks.onComet && this.hooks.onComet(this.cometGroup.position.clone());
          return;
        }
      }

      // Sphere hit?
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObject(this.sphere, false);
      if (hit.length) {
        this.hooks.onMine && this.hooks.onMine(hit[0].point);
      }
    });

    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    dom.addEventListener('pointermove', (e) => {
      ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObject(this.sphere, false);
      dom.style.cursor = hit.length ? 'pointer' : 'grab';
    });
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    window.removeEventListener('resize', this._resize);
    this.controls.dispose();
    this.renderer.dispose();
    this.dom.remove();
  }

  // ---- Main loop -------------------------------------------------------
  start(animateCb) {
    const clock = new THREE.Clock();
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      this._update(dt);
      if (animateCb) animateCb(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  _update(dt) {
    // sphere drift
    this.sphere.rotation.y += 0.004;
    this.sphere.rotation.z += 0.0012;
    this.ring.rotation.z += 0.0022;
    this.starField.rotation.y -= 0.00025;

    // halo pulse decay
    this.halo.material.opacity = Math.max(0.38, this.halo.material.opacity - dt * 0.25);
    this.core.material.opacity = Math.max(0.16, this.core.material.opacity - dt * 0.2);

    // drones
    this.drones.forEach(d => {
      if (!d.visible) return;
      const u = d.userData;
      u.phase += dt * u.speed;
      const r = u.r;
      d.position.set(
        r * Math.cos(u.phase),
        u.bob * Math.sin(u.phase * 1.7) + 0.2 * Math.sin(u.phase * 2 + u.tilt),
        r * Math.sin(u.phase) * 0.85
      );
      d.rotation.y += dt * 2;
    });

    // particles
    for (let i = this.active.length - 1; i >= 0; i--) {
      const idx = this.active[i];
      this.pLife[idx] -= dt;
      if (this.pLife[idx] <= 0) {
        this.active.splice(i, 1);
        this.free.push(idx);
        continue;
      }
      this.pPos[idx * 3] += this.pVel[idx * 3] * dt;
      this.pPos[idx * 3 + 1] += this.pVel[idx * 3 + 1] * dt;
      this.pPos[idx * 3 + 2] += this.pVel[idx * 3 + 2] * dt;
      this.pVel[idx * 3] *= 1 - dt * 0.8;
      this.pVel[idx * 3 + 1] *= 1 - dt * 0.8;
      this.pVel[idx * 3 + 2] *= 1 - dt * 0.8;
    }
    if (this.active.length) {
      this.points.geometry.attributes.position.needsUpdate = true;
    }

    // comet
    if (!this.cometGroup.visible) {
      this.cometTimer -= dt;
      if (this.cometTimer <= 0) {
        this.cometGroup.visible = true;
        this.cometAngle = Math.random() * Math.PI * 2;
      }
    } else {
      this.cometAngle += dt * 0.45;
      const a = this.cometAngle;
      const r = 3.7 + 0.8 * Math.sin(a * 0.5);
      this.cometGroup.position.set(
        r * Math.cos(a),
        1.15 * Math.sin(a * 1.3),
        r * 0.75 * Math.sin(a * 0.9)
      );
      this.trailPts.push(this.cometGroup.position.clone());
      if (this.trailPts.length > 70) this.trailPts.shift();
      this.trailLine.geometry.setFromPoints(this.trailPts);

      // random despawn
      if (Math.random() < dt * 0.02) {
        this.cometGroup.visible = false;
        this.trailPts.length = 0;
        this.trailLine.geometry.setFromPoints([]);
        this.cometTimer = 40 + Math.random() * 40;
      }
    }
  }
}
