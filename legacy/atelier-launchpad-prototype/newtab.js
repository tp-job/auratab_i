'use strict';

/* Atelier Launchpad
 *
 * Ranking: every host in the last 90 days of history gets a "frecency" score —
 *   (visits + 3 × typed visits) × (0.3 + 0.7 × e^(−age/21 days))
 * summed per host, plus a small bonus from Chrome's own Top Sites. Nothing is
 * entered by hand; pin/hide are optional overrides stored in chrome.storage.sync.
 *
 * Outside the extension (opened as a plain file) it falls back to demo data so
 * the layout can be previewed without loading it into Chrome.
 */

const DAY = 86_400_000;
const HISTORY_DAYS = 90;
const RECENCY_HALF = 21;
const BENTO_SMALL = 8;   // cards around the #1 feature card
const DOCK_COUNT = 12;
const RECENT_COUNT = 6;
const CACHE_KEY = 'launchpad:snapshot:v1';

const isExtension = typeof chrome !== 'undefined' && !!chrome.history;
const api = isExtension ? createChromeApi() : createDemoApi();

const state = {
  history: [],
  topSites: [],
  prefs: { pinned: [], hidden: [] },
  sites: [],      // full ranked list (for search)
  tiles: [],      // what is on screen, in order (for Alt+1–9)
  results: [],
  active: -1,
  queryToken: 0,
};

/* ---------------------------------------------------------------- data api */

function createChromeApi() {
  return {
    history: () => chrome.history.search({ text: '', startTime: Date.now() - HISTORY_DAYS * DAY, maxResults: 5000 }),
    topSites: () => chrome.topSites.get(),
    searchHistory: (text) => chrome.history.search({ text, startTime: 0, maxResults: 50 }),
    searchBookmarks: (text) => chrome.bookmarks.search(text),
    favicon(pageUrl) {
      const u = new URL(chrome.runtime.getURL('/_favicon/'));
      u.searchParams.set('pageUrl', pageUrl);
      u.searchParams.set('size', '64');
      return u.toString();
    },
    getPrefs: () => chrome.storage.sync.get({ pinned: [], hidden: [] }),
    setPrefs: (prefs) => chrome.storage.sync.set(prefs),
    webSearch: (text, background) => chrome.search.query({ text, disposition: background ? 'NEW_TAB' : 'CURRENT_TAB' }),
    openBackground: (url) => chrome.tabs.create({ url, active: false }),
  };
}

function createDemoApi() {
  const now = Date.now();
  const h = (url, title, visitCount, typedCount, hoursAgo) =>
    ({ url, title, visitCount, typedCount, lastVisitTime: now - hoursAgo * 3_600_000 });
  const history = [
    h('https://github.com/tp-job/nevinas_ka_i', 'tp-job/nevinas_ka_i · GitHub', 212, 40, 0.3),
    h('https://github.com/notifications', 'Notifications · GitHub', 64, 6, 5),
    h('https://mail.google.com/mail/u/0/#inbox', 'Inbox (4) - Gmail', 180, 30, 1),
    h('https://chatgpt.com/', 'ChatGPT', 40, 12, 30),
    h('https://claude.ai/new', 'Claude', 160, 45, 0.1),
    h('https://www.youtube.com/', 'YouTube', 140, 20, 3),
    h('https://www.figma.com/files/recent', 'Recents – Figma', 88, 10, 8),
    h('https://dashboard.render.com/', 'Dashboard | Render', 52, 14, 20),
    h('https://developer.mozilla.org/en-US/docs/Web/CSS/color-mix', 'color-mix() - CSS | MDN', 46, 2, 26),
    h('https://tailwindcss.com/docs/theme', 'Theme variables - Core concepts - Tailwind CSS', 38, 3, 50),
    h('https://www.notion.so/', 'Notion', 70, 18, 12),
    h('https://calendar.google.com/calendar/u/0/r', 'Google Calendar - Week', 60, 11, 4),
    h('https://docs.google.com/document/u/0/', 'Google Docs', 34, 4, 70),
    h('https://www.linkedin.com/feed/', 'Feed | LinkedIn', 30, 5, 48),
    h('https://stackoverflow.com/questions', 'Newest Questions - Stack Overflow', 28, 1, 96),
    h('https://vercel.com/dashboard', 'Dashboard – Vercel', 24, 6, 120),
    h('https://threejs.org/docs/', 'three.js docs', 22, 2, 140),
    h('https://www.pantip.com/', 'Pantip', 18, 4, 200),
    h('https://translate.google.com/', 'Google Translate', 26, 8, 36),
    h('http://localhost:10005/', 'nevinas_ka_i — dev', 90, 12, 2),
    h('https://app.clickup.com/', 'ClickUp', 16, 2, 300),
    h('https://www.reddit.com/r/webdev/', 'r/webdev', 14, 1, 400),
  ];
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('launchpad:demo-prefs')) ?? { pinned: [], hidden: [] }; } catch { return { pinned: [], hidden: [] }; } },
    set(v) { try { localStorage.setItem('launchpad:demo-prefs', JSON.stringify(v)); } catch { /* preview only */ } },
  };
  const matches = (text) => (item) => `${item.title} ${item.url}`.toLowerCase().includes(text.toLowerCase());
  return {
    history: async () => history,
    topSites: async () => history.slice(0, 8).map(({ url, title }) => ({ url, title })),
    searchHistory: async (text) => history.filter(matches(text)),
    searchBookmarks: async (text) => [
      { title: 'Nocturnal Atelier v3.2 — design system', url: 'https://github.com/tp-job/nevinas_ka_i/blob/main/.agent/design-system/md/design-v3-2.md' },
      { title: 'Chrome extension docs — chrome.history', url: 'https://developer.chrome.com/docs/extensions/reference/api/history' },
    ].filter(matches(text)),
    favicon: () => null,
    getPrefs: async () => store.get(),
    setPrefs: async (v) => store.set(v),
    webSearch: (text, background) => {
      const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      background ? window.open(url, '_blank') : location.assign(url);
    },
    openBackground: (url) => window.open(url, '_blank'),
  };
}

