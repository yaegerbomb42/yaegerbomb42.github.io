// 3D Infinite Ceiling Tile Lattice & Quantum Black Hole Engine
import * as THREE from './vendor/three.module.js';

export class CeilingLatticeEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.tiles = [];
    this.tileGroup = null;
    this.blackHoleGroup = null;
    this.singularityMesh = null;
    this.accretionDisk = null;
    this.gravitationalRings = [];
    this.time = 0;
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.isOverdrive = false;
    this.blackHoleActive = true;

    this.init();
  }

  init() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020305, 0.035);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 7);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.tileGroup = new THREE.Group();
    this.scene.add(this.tileGroup);

    this.buildCeilingLattice();
    this.buildB0WildBlackHole();

    // Subtle atmospheric lighting
    const amb = new THREE.AmbientLight(0x111625, 1.5);
    this.scene.add(amb);

    const dirLight = new THREE.DirectionalLight(0x00ffe6, 2.0);
    dirLight.position.set(0, -4, 5);
    this.scene.add(dirLight);

    const redRim = new THREE.DirectionalLight(0xff0055, 2.5);
    redRim.position.set(0, 5, -3);
    this.scene.add(redRim);

    window.addEventListener('resize', this.onResize.bind(this));
    window.addEventListener('mousemove', (e) => {
      this.mouse.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  buildCeilingLattice() {
    // Generate a suspended 3D procedural acoustic/cyber ceiling tile
    const tileGeo = new THREE.BoxGeometry(1.4, 0.08, 1.4);
    
    // Grid of ceiling tiles overhead multiplying across X, Y, Z
    const rows = 11;
    const cols = 15;
    const spacingX = 1.65;
    const spacingZ = 1.65;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Individual tile with distinct neon edge groove
        const mat = new THREE.MeshStandardMaterial({
          color: 0x090d14,
          roughness: 0.35,
          metalness: 0.85,
          wireframe: false
        });

        const tileMesh = new THREE.Mesh(tileGeo, mat);
        const posX = (c - cols / 2) * spacingX;
        const posZ = (r - rows / 2) * spacingZ - 2;
        const posY = 3.6 + Math.sin(r * 0.5 + c * 0.5) * 0.25;

        tileMesh.position.set(posX, posY, posZ);

        // Add acoustic perforations / glowing core line
        const wireMat = new THREE.MeshBasicMaterial({
          color: (r + c) % 2 === 0 ? 0x00ffe6 : 0xff1e50,
          wireframe: true,
          transparent: true,
          opacity: 0.35
        });
        const wireFrame = new THREE.Mesh(tileGeo, wireMat);
        wireFrame.scale.set(1.02, 1.02, 1.02);
        tileMesh.add(wireFrame);

        tileMesh.userData = {
          baseX: posX,
          baseY: posY,
          baseZ: posZ,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.02 + 0.015,
          rotSpeed: (Math.random() - 0.5) * 0.01
        };

        this.tiles.push(tileMesh);
        this.tileGroup.add(tileMesh);
      }
    }
  }

  // B0's Wild Addition: A Cybernetic Singularity / Gravitational Wormhole behind the lattice
  buildB0WildBlackHole() {
    this.blackHoleGroup = new THREE.Group();
    this.blackHoleGroup.position.set(0, 0.5, -8);
    this.scene.add(this.blackHoleGroup);

    // Singularity Sphere (Absorbs light)
    const singGeo = new THREE.SphereGeometry(1.6, 64, 64);
    const singMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.singularityMesh = new THREE.Mesh(singGeo, singMat);
    this.blackHoleGroup.add(this.singularityMesh);

    // Photon Sphere Glow Halo
    const haloGeo = new THREE.RingGeometry(1.62, 1.95, 64);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x00ffe6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.blackHoleGroup.add(haloMesh);

    // Accretion Disk Particle Vortex
    const diskCount = 2400;
    const diskGeo = new THREE.BufferGeometry();
    const diskPos = new Float32Array(diskCount * 3);
    const diskColors = new Float32Array(diskCount * 3);

    for (let i = 0; i < diskCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.0 + Math.pow(Math.random(), 1.8) * 5.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = (Math.random() - 0.5) * 0.3 * (1 - (radius - 2.0) / 5.5);

      diskPos[i * 3] = x;
      diskPos[i * 3 + 1] = y;
      diskPos[i * 3 + 2] = z;

      // Color transition: Ultra-hot white/magenta inner to cyan/violet outer
      const t = (radius - 2.0) / 5.5;
      diskColors[i * 3] = t < 0.4 ? 1.0 : (1.0 - t);
      diskColors[i * 3 + 1] = t < 0.2 ? 0.9 : 0.1;
      diskColors[i * 3 + 2] = t < 0.5 ? 0.4 : 1.0;
    }

    diskGeo.setAttribute('position', new THREE.BufferAttribute(diskPos, 3));
    diskGeo.setAttribute('color', new THREE.BufferAttribute(diskColors, 3));

    const diskMat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.accretionDisk = new THREE.Points(diskGeo, diskMat);
    this.accretionDisk.rotation.x = Math.PI * 0.38;
    this.blackHoleGroup.add(this.accretionDisk);

    // Gravitational Shockwave Rings
    for (let j = 0; j < 3; j++) {
      const ringGeo = new THREE.TorusGeometry(3.2 + j * 1.8, 0.02, 16, 100);
      const ringMat = new THREE.MeshBasicMaterial({
        color: j === 0 ? 0xff1e50 : 0x00ffe6,
        transparent: true,
        opacity: 0.45 - j * 0.1,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI * 0.38;
      this.gravitationalRings.push(ring);
      this.blackHoleGroup.add(ring);
    }
  }

  setOverdrive(val) {
    this.isOverdrive = val;
  }

  onResize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(this.animate);
    this.time += 0.02 * (this.isOverdrive ? 3.5 : 1);

    // Smooth mouse parallax
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;

    this.camera.position.x = this.mouse.x * 0.8;
    this.camera.position.y = this.mouse.y * 0.4;
    this.camera.lookAt(0, 1.2, -6);

    // Animate Ceiling Tiles in wave matrix
    const tileSpeed = this.isOverdrive ? 0.08 : 0.025;
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      const d = t.userData;
      d.phase += d.speed * (this.isOverdrive ? 3 : 1);

      // Acoustic suspension breathing
      t.position.y = d.baseY + Math.sin(d.phase + this.time) * 0.35;
      t.rotation.x = Math.sin(d.phase * 0.8) * 0.12;
      t.rotation.z = Math.cos(d.phase * 0.6) * 0.08;

      // When overdrive hits, tiles pull toward singularity or twist outward
      if (this.isOverdrive) {
        t.rotation.y += 0.03;
      }
    }

    // Animate B0's Black Hole & Accretion Disk
    if (this.accretionDisk) {
      this.accretionDisk.rotation.z += 0.015 * (this.isOverdrive ? 4 : 1);
    }

    for (let r = 0; r < this.gravitationalRings.length; r++) {
      const ring = this.gravitationalRings[r];
      ring.rotation.z -= (0.008 + r * 0.004) * (this.isOverdrive ? 3 : 1);
      const scaleWave = 1 + Math.sin(this.time * 2 + r) * 0.05;
      ring.scale.set(scaleWave, scaleWave, scaleWave);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
