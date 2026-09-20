// Pure data logic — no chrome.* or DOM access, so it runs under `node --test`.
//
// Ranking: every host in the last 90 days of history gets a "frecency" score —
//   (visits + 3 × typed visits) × (0.3 + 0.7 × e^(−age/21 days))
// summed per host, plus a small bonus from Chrome's own Top Sites. Nothing is
// entered by hand; pin/hide are optional overrides.

export const DAY = 86_400_000;
export const HISTORY_DAYS = 90;
export const RECENCY_HALF = 21;

export function parseWeb(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch { return null; }
}

export const hostKey = (u) => u.host.replace(/^www\./, '');

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Best human name for a host: prefer the brand segment of real page titles
// ("Dashboard | Render" → "Render", "tp-job/repo · GitHub" → "GitHub"),
// fall back to the registrable label ("dashboard.render.com" → "Render Dashboard").
export function siteName(host, titles) {
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

export function rankSites(history, topSites, hidden = new Set(), now = Date.now()) {
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

  for (const item of history ?? []) {
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

  (topSites ?? []).forEach((site, i, all) => {
    const u = parseWeb(site.url);
    if (!u || hidden.has(hostKey(u))) return;
    const e = entryFor(u);
    e.score += (all.length - i) * 2;
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

// Pinned sites first (in pin order), then the ranking, capped at `limit`.
export function composeTiles(sites, prefs, limit) {
  const hidden = new Set(prefs.hidden);
  const byHost = new Map(sites.map((s) => [s.host, s]));
  const pinned = prefs.pinned
    .filter((p) => !hidden.has(p.host))
    .map((p) => ({ ...(byHost.get(p.host) ?? { visits: 0, lastVisit: 0, score: 0 }), ...p, pinned: true }));
  const pinnedHosts = new Set(pinned.map((p) => p.host));
  return [...pinned, ...sites.filter((s) => !pinnedHosts.has(s.host))].slice(0, limit);
}

export function recentPages(history, hidden = new Set(), limit = 6) {
  const seen = new Set();
  const out = [];
  const newestFirst = [...(history ?? [])].sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0));
  for (const item of newestFirst) {
    const u = parseWeb(item.url);
    if (!u || hidden.has(hostKey(u)) || seen.has(item.url)) continue;
    if (u.pathname === '/' && !u.search) continue; // homepages already live in the tiles
    seen.add(item.url);
    out.push({ url: item.url, title: item.title || item.url, host: hostKey(u), lastVisit: item.lastVisitTime });
    if (out.length >= limit) break;
  }
  return out;
}

export function sanitizePrefs(raw) {
  const pinned = Array.isArray(raw?.pinned)
    ? raw.pinned.filter((p) => p && typeof p.host === 'string' && typeof p.url === 'string')
    : [];
  const hidden = Array.isArray(raw?.hidden) ? [...new Set(raw.hidden.filter((h) => typeof h === 'string'))] : [];
  return { pinned, hidden };
}

/* ---------------------------------------------------------------- search */

export function looksLikeUrl(text) {
  if (/\s/.test(text)) return false;
  return /^[a-z]+:\/\//i.test(text) || /^localhost(:\d+)?(\/|$)/i.test(text) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text);
}

export function toUrl(text) {
  if (/^[a-z]+:\/\//i.test(text)) return text;
  return (/^localhost/i.test(text) ? 'http://' : 'https://') + text;
}

// 0 = no match. Prefix > word-boundary > substring > in-order subsequence.
export function fuzzy(query, text) {
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

export function siteMatches(sites, q, limit = 5) {
  const maxScore = sites.reduce((m, s) => Math.max(m, s.score), 1);
  return sites
    .map((s) => {
      const m = Math.max(fuzzy(q, s.name), fuzzy(q, s.host));
      return { site: s, rank: m ? m + 20 * (s.score / maxScore) : 0 };
    })
    .filter((r) => r.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);
}

/* ---------------------------------------------------------------- bookmarks */

// javascript: bookmarklets are blocked by the page's CSP, so they are skipped.
const LAUNCHABLE = /^(https?|ftp|file|chrome|edge|about|chrome-extension):/i;
export const isLaunchable = (url) => typeof url === 'string' && LAUNCHABLE.test(url);

function bookmarkTitle(node) {
  const title = (node.title ?? '').trim();
  if (title) return title;
  const u = parseWeb(node.url);
  return u ? hostKey(u) : node.url;
}

// Every folder that directly holds links becomes one group, labelled with its path.
// The root folders (Bookmarks bar, Other, Mobile) come in browser order.
export function buildGroups(tree) {
  const root = Array.isArray(tree) ? tree[0] : tree;
  const groups = [];

  const walk = (folder, path) => {
    const children = folder.children ?? [];
    const items = children
      .filter((node) => node.url && isLaunchable(node.url))
      .map((node) => ({ id: node.id, title: bookmarkTitle(node), url: node.url }));
    if (items.length) groups.push({ id: folder.id, title: path.at(-1), path, items });
    for (const node of children) {
      if (!node.url && node.children) walk(node, [...path, node.title || '']);
    }
  };

  for (const top of root?.children ?? []) walk(top, [top.title || '']);
  return groups;
}

/* ---------------------------------------------------------------- time */

export function greetingKey(hour) {
  if (hour < 5) return 'greetingNight';
  if (hour < 11) return 'greetingMorning';
  if (hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

// Largest sensible unit for a "5 minutes ago" label.
export function agoParts(ts, now = Date.now()) {
  if (!ts) return null;
  const m = Math.round((now - ts) / 60_000);
  if (m < 1) return [0, 'minute'];
  if (m < 60) return [-m, 'minute'];
  const h = Math.round(m / 60);
  if (h < 24) return [-h, 'hour'];
  const d = Math.round(h / 24);
  return d < 30 ? [-d, 'day'] : [-Math.round(d / 30), 'month'];
}