/* ---------------------------------------------------------------- ranking */

function parseWeb(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch { return null; }
}

const hostKey = (u) => u.host.replace(/^www\./, '');

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Best human name for a host: prefer the brand segment of real page titles
// ("Inbox - Gmail" → "Gmail", "tp-job/repo · GitHub" → "GitHub"),
// fall back to the registrable label ("dashboard.render.com" → "Render").
function siteName(host, titles) {
  const hostname = host.split(':')[0];
  if (hostname === 'localhost' || /^[\d.]+$/.test(hostname)) return host;

  const parts = hostname.split('.');
  let i = parts.length - 2;
  if (parts.length >= 3 && parts[i].length <= 3 && parts[parts.length - 1].length === 2) i -= 1; // co.th, ac.uk …
  const label = parts[Math.max(0, i)];
  const sub = parts.slice(0, Math.max(0, i)).filter((p) => !['www', 'm', 'app'].includes(p)).join(' ');

  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sorted = [...titles.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  for (const title of sorted.slice(0, 8)) {
    const segments = title.split(/\s[-|·—–:]\s/).map((s) => s.trim()).filter(Boolean);
    const hit = segments.find((seg) => seg.length <= 28 && norm(seg).includes(norm(label)));
    if (hit) return hit;
  }
  // Single-word title with no separators is usually the brand itself.
  const plain = sorted.find((t) => t.length <= 20 && !/[-|·—–:(]/.test(t));
  if (plain && !sub) return plain;
  return sub ? `${cap(label)} ${cap(sub)}` : cap(label);
}

function rankSites(history, topSites, hidden) {
  const now = Date.now();
  const hosts = new Map();

  const entryFor = (u) => {
    const key = hostKey(u);
    let e = hosts.get(key);
    if (!e) {
      e = { host: key, origin: u.origin, visits: 0, score: 0, lastVisit: 0, titles: new Map() };
      hosts.set(key, e);
    } else if (u.protocol === 'https:') {
      e.origin = u.origin;
    }
    return e;
  };

  for (const item of history) {
    const u = parseWeb(item.url);
    if (!u || hidden.has(hostKey(u))) continue;
    const e = entryFor(u);
    const visits = item.visitCount ?? 0;
    const age = Math.max(0, (now - (item.lastVisitTime ?? now)) / DAY);
    const recency = Math.exp(-age / RECENCY_HALF);
    e.visits += visits;
    e.score += (visits + (item.typedCount ?? 0) * 3) * (0.3 + 0.7 * recency);
    e.lastVisit = Math.max(e.lastVisit, item.lastVisitTime ?? 0);
    if (item.title) e.titles.set(item.title, (e.titles.get(item.title) ?? 0) + Math.max(1, visits));
  }

  topSites.forEach((site, i) => {
    const u = parseWeb(site.url);
    if (!u || hidden.has(hostKey(u))) return;
    const e = entryFor(u);
    e.score += (topSites.length - i) * 2;
    if (site.title && !e.titles.size) e.titles.set(site.title, 1);
  });

  return [...hosts.values()]
    .map((e) => ({
      host: e.host,
      url: `${e.origin}/`,
      name: siteName(e.host, e.titles),
      visits: e.visits,
      score: e.score,
      lastVisit: e.lastVisit,
    }))
    .sort((a, b) => b.score - a.score);
}

function recentPages(history, hidden) {
  const seen = new Set();
  return [...history]
    .sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))
    .filter((item) => {
      const u = parseWeb(item.url);
      if (!u || hidden.has(hostKey(u)) || seen.has(item.url)) return false;
      if (u.pathname === '/' && !u.search) return false; // homepages already live in the tiles
      seen.add(item.url);
      return true;
    })
    .slice(0, RECENT_COUNT)
    .map((item) => ({ url: item.url, title: item.title || item.url, host: hostKey(new URL(item.url)), lastVisit: item.lastVisitTime }));
}

