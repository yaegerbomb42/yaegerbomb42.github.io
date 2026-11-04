export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) e.style.setProperty(p, x);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export const svg = (markup, cls = '') => {
  const d = document.createElement('div');
  d.innerHTML = markup.trim();
  const s = d.firstChild;
  if (cls) s.setAttribute('class', cls);
  return s;
};

export const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Standard normal CDF (Abramowitz & Stegun 26.2.17)
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// Staircase ability estimate: average difficulty of the later items, nudged by accuracy.
export function staircaseAbility(log) {
  const tail = log.slice(Math.floor(log.length / 3));
  const avg = tail.reduce((s, x) => s + x.level, 0) / tail.length;
  const acc = log.filter((x) => x.ok).length / log.length;
  return avg + (acc - 0.5) * 2;
}
