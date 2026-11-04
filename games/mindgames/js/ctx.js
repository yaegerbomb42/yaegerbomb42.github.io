// Per-game runtime: abortable waits, input helpers, timers, HUD, feedback.
export const ABORT = Symbol('abort');
export const TIMEOUT = Symbol('timeout');

const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function makeCtx(stage, hud, fx) {
  let aborted = false;
  const cleanups = new Set();

  const ctx = {
    stage, hud, fx, TIMEOUT,
    get aborted() { return aborted; },

    abort() {
      if (aborted) return;
      aborted = true;
      for (const c of [...cleanups]) c();
      cleanups.clear();
    },

    // setup(resolve) may return a cleanup fn; it runs on resolve or abort.
    waitFor(setup) {
      return new Promise((resolve, reject) => {
        if (aborted) return reject(ABORT);
        let settled = false, cleanup = null;
        const finish = () => { settled = true; cleanups.delete(onAbort); cleanup?.(); };
        const onAbort = () => { if (!settled) { finish(); reject(ABORT); } };
        cleanups.add(onAbort);
        cleanup = setup((v) => { if (!settled) { finish(); resolve(v); } }) || null;
        if (settled) cleanup?.();
      });
    },

    sleep(ms) {
      return ctx.waitFor((res) => { const t = setTimeout(res, ms); return () => clearTimeout(t); });
    },

    // Wait for a click on one of [el, value] pairs or a key in keymap. Resolves TIMEOUT after `timeout` ms.
    choose(items = [], keymap = {}, timeout = 0) {
      return ctx.waitFor((res) => {
        const offs = [];
        for (const [el, v] of items) {
          const f = (e) => { e.preventDefault(); res(v); };
          el.addEventListener('pointerdown', f);
          offs.push(() => el.removeEventListener('pointerdown', f));
        }
        const kf = (e) => {
          if (e.repeat || e.metaKey || e.ctrlKey) return;
          const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
          if (k in keymap) { e.preventDefault(); res(keymap[k]); }
        };
        addEventListener('keydown', kf);
        offs.push(() => removeEventListener('keydown', kf));
        if (timeout) { const t = setTimeout(() => res(TIMEOUT), timeout); offs.push(() => clearTimeout(t)); }
        return () => offs.forEach((o) => o());
      });
    },

    // Countdown timer shown in the HUD. `t.end` resolves TIMEOUT when time runs out.
    timer(sec) {
      const endAt = performance.now() + sec * 1000;
      const t = { expired: false, left: () => Math.max(0, endAt - performance.now()) };
      hud.set('time', fmt(sec * 1000));
      t.end = ctx.waitFor((res) => {
        t.stop = () => res(null);
        const iv = setInterval(() => {
          const l = t.left();
          hud.set('time', fmt(l));
          hud.urgent(l < 5000);
          if (l <= 0) { t.expired = true; res(TIMEOUT); }
        }, 100);
        return () => { clearInterval(iv); hud.urgent(false); };
      });
      t.end.catch(() => {});
      // Race an input promise against the clock.
      t.race = (p) => Promise.race([p, t.end]);
      return t;
    },
  };
  return ctx;
}
