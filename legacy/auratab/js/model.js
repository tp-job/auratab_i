// Pure data helpers — no chrome.* access, so they run under `node --test`.

export const TOP_SITE_LIMITS = Object.freeze([4, 6, 8, 10, 12, 16, 20]);
export const MAX_STATS = 500;

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  density: 'comfortable',
  showTopSites: true,
  topSitesLimit: 8,
  showBookmarks: true,
  includeOtherRoots: true,
  bookmarkOrder: 'browser',
  hiddenSites: Object.freeze([]),
  collapsed: Object.freeze([]),
});

const ENUMS = {
  theme: ['system', 'light', 'dark'],
  density: ['comfortable', 'compact'],
  bookmarkOrder: ['browser', 'usage'],
};
const BOOLEANS = ['showTopSites', 'showBookmarks', 'includeOtherRoots'];
const STRING_LISTS = ['hiddenSites', 'collapsed'];

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  for (const [key, values] of Object.entries(ENUMS)) {
    if (values.includes(raw[key])) s[key] = raw[key];
  }
  for (const key of BOOLEANS) {
    if (typeof raw[key] === 'boolean') s[key] = raw[key];
  }
  const limit = Number(raw.topSitesLimit);
  if (TOP_SITE_LIMITS.includes(limit)) s.topSitesLimit = limit;
  for (const key of STRING_LISTS) {
    if (Array.isArray(raw[key])) s[key] = [...new Set(raw[key].filter((x) => typeof x === 'string'))];
  }
  return s;
}

// URLs a New Tab page can actually open. javascript: bookmarklets are blocked by CSP, so skip them.
const LAUNCHABLE = /^(https?|ftp|file|chrome|edge|about|chrome-extension|extension):/i;

export const isLaunchable = (url) => typeof url === 'string' && LAUNCHABLE.test(url);
export const isWebUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url);

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function displayTitle(node) {
  const title = (node.title ?? '').trim();
  return title || hostnameOf(node.url) || node.url;
}

export function buildTopSites(sites, { hidden = [], limit = DEFAULT_SETTINGS.topSitesLimit } = {}) {
  const skip = new Set(hidden);
  const out = [];
  for (const site of sites ?? []) {
    if (!isLaunchable(site.url) || skip.has(site.url)) continue;
    skip.add(site.url);
    out.push({ title: displayTitle(site), url: site.url });
    if (out.length >= limit) break;
  }
  return out;
}

const isBookmarksBar = (node, index) =>
  node.folderType ? node.folderType === 'bookmarks-bar' : index === 0;

// Every folder that directly holds links becomes one card, titled with its folder path.
export function buildGroups(tree, { includeOtherRoots = true } = {}) {
  const root = Array.isArray(tree) ? tree[0] : tree;
  const groups = [];

  const walk = (folder, path) => {
    const children = folder.children ?? [];
    const items = [];
    for (const node of children) {
      if (node.url && isLaunchable(node.url)) {
        items.push({ id: node.id, title: displayTitle(node), url: node.url });
      }
    }
    if (items.length) groups.push({ id: folder.id, title: path.at(-1), path, items });
    for (const node of children) {
      if (!node.url && node.children) walk(node, [...path, node.title || '']);
    }
  };

  (root?.children ?? []).forEach((top, i) => {
    if (includeOtherRoots || isBookmarksBar(top, i)) walk(top, [top.title || '']);
  });
  return groups;
}

export function sortByUsage(items, stats) {
  const count = (item) => stats?.[item.url]?.count ?? 0;
  return [...items].sort((a, b) => count(b) - count(a)); // stable: ties keep browser order
}

export function bumpLaunch(stats, url, now = Date.now(), max = MAX_STATS) {
  const prev = stats?.[url];
  const next = { ...stats, [url]: { count: (prev?.count ?? 0) + 1, last: now } };
  const urls = Object.keys(next);
  if (urls.length <= max) return next;
  urls.sort((a, b) => next[b].last - next[a].last);
  return Object.fromEntries(urls.slice(0, max).map((u) => [u, next[u]]));
}

export const searchText = (item) =>
  `${item.title} ${item.url.replace(/^[a-z-]+:\/\/(www\.)?/i, '')}`.toLowerCase();

export const tokenize = (query) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

export const matchesTokens = (text, tokens) => tokens.every((token) => text.includes(token));

export function letterFor(item) {
  const source = hostnameOf(item.url) || item.title || '';
  const match = source.match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : '•';
}

export function greetingKey(hour) {
  if (hour < 5) return 'greetingNight';
  if (hour < 12) return 'greetingMorning';
  if (hour < 17) return 'greetingAfternoon';
  if (hour < 22) return 'greetingEvening';
  return 'greetingNight';
}
