import * as THREE from './vendor/three.module.js';

// Procedural High-Detail 3D Spinning Earth Engine with Atmosphere Glow, Clouds, and Night Lights
export class EarthEngine {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.earthGroup = null;
    this.earthMesh = null;
    this.cloudMesh = null;
    this.atmosphereMesh = null;
    this.lightsMesh = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.targetRotationX = 0;
    this.targetRotationY = 0;
    this.isOverdrive = false;

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || 450;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.z = 2.6;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.container.appendChild(this.renderer.domElement);

    this.earthGroup = new THREE.Group();
    this.earthGroup.rotation.z = (23.4 * Math.PI) / 180; // Earth axial tilt
    this.scene.add(this.earthGroup);

    this.buildEarth();
    this.buildAtmosphere();
    this.buildStarField();

    // Lighting
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.8);
    sunLight.position.set(5, 3, 4);
    this.scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x081326, 1.2);
    this.scene.add(ambientLight);

    // Rim lighting (cyber/lambo magenta edge light)
    const rimLight = new THREE.DirectionalLight(0xff0055, 1.4);
    rimLight.position.set(-5, -2, -3);
    this.scene.add(rimLight);

    window.addEventListener('resize', this.onWindowResize.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  // Generate procedural canvas textures so there are zero 404s or network lag
  createEarthTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Deep ocean gradient
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, 1024);
    oceanGrad.addColorStop(0, '#040b17');
    oceanGrad.addColorStop(0.5, '#051b33');
    oceanGrad.addColorStop(1, '#040b17');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, 2048, 1024);

    // Procedural continents & landmasses
    ctx.fillStyle = '#1c4a38';
    ctx.strokeStyle = '#2d7a5b';
    ctx.lineWidth = 2;

    // Helper to draw continent noise blobs
    const drawLandMass = (cx, cy, rx, ry, seed, points = 36) => {
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const noise = Math.sin(angle * 5 + seed) * 0.28 + Math.cos(angle * 9 + seed * 2) * 0.15;
        const rCurrentX = rx * (1 + noise);
        const rCurrentY = ry * (1 + noise);
        const x = cx + Math.cos(angle) * rCurrentX;
        const y = cy + Math.sin(angle) * rCurrentY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    // North America & Central America
    drawLandMass(560, 360, 240, 160, 1.2);
    // South America
    drawLandMass(720, 680, 130, 230, 2.4);
    // Eurasia
    drawLandMass(1320, 320, 360, 180, 3.1);
    // Africa
    drawLandMass(1120, 560, 180, 220, 4.7);
    // Australia & Oceania
    drawLandMass(1680, 720, 150, 110, 5.2);
    // Antarctica
    drawLandMass(1024, 980, 800, 60, 6.1);
    // Greenland
    drawLandMass(820, 180, 100, 70, 7.3);

    // Tech matrix grid overlay across globe
    ctx.strokeStyle = 'rgba(0, 255, 230, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 2048; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1024);
      ctx.stroke();
    }
    for (let y = 0; y < 1024; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(2048, y);
      ctx.stroke();
    }

    // City glow nodes (Night lights)
    ctx.fillStyle = '#ffcc44';
    for (let i = 0; i < 400; i++) {
      const rx = (Math.random() * 2048);
      const ry = (Math.random() * 800 + 100);
      const p = ctx.getImageData(rx, ry, 1, 1).data;
      if (p[1] > 40) { // On land
        ctx.beginPath();
        ctx.arc(rx, ry, Math.random() * 2 + 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  createCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 1024, 512);

    for (let i = 0; i < 180; i++) {
      const cx = Math.random() * 1024;
      const cy = Math.random() * 512;
      const rad = Math.random() * 50 + 20;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, `rgba(255, 255, 255, ${Math.random() * 0.4 + 0.2})`);
      grad.addColorStop(0.7, `rgba(220, 240, 255, ${Math.random() * 0.15})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }

  buildEarth() {
    const earthGeo = new THREE.SphereGeometry(1, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      map: this.createEarthTexture(),
      roughness: 0.65,
      metalness: 0.18,
      bumpScale: 0.05
    });

    this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.earthGroup.add(this.earthMesh);

    // Cloud Layer
    const cloudGeo = new THREE.SphereGeometry(1.018, 64, 64);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: this.createCloudTexture(),
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    this.earthGroup.add(this.cloudMesh);
  }

  buildAtmosphere() {
    // Custom Fresnel Atmosphere Glow
    const atmosGeo = new THREE.SphereGeometry(1.12, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.68 - dot(vNormal, vec3(0, 0, 1.0)), 2.8);
          gl_FragColor = vec4(0.0, 0.95, 1.0, 1.0) * intensity * 1.5;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true
    });

    this.atmosphereMesh = new THREE.Mesh(atmosGeo, atmosMat);
    this.earthGroup.add(this.atmosphereMesh);
  }

  buildStarField() {
    const starCount = 800;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 40;
      positions[i + 1] = (Math.random() - 0.5) * 40;
      positions[i + 2] = (Math.random() - 0.5) * 40 - 5;

      const isCyan = Math.random() > 0.5;
      colors[i] = isCyan ? 0.0 : 1.0;
      colors[i + 1] = isCyan ? 0.9 : 0.2;
      colors[i + 2] = isCyan ? 1.0 : 0.4;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });

    const starPoints = new THREE.Points(geometry, material);
    this.scene.add(starPoints);
  }

  onMouseMove(e) {
    this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  onWindowResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || 450;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setOverdrive(val) {
    this.isOverdrive = val;
  }

  animate() {
    requestAnimationFrame(this.animate);

    const spinSpeed = this.isOverdrive ? 0.03 : 0.0035;
    if (this.earthMesh) this.earthMesh.rotation.y += spinSpeed;
    if (this.cloudMesh) this.cloudMesh.rotation.y += spinSpeed * 1.35;

    // Interactive inertia tilt on mouse
    this.targetRotationY = this.mouseX * 0.4;
    this.targetRotationX = -this.mouseY * 0.2;

    this.earthGroup.rotation.y += (this.targetRotationY - this.earthGroup.rotation.y) * 0.05;
    this.earthGroup.rotation.x += (this.targetRotationX - this.earthGroup.rotation.x) * 0.05;

    this.renderer.render(this.scene, this.camera);
  }
}
