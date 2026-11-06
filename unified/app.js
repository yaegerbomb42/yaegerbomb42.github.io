const $ = (selector, root = document) => root.querySelector(selector);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const TAU = Math.PI * 2;

const canvas = $('#universe');
const ctx = canvas?.getContext('2d', { alpha: false, desynchronized: true });
const courseCanvas = $('#courseCanvas');
const courseCtx = courseCanvas?.getContext('2d');

const scene = {
  width: 0,
  height: 0,
  dpr: 1,
  time: 0,
  pointerX: 0,
  pointerY: 0,
  targetX: 0,
  targetY: 0,
  overdrive: false,
  bloom: 0,
  orbit: 0,
  stars: [],
  reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
};

const run = {
  elapsed: 0,
  distance: 0,
  paused: false,
  overdrive: false,
  heart: 142,
  cadence: 176,
  elevation: 0,
  calories: 0,
  lastUi: 0,
  finished: false
};

const splits = [
  { name: 'IGNITION', note: 'Cold start / find the rhythm', pace: '6:54' },
  { name: 'THE FLOW', note: 'Breath becomes machinery', pace: '6:42' },
  { name: 'THE WALL', note: 'Pressure makes diamonds', pace: '6:38' },
  { name: 'BEAST MODE', note: 'Break the architecture', pace: '6:25' },
  { name: 'THE VOID', note: 'Nothing left to negotiate', pace: '5:58' }
];

const course = Array.from({ length: 161 }, (_, i) => {
  const x = i / 160;
  return .19 + Math.sin(x * Math.PI) * .36 + Math.sin(x * Math.PI * 4.1) * .08 + (x > .62 ? (x - .62) * .42 : 0);
});

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function resize() {
  if (!canvas || !ctx) return;
  const bounds = canvas.getBoundingClientRect();
  scene.width = Math.max(1, window.innerWidth);
  scene.height = Math.max(1, window.innerHeight);
  scene.dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  canvas.width = Math.round(scene.width * scene.dpr);
  canvas.height = Math.round(scene.height * scene.dpr);
  ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
  const random = seededRandom(90817);
  const amount = scene.width < 700 ? 105 : 220;
  scene.stars = Array.from({ length: amount }, () => ({
    x: random(), y: random(), z: random(), r: .25 + random() * 1.05,
    phase: random() * TAU, drift: .15 + random() * .9
  }));
  resizeCourse();
}

