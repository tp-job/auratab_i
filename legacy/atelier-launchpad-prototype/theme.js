'use strict';

// Theme preference: 'system' | 'dark' | 'light'. Runs synchronously in <head>
// so the resolved theme is on <html> before first paint — no light flash.
(() => {
  const KEY = 'launchpad:theme';
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: light)');

  const read = () => {
    try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
  };

  const apply = (pref) => {
    root.dataset.theme = pref;
    root.dataset.resolvedTheme = pref === 'system' ? (media.matches ? 'light' : 'dark') : pref;
  };

  apply(read());
  media.addEventListener('change', () => apply(read()));

  window.launchpadTheme = {
    get: read,
    set(pref) {
      try { localStorage.setItem(KEY, pref); } catch { /* per-viewer convenience only */ }
      apply(pref);
    },
  };
})();
