// Small DOM + storage helpers shared by the page modules.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'vars') for (const [name, value] of Object.entries(v)) node.style.setProperty(name, value); // CSSOM, allowed by the CSP
    else if (k === 'data') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

export const ICONS = {
  pin: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/></svg>',
  hide: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4M6.6 6.6A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 4.4-1"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  go: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  system: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};

// Parse each static icon once; callers get a cheap clone.
const iconCache = new Map();
export function svg(name) {
  let tpl = iconCache.get(name);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.innerHTML = ICONS[name]; // static, trusted markup only
    tpl.content.firstChild.setAttribute('aria-hidden', 'true');
    tpl.content.firstChild.setAttribute('focusable', 'false');
    iconCache.set(name, tpl);
  }
  return tpl.content.firstChild.cloneNode(true);
}

export function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* per-device convenience only */ }
}

// Run non-urgent work (e.g. big localStorage writes) when the main thread is idle.
export const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));