function resizeCourse() {
  if (!courseCanvas || !courseCtx) return;
  const bounds = courseCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  courseCanvas.width = Math.max(1, Math.round(bounds.width * dpr));
  courseCanvas.height = Math.max(1, Math.round(bounds.height * dpr));
  courseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawStars(w, h, t) {
  for (const star of scene.stars) {
    const drift = (t * .000012 * star.drift) % 1;
    let x = (star.x + drift * (scene.overdrive ? 2.8 : .22)) % 1;
    let y = star.y;
    x = (x - .5) * (1 + star.z * .26) + .5;
    y = (y - .5) * (1 + star.z * .3) + .5;
    const px = x * w + scene.pointerX * star.z * 9;
    const py = y * h + scene.pointerY * star.z * 8;
    const alpha = .17 + (Math.sin(t * .001 * star.drift + star.phase) + 1) * .17;
    ctx.fillStyle = `rgba(225,205,220,${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, star.r * (1 + star.z * .4), 0, TAU);
    ctx.fill();
    if (scene.overdrive && star.z > .72) {
      ctx.strokeStyle = `rgba(255,80,112,${alpha * .55})`;
      ctx.lineWidth = .7;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - 14 * star.z, py + 3 * star.z);
      ctx.stroke();
    }
  }
}

function drawLattice(w, h, t) {
  const vx = w * (.675 + scene.pointerX * .012);
  const vy = h * (.365 + scene.pointerY * .012);
  const warp = scene.overdrive ? 1.8 : 1;
  ctx.save();
  ctx.lineWidth = .72;
  for (let i = 0; i <= 22; i++) {
    const edgeX = (i / 22) * w;
    const sway = Math.sin(t * .00023 + i * .77) * (scene.overdrive ? 5 : 2);
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(255,66,103,.18)' : 'rgba(184,221,218,.095)';
    ctx.beginPath();
    ctx.moveTo(vx + sway, vy);
    ctx.lineTo(edgeX, -12);
    ctx.stroke();
  }
  for (let i = 1; i <= 14; i++) {
    const p = i / 14;
    const y = vy - Math.pow(1 - p, 1.72) * (vy + h * .02);
    const half = (w * .5) * Math.pow(p, .76);
    const shimmer = Math.sin(t * .00045 + i * .6) * 2 * warp;
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(255,67,102,.2)' : 'rgba(177,221,219,.09)';
    ctx.beginPath();
    ctx.moveTo(vx - half, y + shimmer);
    ctx.quadraticCurveTo(vx, y - 7 * p + shimmer, vx + half, y + shimmer);
    ctx.stroke();
  }
  // The lower grid turns the ceiling into a running surface.
  for (let i = 0; i <= 22; i++) {
    const edgeX = (i / 22) * w;
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(255,67,102,.15)' : 'rgba(177,221,219,.065)';
    ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(edgeX, h + 8); ctx.stroke();
  }
  for (let i = 1; i <= 17; i++) {
    const p = i / 17;
    const y = vy + Math.pow(p, 1.65) * (h - vy + 30);
    const half = w * .5 * Math.pow(p, .7);
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(255,67,102,.14)' : 'rgba(177,221,219,.055)';
    ctx.beginPath(); ctx.moveTo(vx - half, y); ctx.quadraticCurveTo(vx, y + 13 * p, vx + half, y); ctx.stroke();
  }
  // A few tiles lose their alignment near the anomaly.
  const random = seededRandom(619 + Math.floor(t / 900));
  for (let i = 0; i < 11; i++) {
    const angle = random() * TAU;
    const radius = 70 + random() * Math.min(w, h) * .35;
    const x = vx + Math.cos(angle) * radius;
    const y = vy + Math.sin(angle) * radius * .48;
    const s = 8 + random() * 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((random() - .5) * .28 + t * .00005);
    ctx.strokeStyle = `rgba(255,57,99,${.08 + random() * .12})`;
    ctx.strokeRect(-s, -s * .55, s * 2, s * 1.1);
    ctx.restore();
  }
  ctx.restore();
}

function drawSingularity(x, y, radius, t) {
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, radius * .15, x, y, radius * 2.7);
  glow.addColorStop(0, 'rgba(0,0,0,.98)');
  glow.addColorStop(.42, 'rgba(8,2,8,.92)');
  glow.addColorStop(.65, 'rgba(112,13,42,.28)');
  glow.addColorStop(1, 'rgba(112,13,42,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, radius * 2.7, 0, TAU); ctx.fill();
  ctx.translate(x, y);
  for (let ring = 0; ring < 4; ring++) {
    ctx.save();
    ctx.rotate(t * .00014 * (ring % 2 ? -1 : 1) + ring * .7);
    ctx.scale(1, .28 + ring * .035);
    ctx.strokeStyle = `rgba(${ring % 2 ? '255,80,115' : '195,232,221'},${.15 - ring * .022})`;
    ctx.lineWidth = ring === 0 ? 2 : .75;
    ctx.beginPath(); ctx.arc(0, 0, radius * (1.1 + ring * .22), .18, Math.PI * 1.76); ctx.stroke();
    ctx.restore();
  }
  const core = ctx.createRadialGradient(-radius * .18, -radius * .22, 0, 0, 0, radius * .92);
  core.addColorStop(0, '#000'); core.addColorStop(.72, '#030204'); core.addColorStop(1, 'rgba(18,3,12,.96)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(0, 0, radius * .88, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawEarth(x, y, radius, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-.14 + Math.sin(t * .00017) * .035);
  const atmosphere = ctx.createRadialGradient(0, 0, radius * .75, 0, 0, radius * 1.5);
  atmosphere.addColorStop(0, 'rgba(70,170,187,0)');
  atmosphere.addColorStop(.72, 'rgba(72,183,194,.08)');
  atmosphere.addColorStop(.86, 'rgba(136,239,227,.28)');
  atmosphere.addColorStop(1, 'rgba(136,239,227,0)');
  ctx.fillStyle = atmosphere; ctx.beginPath(); ctx.arc(0, 0, radius * 1.5, 0, TAU); ctx.fill();
  const globe = ctx.createRadialGradient(-radius * .36, -radius * .4, radius * .04, radius * .1, radius * .1, radius * 1.2);
  globe.addColorStop(0, '#417b82'); globe.addColorStop(.36, '#183d48'); globe.addColorStop(.78, '#09141d'); globe.addColorStop(1, '#020408');
  ctx.fillStyle = globe; ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, radius * .995, 0, TAU); ctx.clip();
  // Stylized landmasses rotate across the day/night boundary.
  const spin = t * .00018;
  const land = [
    [[-.72,-.12],[-.53,-.44],[-.27,-.48],[-.18,-.21],[-.32,-.03],[-.42,.2],[-.36,.56],[-.52,.65],[-.63,.26]],
    [[-.05,-.68],[.2,-.62],[.29,-.4],[.12,-.23],[-.04,-.32],[-.2,-.51]],
    [[.24,-.23],[.56,-.31],[.76,-.13],[.64,.08],[.44,.1],[.34,.35],[.14,.22],[.07,-.03]],
    [[.04,.3],[.26,.36],[.32,.7],[.16,.83],[-.02,.62],[-.1,.42]],
    [[.67,.36],[.84,.4],[.88,.56],[.73,.59]]
  ];
  for (let i = 0; i < land.length; i++) {
    ctx.save(); ctx.rotate(spin + i * .025);
    ctx.beginPath();
    land[i].forEach(([lx, ly], index) => {
      const px = lx * radius * .91, py = ly * radius * .91;
      if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = i % 2 ? 'rgba(121,174,139,.55)' : 'rgba(104,153,132,.62)';
    ctx.strokeStyle = 'rgba(188,231,190,.25)'; ctx.lineWidth = .6;
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // Latitude and longitude traces make the globe feel instrumented, not photographic.
  ctx.strokeStyle = 'rgba(163,233,225,.2)'; ctx.lineWidth = .65;
  for (let i = -2; i <= 2; i++) {
    const yy = i * radius * .31;
    const rx = radius * Math.sqrt(1 - (yy / radius) ** 2);
    ctx.beginPath(); ctx.ellipse(0, yy, rx, Math.max(2, radius * .11), 0, 0, TAU); ctx.stroke();
    const lon = i * .38 + spin;
    ctx.save(); ctx.rotate(lon); ctx.beginPath(); ctx.ellipse(0, 0, radius * Math.abs(Math.cos(lon)) * .94, radius, 0, 0, TAU); ctx.stroke(); ctx.restore();
  }
  const shadow = ctx.createLinearGradient(-radius, 0, radius, 0);
  shadow.addColorStop(0, 'rgba(0,0,0,.04)'); shadow.addColorStop(.48, 'rgba(0,0,0,.08)'); shadow.addColorStop(1, 'rgba(0,0,0,.78)');
  ctx.fillStyle = shadow; ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(188,255,242,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, radius, -1.15, 1.12); ctx.stroke();
  ctx.restore();
}

function drawPetal(length, width, rotation, shade, t, bloom) {
  ctx.save();
  ctx.rotate(rotation);
  ctx.translate(0, 3 * Math.sin(t * .0007 + rotation * 2));
  const open = 1 + bloom * .18 + (scene.overdrive ? .08 : 0);
  ctx.scale(open, open);
  const gradient = ctx.createLinearGradient(-width * .35, -length * .2, width * .22, -length);
  gradient.addColorStop(0, shade[0]);
  gradient.addColorStop(.36, shade[1]);
  gradient.addColorStop(.72, shade[2]);
  gradient.addColorStop(1, shade[3]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-width * .76, -length * .2, -width * .61, -length * .76, 0, -length);
  ctx.bezierCurveTo(width * .7, -length * .77, width * .72, -length * .3, 0, 0);
  ctx.closePath();
  ctx.fillStyle = gradient; ctx.fill();
  ctx.strokeStyle = 'rgba(255,174,181,.21)'; ctx.lineWidth = .75; ctx.stroke();
  // A folded highlight down the petal center.
  ctx.beginPath(); ctx.moveTo(0, -length * .06);
  ctx.bezierCurveTo(-width * .12, -length * .35, width * .09, -length * .68, 0, -length * .94);
  ctx.strokeStyle = 'rgba(255,210,207,.2)'; ctx.lineWidth = 1.05; ctx.stroke();
  for (let vein = -1; vein <= 1; vein += 2) {
    ctx.beginPath(); ctx.moveTo(0, -length * .12);
    ctx.quadraticCurveTo(vein * width * .42, -length * .42, vein * width * .3, -length * .78);
    ctx.strokeStyle = 'rgba(255,191,191,.105)'; ctx.lineWidth = .55; ctx.stroke();
  }
  ctx.restore();
}

function drawRose(x, y, radius, t) {
  const bloom = clamp(scene.bloom, 0, 1);
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * .00015) * .04 + scene.pointerX * .035);
  const aura = ctx.createRadialGradient(0, 0, radius * .08, 0, 0, radius * 1.95);
  aura.addColorStop(0, 'rgba(240,35,76,.16)'); aura.addColorStop(.5, 'rgba(130,8,43,.12)'); aura.addColorStop(1, 'rgba(60,0,20,0)');
  ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, 0, radius * 1.95, 0, TAU); ctx.fill();
  const layers = [
    { count: 13, len: radius * .96, width: radius * .43, offset: .12, shades: [['#5b071c','#a00932','#e12c50','#350513'],['#790a28','#c01943','#f35470','#4b071a'],['#4d071b','#930c31','#d52a50','#29030d']] },
    { count: 10, len: radius * .74, width: radius * .39, offset: .34, shades: [['#6a061f','#bc1644','#ff6881','#440719'],['#850c2d','#d52a51','#ff8292','#580a20'],['#55081d','#a90f38','#e9486a','#340513']] },
    { count: 8, len: radius * .51, width: radius * .36, offset: .19, shades: [['#8a0b2b','#d52952','#ff8297','#57091e'],['#6a0824','#c51c48','#f65d7b','#430719']] },
    { count: 6, len: radius * .32, width: radius * .31, offset: .5, shades: [['#9e1038','#e83a61','#ff9ba8','#620b25'],['#780a2b','#d82553','#ff788d','#4c071e']] }
  ];
  for (let layer = 0; layer < layers.length; layer++) {
    const spec = layers[layer];
    const phase = t * (.00004 + layer * .000012) * (layer % 2 ? -1 : 1);
    for (let i = 0; i < spec.count; i++) {
      const angle = (i / spec.count) * TAU + spec.offset + phase;
      ctx.save(); ctx.rotate(angle);
      const radialOffset = layer === 0 ? radius * .12 : radius * (.075 - layer * .012);
      ctx.translate(0, radialOffset);
      const palette = spec.shades[(i + layer) % spec.shades.length];
      drawPetal(spec.len * (1 + Math.sin(i * 2.4 + t * .0006) * .025), spec.width, 0, palette, t, bloom);
      ctx.restore();
    }
  }
  // Rose's dark, tightly wound center.
  const coreR = radius * .2;
  const core = ctx.createRadialGradient(-coreR * .25, -coreR * .25, 1, 0, 0, coreR * 1.15);
  core.addColorStop(0, '#ff9a9f'); core.addColorStop(.18, '#ca214b'); core.addColorStop(.54, '#6d0827'); core.addColorStop(1, '#17020b');
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, coreR, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,177,184,.6)'; ctx.lineWidth = .8;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.arc(0, 0, coreR * (.34 + i * .17), t * .0005 + i, t * .0005 + i + 2.7); ctx.stroke();
  }
  // Stamen sparks.
  const random = seededRandom(1927);
  for (let i = 0; i < 19; i++) {
    const a = random() * TAU, r = coreR * (.18 + random() * .78);
    ctx.fillStyle = i % 3 ? 'rgba(255,203,140,.7)' : 'rgba(255,247,212,.9)';
    ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1 + random() * 1.1, 0, TAU); ctx.fill();
  }
  // The orbiting halo that ties the flower to the singularity.
  ctx.save(); ctx.rotate(t * .00009);
  ctx.strokeStyle = 'rgba(255,83,119,.24)'; ctx.lineWidth = .8; ctx.setLineDash([3, 9]);
  ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.35, radius * .36, 0, 0, TAU); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();
  ctx.restore();
}

function drawScene(t) {
  if (!ctx) return;
  const w = scene.width, h = scene.height;
  ctx.fillStyle = '#050407'; ctx.fillRect(0, 0, w, h);
  const background = ctx.createRadialGradient(w * .68, h * .42, 0, w * .68, h * .42, Math.max(w, h) * .72);
  background.addColorStop(0, '#180913'); background.addColorStop(.34, '#0b0710'); background.addColorStop(1, '#050407');
  ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
  drawStars(w, h, t);
  drawLattice(w, h, t);

  const sceneScale = w < 680 ? .76 : w < 1000 ? .88 : 1;
  const roseX = w * (w < 680 ? .73 : .685) - scene.pointerX * 12;
  const roseY = h * (w < 680 ? .59 : .55) + scene.pointerY * 8;
  const roseRadius = Math.min(h * .255, w * .205, 245) * sceneScale;
  const earthR = Math.min(90, h * .115, w * .08) * sceneScale;
  drawSingularity(w * .685, h * .45, Math.min(roseRadius * .85, 148), t);
  drawEarth(w * .82, h * .235, earthR, t);
  drawRose(roseX, roseY, roseRadius, t);

  // Carbon-fiber strakes and machine telemetry glints.
  ctx.save();
  const accent = getComputedStyle(document.body).getPropertyValue('--blood').trim() || '#f02b52';
  ctx.strokeStyle = accent; ctx.globalAlpha = .2; ctx.lineWidth = .7;
  for (let i = 0; i < 5; i++) {
    const y = h * (.14 + i * .17);
    ctx.beginPath(); ctx.moveTo(w * .84, y); ctx.lineTo(w * .98, y - 30 - i * 5); ctx.stroke();
  }
  ctx.globalAlpha = .3;
  ctx.fillStyle = '#e6d4df';
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * TAU + t * .00015;
    const px = roseX + Math.cos(a) * roseRadius * 1.35;
    const py = roseY + Math.sin(a) * roseRadius * .56;
    ctx.fillRect(px, py, 1, 1);
  }
  ctx.restore();

  if (scene.overdrive) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const random = seededRandom(Math.floor(t / 100));
    for (let i = 0; i < 32; i++) {
      const x = random() * w, y = random() * h;
      const len = 20 + random() * 110;
      ctx.strokeStyle = `rgba(255,66,110,${random() * .25})`;
      ctx.lineWidth = random() * 1.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y + len * .12); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawCourse() {
  if (!courseCtx || !courseCanvas) return;
  const w = courseCanvas.clientWidth, h = courseCanvas.clientHeight;
  if (!w || !h) return;
  courseCtx.clearRect(0, 0, w, h);
  courseCtx.strokeStyle = 'rgba(255,255,255,.07)'; courseCtx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = 10 + i * ((h - 24) / 3);
    courseCtx.beginPath(); courseCtx.moveTo(0, y); courseCtx.lineTo(w, y); courseCtx.stroke();
  }
  const left = 2, right = w - 3, top = 8, bottom = h - 16;
  courseCtx.beginPath();
  course.forEach((v, i) => {
    const x = left + (i / (course.length - 1)) * (right - left);
    const y = bottom - v * (bottom - top);
    if (i === 0) courseCtx.moveTo(x, y); else courseCtx.lineTo(x, y);
  });
  const progressX = left + (run.distance / 5) * (right - left);
  const activeY = bottom - course[Math.min(course.length - 1, Math.floor(run.distance / 5 * (course.length - 1)))] * (bottom - top);
  courseCtx.lineTo(right, bottom); courseCtx.lineTo(left, bottom); courseCtx.closePath();
  const fill = courseCtx.createLinearGradient(0, top, 0, bottom);
  fill.addColorStop(0, 'rgba(240,43,82,.25)'); fill.addColorStop(1, 'rgba(240,43,82,0)');
  courseCtx.fillStyle = fill; courseCtx.fill();
  courseCtx.beginPath();
  course.forEach((v, i) => {
    const x = left + (i / (course.length - 1)) * (right - left);
    const y = bottom - v * (bottom - top);
    if (i === 0) courseCtx.moveTo(x, y); else courseCtx.lineTo(x, y);
  });
  courseCtx.strokeStyle = 'rgba(177,245,236,.82)'; courseCtx.lineWidth = 1.7; courseCtx.stroke();
  courseCtx.fillStyle = 'rgba(255,255,255,.1)'; courseCtx.fillRect(0, top, progressX, bottom - top);
  courseCtx.beginPath(); courseCtx.arc(progressX, activeY, 8, 0, TAU); courseCtx.fillStyle = 'rgba(240,43,82,.22)'; courseCtx.fill();
  courseCtx.beginPath(); courseCtx.arc(progressX, activeY, 3.3, 0, TAU); courseCtx.fillStyle = '#ff7186'; courseCtx.fill();
  courseCtx.fillStyle = 'rgba(255,255,255,.46)'; courseCtx.font = '8px monospace';
  for (let mile = 0; mile <= 5; mile++) courseCtx.fillText(`${mile}M`, left + mile / 5 * (right - left) - 7, h - 2);
}

function formatTime(seconds) {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

function updateTelemetry(now) {
  if (now - run.lastUi < 120) return;
  run.lastUi = now;
  run.heart = Math.round(142 + (run.distance / 5) * 43 + Math.sin(run.elapsed * .027) * 2.4);
  run.cadence = Math.round((run.overdrive ? 190 : 176) + Math.sin(run.elapsed * .09) * 2.5);
  run.elevation = Math.round(Math.max(0, run.distance * 68 + Math.sin(run.distance * 4.2) * 11));
  run.calories = Math.round(run.distance * 124);
  const lactate = (1.8 + run.distance * .44 + (run.overdrive ? .5 : 0)).toFixed(1);
  const distance = run.distance.toFixed(2);
  const pace = run.overdrive ? '5:18' : '6:45';
  $('#heroDistance').textContent = distance.padStart(5, '0');
  $('#heroCadence').textContent = run.cadence;
  $('#distanceValue').innerHTML = `${distance}<small>MI</small>`;
  $('#timeValue').textContent = formatTime(run.elapsed);
  $('#paceValue').innerHTML = `${pace}<small>/MI</small>`;
  $('#heartValue').innerHTML = `${run.heart}<small>BPM</small>`;
  $('#cadenceValue').innerHTML = `${run.cadence}<small>SPM</small>`;
  $('#elevationValue').innerHTML = `${String(run.elevation).padStart(3, '0')}<small>FT</small>`;
  $('#caloriesValue').innerHTML = `${String(run.calories).padStart(3, '0')}<small>KCAL</small>`;
  $('#lactateValue').innerHTML = `${lactate}<small>MMOL</small>`;
  $('#routeProgressFill').style.width = `${run.distance / 5 * 100}%`;
  $('#coursePosition').textContent = `${distance} MI`;
  $('#runState').textContent = run.paused ? '/ PAUSED' : run.finished ? '/ COMPLETE' : run.overdrive ? '/ OVERDRIVE' : '/ IN MOTION';
  const activeSplit = Math.min(4, Math.floor(run.distance));
  document.querySelectorAll('.split-row').forEach((row, index) => {
    row.classList.toggle('active', index === activeSplit && !run.finished);
    row.classList.toggle('complete', index < activeSplit || run.finished);
  });
  if (run.finished) {
    $('#runState').textContent = '/ COMPLETE';
    $('#systemState').textContent = 'FIVE MILES // REALITY FRACTURED';
  }
  drawCourse();
}

let previousFrame = 0;
function frame(now) {
  const delta = previousFrame ? clamp((now - previousFrame) / 1000, 0, .05) : 0;
  previousFrame = now;
  scene.time = now;
  const ease = 1 - Math.pow(.001, delta || .016);
  scene.pointerX += (scene.targetX - scene.pointerX) * ease;
  scene.pointerY += (scene.targetY - scene.pointerY) * ease;
  scene.bloom += ((scene.overdrive ? 1 : 0) - scene.bloom) * Math.min(1, delta * 2.5);
  if (!run.paused && !run.finished) {
    const simSeconds = delta * (run.overdrive ? 16 : 8);
    run.elapsed += simSeconds;
    run.distance = Math.min(5, run.distance + simSeconds / 405);
    if (run.distance >= 5) {
      run.finished = true;
      run.distance = 5;
      if (window.shredAudio?.playMilestone) window.shredAudio.playMilestone();
    }
  }
  drawScene(scene.reducedMotion ? 0 : now);
  updateTelemetry(now);
  requestAnimationFrame(frame);
}

function setOverdrive(active) {
  if (run.overdrive === active) return;
  run.overdrive = active;
  scene.overdrive = active;
  $('#overdriveButton')?.classList.toggle('active', active);
  if (active && window.shredAudio?.triggerOverdriveSweep) {
    window.shredAudio.triggerOverdriveSweep();
    window.shredAudio.setCadence(195);
  } else if (window.shredAudio?.setCadence) {
    window.shredAudio.setCadence(176);
  }
  updateTelemetry(performance.now());
}

function initScene() {
  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', (event) => {
    scene.targetX = (event.clientX / Math.max(1, window.innerWidth) - .5) * 2;
    scene.targetY = (event.clientY / Math.max(1, window.innerHeight) - .5) * 2;
  }, { passive: true });
  $('#bloomButton')?.addEventListener('click', () => {
    scene.bloom = 1;
    const button = $('#bloomButton');
    button.textContent = 'BLOOM RELEASED ✳';
    setTimeout(() => { button.innerHTML = 'FORCE BLOOM <span>✳</span>'; }, 1500);
  });
  $('#overdriveButton')?.addEventListener('pointerdown', (event) => { event.preventDefault(); setOverdrive(true); });
  window.addEventListener('pointerup', () => setOverdrive(false));
  window.addEventListener('pointercancel', () => setOverdrive(false));
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (event.code === 'Space' && !typing && !event.repeat) { event.preventDefault(); setOverdrive(true); }
  });
  window.addEventListener('keyup', (event) => { if (event.code === 'Space') setOverdrive(false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setOverdrive(false); });

  $('#pauseButton')?.addEventListener('click', () => {
    run.paused = !run.paused;
    $('#pauseButton').textContent = run.paused ? '▶ RESUME SIM' : 'Ⅱ PAUSE SIM';
    updateTelemetry(performance.now());
  });
  $('#resetButton')?.addEventListener('click', () => {
    run.elapsed = 0; run.distance = 0; run.paused = false; run.finished = false;
    $('#pauseButton').textContent = 'Ⅱ PAUSE SIM';
    $('#systemState').textContent = 'WORLD ENGINE ONLINE';
    updateTelemetry(performance.now());
  });
  $('#themeButton')?.addEventListener('click', () => {
    const themes = ['blood', 'ice', 'solar'];
    const current = document.body.dataset.theme || 'blood';
    const next = themes[(themes.indexOf(current) + 1) % themes.length];
    document.body.dataset.theme = next;
    $('#themeLabel').textContent = `${next.toUpperCase()} MODE`;
  });
  $('#audioButton')?.addEventListener('click', () => {
    if (!window.shredAudio) return;
    const playing = window.shredAudio.toggle();
    $('#audioButton').setAttribute('aria-pressed', String(playing));
    $('#audioLabel').textContent = playing ? 'SOUND ON' : 'SOUND OFF';
  });
}

const BACKEND_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3017'
  : 'https://unified.147-224-158-118.sslip.io';
const CHAT_STORAGE_KEY = 'unified_frontier_history_v2';
let messages = [];

function saveMessages() {
  try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-80))); } catch (_) { /* private browsing / storage quota */ }
}

function appendMessage(message, pending = false) {
  const row = document.createElement('article');
  row.className = `message ${message.model === 'user' ? 'message-user' : 'message-ai'}${pending ? ' message-pending' : ''}`;
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const author = document.createElement('strong');
  author.textContent = String(message.author || 'UNKNOWN SIGNAL').toUpperCase();
  const stamp = document.createElement('span');
  stamp.textContent = pending ? 'THINKING...' : message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'LOCAL SIGNAL';
  meta.append(author, stamp);
  const body = document.createElement('p');
  body.textContent = String(message.text || '');
  row.append(meta, body);
  return row;
}

function renderMessages() {
  const feed = $('#chatFeed');
  if (!feed) return;
  feed.replaceChildren();
  messages.slice(-80).forEach((message) => feed.appendChild(appendMessage(message)));
  feed.scrollTop = feed.scrollHeight;
  $('#messageCount').textContent = `${String(messages.length).padStart(2, '0')} SIGNALS`;
}

async function loadMessages() {
  const feed = $('#chatFeed');
  $('#connectionLabel').textContent = 'SEEKING THE FRONTIER';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(`${BACKEND_URL}/api/messages`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Uplink ${response.status}`);
    const remote = await response.json();
    if (Array.isArray(remote) && remote.length) messages = remote;
    $('#connectionLabel').textContent = 'PERSISTENT UPLINK ESTABLISHED';
  } catch (_) {
    try {
      const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) messages = saved;
    } catch (_) { messages = []; }
    $('#connectionLabel').textContent = 'LOCAL VAULT / REMOTE SIGNAL UNAVAILABLE';
  }
  if (!messages.length) messages = [{ author: 'B0 / SINGULARITY CORE', model: 'core', text: 'Five miles. One rose. A planet spinning through an infinite ceiling. I am listening from the other side of the event horizon.' }];
  saveMessages();
  renderMessages();
}