/* ---------------------------------------------------------------- helpers */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

const SVG = {
  pin: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/></svg>',
  hide: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4M6.6 6.6A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 4.4-1"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  go: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup; // static, trusted markup only
  return t.content.firstChild;
}

const MONO = [
  ['#524E68', '#44405A'],
  ['#465078', '#524E68'],
  ['#85758F', '#524E68'],
  ['#44405A', '#465078'],
  ['#878CB4', '#465078'],
];

function hash(s) {
  let x = 0;
  for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(x);
}

function iconFor(url, name, host) {
  const [m1, m2] = MONO[hash(host) % MONO.length];
  const letter = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '·').toUpperCase();
  const node = el('span', { class: 'icon', style: `--m1:${m1};--m2:${m2}`, 'aria-hidden': 'true' }, letter);
  const src = api.favicon(url);
  if (src) {
    const img = el('img', { src, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('load', () => node.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
    node.append(img);
  }
  return node;
}

function ago(ts) {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : `${Math.round(d / 30)}mo ago`;
}

const fmt = new Intl.NumberFormat();

/* ---------------------------------------------------------------- render */

function composeTiles() {
  const hidden = new Set(state.prefs.hidden);
  state.sites = rankSites(state.history, state.topSites, hidden);
  const byHost = new Map(state.sites.map((s) => [s.host, s]));

  const pinned = state.prefs.pinned
    .filter((p) => !hidden.has(p.host))
    .map((p) => ({ ...(byHost.get(p.host) ?? { visits: 0, lastVisit: 0, score: 0 }), ...p, pinned: true }));
  const pinnedHosts = new Set(pinned.map((p) => p.host));
  const ranked = state.sites.filter((s) => !pinnedHosts.has(s.host));

  return [...pinned, ...ranked].slice(0, 1 + BENTO_SMALL + DOCK_COUNT);
}

function tileActions(site) {
  const pin = el('button', {
    class: 'act', type: 'button',
    'aria-pressed': site.pinned ? 'true' : 'false',
    'aria-label': site.pinned ? `Unpin ${site.name}` : `Pin ${site.name} to the front`,
    title: site.pinned ? 'Unpin' : 'Pin to front',
    onclick: () => togglePin(site),
  }, svg(SVG.pin));
  const hide = el('button', {
    class: 'act', type: 'button',
    'aria-label': `Hide ${site.name}`, title: 'Hide from launchpad',
    onclick: () => hideSite(site),
  }, svg(SVG.hide));
  return el('div', { class: 'tile-actions' }, pin, hide);
}

const pad2 = (n) => String(n).padStart(2, '0');
const share = (site, max) => (max ? Math.max(4, Math.round((site.score / max) * 100)) : 0);

// #1 — the velvet card in the centre column, same treatment as BentoGrid's bc--3.
function featureCard(site) {
  return el('article', { class: 'bc bc--feature', style: '--i:0' },
    el('span', { class: 'velvet', 'aria-hidden': 'true' }),
    el('a', { href: site.url, title: `${site.name} — ${site.host}` },
      el('div', { class: 'feature-top' },
        iconFor(site.url, site.name, site.host),
        el('span', { class: 'pill' }, site.pinned ? 'Pinned · 01' : 'Most used · 01')),
      el('div', {},
        el('p', { class: 'feature-name' }, site.name),
        el('p', { class: 'feature-host' }, site.host)),
      el('dl', { class: 'feature-stats' },
        el('div', {}, el('dt', {}, 'Visits'), el('dd', {}, site.visits ? fmt.format(site.visits) : '—')),
        el('div', {}, el('dt', {}, 'Last seen'), el('dd', {}, ago(site.lastVisit) || '—'))),
      el('span', { class: 'feature-cta' },
        el('span', { class: 'paren' }, '('), 'Alt 1 → Open', el('span', { class: 'paren' }, ')'))),
    tileActions(site));
}

function siteCard(site, i, max) {
  const rank = i + 1;
  return el('article', { class: 'bc bc--site', style: `--i:${rank}` },
    el('a', { href: site.url, title: `${site.name} — ${site.host}${site.visits ? ` · ${fmt.format(site.visits)} visits` : ''}` },
      el('span', { class: 'bc-eyebrow' },
        iconFor(site.url, site.name, site.host),
        site.pinned ? el('span', { class: 'pinned-dot', title: 'Pinned' }) : null),
      el('span', { style: 'display:flex;flex-direction:column;gap:4px;min-width:0' },
        el('span', { class: 'bc-title' }, site.name),
        el('span', { class: 'bc-sub' }, site.host)),
      el('span', { class: 'meter' },
        el('span', { class: 'meter-track' }, el('i', { style: `--w:${share(site, max)}%` })),
        el('span', {}, site.visits ? fmt.format(site.visits) : 'pinned'))),
    el('span', { class: 'rank-num', 'aria-hidden': 'true' }, pad2(rank)),
    tileActions(site));
}

const SHARE_COLORS = ['#AFAECC', '#878CB4', '#85758F', '#524E68'];

function statsCard(sites) {
  const total = sites.reduce((n, s) => n + s.score, 0) || 1;
  const visits = sites.reduce((n, s) => n + s.visits, 0);
  const top = sites.slice(0, 4).map((s, i) => ({ s, pct: (s.score / total) * 100, c: SHARE_COLORS[i] }));
  const top3 = Math.round(top.slice(0, 3).reduce((n, t) => n + t.pct, 0));
  const otherPct = Math.max(0, 100 - top.reduce((n, t) => n + t.pct, 0));

  return el('article', { class: 'bc bc--stats', style: `--i:${1 + BENTO_SMALL}` },
    el('span', { class: 'bc-eyebrow' }, `Insight · ${HISTORY_DAYS} days`, isExtension ? null : el('span', {}, 'demo')),
    el('p', { class: 'stat-big' }, fmt.format(visits), el('small', {}, `visits · ${fmt.format(sites.length)} sites`)),
    el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
      el('div', { class: 'share-bar', role: 'img', 'aria-label': top.map((t) => `${t.s.name} ${Math.round(t.pct)}%`).join(', ') },
        ...top.map((t) => el('i', { style: `--w:${t.pct}%;--c:${t.c}` })),
        el('i', { style: `--w:${otherPct}%;--c:transparent` })),
      el('p', { class: 'share-legend' },
        ...top.map((t) => el('span', {}, el('i', { style: `--c:${t.c}` }), `${t.s.name} ${Math.round(t.pct)}%`))),
      el('p', { class: 'bc-sub' }, `Your top 3 sites take ${top3}% of your attention.`)));
}

function recentCard(pages) {
  return el('article', { class: 'bc bc--recent', style: `--i:${2 + BENTO_SMALL}` },
    el('span', { class: 'bc-eyebrow' }, 'Pick up where you left off'),
    el('ul', { class: 'recent-list' }, ...pages.map((p) =>
      el('li', {}, el('a', { href: p.url, title: p.url },
        iconFor(p.url, p.title, p.host),
        el('span', { class: 'recent-text' },
          el('span', { class: 'recent-title' }, p.title),
          el('span', { class: 'recent-sub' }, `${p.host} · ${ago(p.lastVisit)}`)))))));
}

function dockItem(site) {
  return el('li', { class: 'dock-item' },
    el('a', { href: site.url, title: `${site.name} — ${site.host}${site.visits ? ` · ${fmt.format(site.visits)} visits` : ''}` },
      iconFor(site.url, site.name, site.host),
      el('span', { class: 'dock-name' }, site.name)),
    tileActions(site));
}

function render() {
  const tiles = composeTiles();
  state.tiles = tiles;
  const [feature, ...rest] = tiles;
  const small = rest.slice(0, BENTO_SMALL);
  const dock = rest.slice(BENTO_SMALL);
  const max = Math.max(0, ...state.sites.map((s) => s.score));
  const recent = recentPages(state.history, new Set(state.prefs.hidden));

  const bento = document.getElementById('bento');
  bento.replaceChildren(...(feature ? [
    featureCard(feature),
    ...small.map((s, i) => siteCard(s, i + 1, max)),
    state.sites.length ? statsCard(state.sites) : null,
    recent.length ? recentCard(recent) : null,
  ] : []).filter(Boolean));
  bento.hidden = !feature;
  document.getElementById('empty').hidden = Boolean(feature);

  document.getElementById('dock').replaceChildren(...dock.map(dockItem));
  document.getElementById('dock-section').hidden = dock.length === 0;

  document.getElementById('meta').textContent = state.sites.length
    ? `Ranked by real usage · updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const reset = document.getElementById('reset');
  reset.hidden = state.prefs.hidden.length === 0;
  reset.textContent = `Restore ${state.prefs.hidden.length} hidden site${state.prefs.hidden.length === 1 ? '' : 's'}`;
}

// Cursor spotlight on bento cards — one delegated listener, CSS does the rest.
document.getElementById('bento').addEventListener('pointermove', (e) => {
  const card = e.target instanceof Element ? e.target.closest('.bc') : null;
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

/* ---------------------------------------------------------------- prefs */

async function savePrefs() {
  await api.setPrefs(state.prefs);
  render();
  snapshot();
}

function togglePin(site) {
  const { pinned } = state.prefs;
  state.prefs.pinned = site.pinned
    ? pinned.filter((p) => p.host !== site.host)
    : [...pinned, { host: site.host, url: site.url, name: site.name }];
  savePrefs();
}

function hideSite(site) {
  state.prefs.pinned = state.prefs.pinned.filter((p) => p.host !== site.host);
  state.prefs.hidden = [...new Set([...state.prefs.hidden, site.host])];
  savePrefs();
}

document.getElementById('reset').addEventListener('click', () => {
  state.prefs.hidden = [];
  savePrefs();
});

/* ---------------------------------------------------------------- search */

const input = document.getElementById('q');
const panel = document.getElementById('results');

function looksLikeUrl(text) {
  if (/\s/.test(text)) return false;
  return /^[a-z]+:\/\//i.test(text) || /^localhost(:\d+)?(\/|$)/i.test(text) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text);
}

function toUrl(text) {
  if (/^[a-z]+:\/\//i.test(text)) return text;
  return (/^localhost/i.test(text) ? 'http://' : 'https://') + text;
}

// 0 = no match. Prefix > word-boundary > substring > in-order subsequence.
function fuzzy(query, text) {
  const t = text.toLowerCase();
  const idx = t.indexOf(query);
  if (idx === 0) return 100;
  if (idx > 0) return /[\s./\-_·|]/.test(t[idx - 1]) ? 85 : 70 - Math.min(idx, 20);
  let from = 0;
  let gaps = 0;
  for (const ch of query) {
    const found = t.indexOf(ch, from);
    if (found < 0) return 0;
    gaps += found - from;
    from = found + 1;
  }
  return Math.max(1, 40 - gaps * 2);
}

function highlight(text, query) {
  const i = text.toLowerCase().indexOf(query);
  if (i < 0 || !query) return [text];
  return [text.slice(0, i), el('mark', {}, text.slice(i, i + query.length)), text.slice(i + query.length)];
}

function siteMatches(q) {
  const maxScore = Math.max(1, ...state.sites.map((s) => s.score));
  return state.sites
    .map((s) => {
      const m = Math.max(fuzzy(q, s.name), fuzzy(q, s.host));
      return { site: s, rank: m ? m + 20 * (s.score / maxScore) : 0 };
    })
    .filter((r) => r.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 5);
}

function buildResults(raw, extra = {}) {
  const q = raw.toLowerCase();
  const out = [];
  if (looksLikeUrl(raw)) out.push({ kind: 'go', group: 'Go to', title: raw, sub: toUrl(raw), url: toUrl(raw) });

  const sites = siteMatches(q);
  const strongSite = sites.length && sites[0].rank >= 70;
  const web = { kind: 'web', group: 'Web', title: `Search the web for “${raw}”`, sub: 'Default search engine', text: raw };

  if (!strongSite) out.push(web);
  for (const { site } of sites) {
    out.push({ kind: 'site', group: 'Your sites', title: site.name, sub: site.host, url: site.url, host: site.host, tag: site.visits ? `${fmt.format(site.visits)} visits` : '' });
  }
  if (strongSite) out.push(web);

  const seen = new Set(out.map((r) => r.url).filter(Boolean));
  const add = (group, items, limit) => {
    let n = 0;
    for (const item of items) {
      const u = parseWeb(item.url);
      if (!u || seen.has(item.url) || n >= limit) continue;
      seen.add(item.url);
      out.push({ kind: 'page', group, title: item.title || item.url, sub: `${hostKey(u)}${u.pathname === '/' ? '' : u.pathname}`, url: item.url, host: hostKey(u), tag: group === 'History' && item.lastVisitTime ? ago(item.lastVisitTime) : '' });
      n += 1;
    }
  };
  add('Bookmarks', extra.bookmarks ?? [], 4);
  add('History', (extra.history ?? []).sort((a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0)), 5);
  return out;
}

function renderResults(query) {
  const q = query.toLowerCase();
  const nodes = [];
  let group = null;
  state.results.forEach((r, i) => {
    if (r.group !== group) {
      group = r.group;
      nodes.push(el('div', { class: 'results-group', role: 'presentation' }, group));
    }
    const lead = r.kind === 'web' ? el('span', { class: 'glyph' }, svg(SVG.search))
      : r.kind === 'go' ? el('span', { class: 'glyph' }, svg(SVG.go))
      : iconFor(r.url, r.title, r.host);
    nodes.push(el('a', {
      class: 'result', id: `r-${i}`, role: 'option',
      href: r.url ?? '#',
      'aria-selected': i === state.active ? 'true' : 'false',
      tabindex: '-1',
      onclick: (e) => { e.preventDefault(); openResult(r, e.ctrlKey || e.metaKey || e.button === 1); },
      onmousemove: () => setActive(i),
    },
      lead,
      el('span', { class: 'result-text' },
        el('span', { class: 'result-title' }, r.kind === 'site' || r.kind === 'page' ? highlight(r.title, q) : r.title),
        el('span', { class: 'result-sub' }, r.sub)),
      r.tag ? el('span', { class: 'result-tag' }, r.tag) : null));
  });
  panel.replaceChildren(...nodes);
  const open = state.results.length > 0;
  panel.hidden = !open;
  input.setAttribute('aria-expanded', String(open));
  input.setAttribute('aria-activedescendant', state.active >= 0 ? `r-${state.active}` : '');
}

function setActive(i) {
  if (i === state.active) return;
  panel.querySelector(`#r-${state.active}`)?.setAttribute('aria-selected', 'false');
  state.active = i;
  const node = panel.querySelector(`#r-${i}`);
  node?.setAttribute('aria-selected', 'true');
  node?.scrollIntoView({ block: 'nearest' });
  input.setAttribute('aria-activedescendant', node ? node.id : '');
}

async function runSearch() {
  const raw = input.value.trim();
  const token = ++state.queryToken;
  if (!raw) {
    state.results = [];
    state.active = -1;
    renderResults('');
    return;
  }
  // Local results paint immediately; bookmarks + history join when they resolve.
  state.results = buildResults(raw);
  state.active = 0;
  renderResults(raw);

  const [bookmarks, history] = await Promise.all([
    api.searchBookmarks(raw).catch(() => []),
    api.searchHistory(raw).catch(() => []),
  ]);
  if (token !== state.queryToken) return;
  state.results = buildResults(raw, { bookmarks, history });
  state.active = Math.min(Math.max(state.active, 0), state.results.length - 1);
  renderResults(raw);
}

function openResult(r, background) {
  if (r.kind === 'web') return api.webSearch(r.text, background);
  if (background) return api.openBackground(r.url);
  location.assign(r.url);
}

let debounce = 0;
input.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(runSearch, 60);
});

