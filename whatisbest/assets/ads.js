/* Ad monetization: popunder/newtab on affiliate-link click + optional banner slots.
   CONFIG: paste your ad network tag/URL below. Popunder = "Direct Link" URL from
   your ad network dashboard. Banner = paste the JS snippet into the slot placeholder. */
(function () {
  var CONFIG = {
    NETWORK: 'adsterra',                 // adsterra | propellerads | hilltopads
    POPUNDER_URL: '',                    // Adsterra popunder is a JS, not a direct link — handled below
    POPUNDER_JS: 'https://pl30743049.effectivecpmnetwork.com/df/13/09/df13099134fb33ca202b6a06f1d35926.js',
    POPUNDER_SESSION_MS: 6 * 3600 * 1000,
    BANNER_SNIPPET:
      '<scr'+'ipt>atOptions={key:"5d27a879a5043153d0830d389ac093a0",format:"iframe",height:90,width:728,params:{}};<\/scr'+'ipt>' +
      '<scr'+'ipt src="https://www.highperformanceformat.com/5d27a879a5043153d0830d389ac093a0/invoke.js"><\/scr'+'ipt>',
    POPUNDER_ONLY_EXTERNAL: true
  };

  /* ---------- Popunder / new-tab ad on external CTA click ---------- */
  function maybePopunder() {
    if (!CONFIG.POPUNDER_JS) return;
    var last = +(localStorage.getItem('wib_pu') || 0);
    if (Date.now() - last < CONFIG.POPUNDER_SESSION_MS) return;
    localStorage.setItem('wib_pu', Date.now());
    var s = document.createElement('script');
    s.src = CONFIG.POPUNDER_JS;
    document.body.appendChild(s);
  }

  function onClick(e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var external = a.hostname && a.hostname !== location.hostname;
    if (CONFIG.POPUNDER_ONLY_EXTERNAL && !external) return;
    if (!a.classList.contains('cta') && !external) return;
    maybePopunder();
  }
  document.addEventListener('click', onClick, true);

  /* ---------- Banner slots ---------- */
  function injectBanners() {
    if (!CONFIG.BANNER_SNIPPET) return;
    document.querySelectorAll('.ad-slot').forEach(function (slot) {
      var div = document.createElement('div');
      div.innerHTML = CONFIG.BANNER_SNIPPET;
      Array.prototype.slice.call(div.querySelectorAll('script')).forEach(function (old) {
        var s = document.createElement('script');
        if (old.src) s.src = old.src;
        s.text = old.text;
        Array.prototype.forEach.call(old.attributes, function (at) {
          if (at.name !== 'src') s.setAttribute(at.name, at.value);
        });
        slot.appendChild(s);
      });
    });
  }
  if (document.readyState !== 'loading') injectBanners();
  else document.addEventListener('DOMContentLoaded', injectBanners);
})();