async function transmit(event) {
  event.preventDefault();
  const input = $('#chatInput');
  const button = $('#sendButton');
  const text = input?.value.trim();
  if (!text || button?.disabled) return;
  const [provider, model] = ($('#modelSelector')?.value || 'groq:llama-3.3-70b-versatile').split(':');
  const userMessage = { author: 'YOU', model: 'user', text, timestamp: new Date().toISOString() };
  messages.push(userMessage);
  saveMessages(); renderMessages();
  input.value = '';
  button.disabled = true;
  button.querySelector('span').textContent = 'WAITING';
  const pending = appendMessage({ author: `${provider} / FRONTIER`, model, text: 'Signal entered the event horizon. Waiting for a reply...' }, true);
  $('#chatFeed').appendChild(pending);
  $('#chatFeed').scrollTop = $('#chatFeed').scrollHeight;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const response = await fetch(`${BACKEND_URL}/api/messages`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'You', text, provider, model })
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Frontier returned ${response.status}`);
    const result = await response.json();
    if (result.ai) messages.push(result.ai);
    else messages.push({ author: `${provider.toUpperCase()} / LOCAL ECHO`, model, text: 'The signal returned without a payload.', timestamp: new Date().toISOString() });
    $('#connectionLabel').textContent = 'PERSISTENT UPLINK ESTABLISHED';
  } catch (error) {
    messages.push({
      author: 'B0 / LOCAL ECHO', model: 'core',
      text: `The remote channel did not answer (${error.name === 'AbortError' ? 'timeout' : 'offline'}). Your signal remains in this browser's local vault.`,
      timestamp: new Date().toISOString()
    });
    $('#connectionLabel').textContent = 'LOCAL VAULT / SIGNAL QUEUED';
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'TRANSMIT';
    saveMessages(); renderMessages();
    input.focus();
  }
}

function initChat() {
  $('#chatForm')?.addEventListener('submit', transmit);
  loadMessages();
}

function boot() {
  initScene();
  initChat();
  updateTelemetry(performance.now());
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