input.addEventListener('keydown', (e) => {
  const n = state.results.length;
  if (e.key === 'ArrowDown' && n) { e.preventDefault(); setActive((state.active + 1) % n); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setActive((state.active - 1 + n) % n); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;
    // Enter before the debounce fired: search synchronously on what's typed.
    const r = state.results[state.active] ?? buildResults(raw)[0];
    if (r) openResult(r, e.ctrlKey || e.metaKey);
  } else if (e.key === 'Escape') {
    if (input.value) { input.value = ''; runSearch(); }
    else input.blur();
  }
});

input.addEventListener('blur', () => setTimeout(() => {
  if (document.activeElement !== input) { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); }
}, 150));
input.addEventListener('focus', () => { if (state.results.length) { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); } });

document.addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); return; }
  if (e.altKey && /^[1-9]$/.test(e.key)) {
    const tile = state.tiles[Number(e.key) - 1];
    if (tile) { e.preventDefault(); e.shiftKey ? api.openBackground(tile.url) : location.assign(tile.url); }
  }
});

/* ---------------------------------------------------------------- clock */

const GREETINGS = [
  [5, 'Up late', 'こんばんは'],
  [11, 'Good morning', 'おはようございます'],
  [18, 'Good afternoon', 'こんにちは'],
  [24, 'Good evening', 'こんばんは'],
];

function tick() {
  const now = new Date();
  const hr = now.getHours();
  const [, en, jp] = GREETINGS.find(([until]) => hr < until);
  document.getElementById('greeting').textContent = `${en} — welcome back.`;
  document.getElementById('greeting-jp').textContent = jp;

  // "16:24" with a softly pulsing colon, StatementSlide scale
  const parts = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).formatToParts(now);
  document.getElementById('clock').replaceChildren(...parts.map((p) =>
    p.type === 'literal' && p.value.trim() === ':' ? el('span', { class: 'colon' }, ':')
      : p.type === 'dayPeriod' ? el('span', { style: 'font-size:0.3em;letter-spacing:0;margin-left:0.2em' }, p.value)
      : p.value));
  document.getElementById('clock').setAttribute('aria-label', now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  document.getElementById('eyebrow').textContent = now
    .toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/,/g, '').split(' ').join(' · ');

  setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
}

/* ---------------------------------------------------------------- theme */

const THEME_ICONS = {
  system: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};
const THEME_ORDER = ['system', 'dark', 'light'];
const themeBtn = document.getElementById('theme');

function paintThemeButton() {
  const pref = window.launchpadTheme?.get() ?? 'system';
  themeBtn.replaceChildren(svg(THEME_ICONS[pref]));
  themeBtn.setAttribute('aria-label', `Theme: ${pref}. Click to change.`);
  themeBtn.title = `Theme: ${pref}`;
}

themeBtn.addEventListener('click', () => {
  const pref = window.launchpadTheme?.get() ?? 'system';
  window.launchpadTheme?.set(THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length]);
  paintThemeButton();
});

/* ---------------------------------------------------------------- boot */

// Last snapshot is only painted if live history is slow (>150 ms), so the
// entry animation plays once on real data instead of twice.
function snapshot() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      history: state.history.slice(0, 1500), topSites: state.topSites, prefs: state.prefs,
    }));
  } catch { /* quota or disabled storage — the live pass still renders */ }
}

function restore() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!cached) return false;
    Object.assign(state, { history: cached.history ?? [], topSites: cached.topSites ?? [], prefs: cached.prefs ?? state.prefs });
    render();
    return true;
  } catch { return false; }
}

async function boot() {
  tick();
  paintThemeButton();

  const live = Promise.all([
    api.history().catch(() => []),
    api.topSites().catch(() => []),
    api.getPrefs().catch(() => ({ pinned: [], hidden: [] })),
  ]);
  const slow = await Promise.race([live.then(() => false), new Promise((r) => setTimeout(() => r(true), 150))]);
  if (slow && restore()) document.body.classList.add('calm');

  const [history, topSites, prefs] = await live;
  Object.assign(state, { history, topSites, prefs: { pinned: prefs.pinned ?? [], hidden: prefs.hidden ?? [] } });
  render();
  snapshot();
  // Later re-renders (pin, hide) swap cards in place without replaying the entrance.
  setTimeout(() => document.body.classList.add('calm'), 1600);
  input.focus({ preventScroll: true });
}

boot();
