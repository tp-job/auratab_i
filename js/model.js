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

export function recentPages(history, hidden = new Set(), limit = 20) {
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
  const categories = Object.fromEntries(Object.entries(raw?.categories ?? {})
    .filter(([host, id]) => typeof host === 'string' && CATEGORY_IDS.includes(id)));
  return { pinned, hidden, categories, weather: sanitizePlace(raw?.weather) };
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

/* ---------------------------------------------------------------- categories */

// Every site and bookmark folder falls into one of these. "other" is the
// catch-all and is always last; this order is the order of the chips.
export const CATEGORY_IDS = ['dev', 'ai', 'work', 'social', 'media', 'news', 'learn', 'shopping', 'finance', 'other'];

// Host patterns, matched as whole dot-separated segments — "x.com" does not
// match "sphinx.com". First rule that matches wins, so the list runs from the
// most specific family to the most general.
const CATEGORY_RULES = [
  ['ai', ['chatgpt', 'openai', 'claude.ai', 'anthropic', 'gemini.google', 'aistudio.google', 'bard.google', 'perplexity', 'huggingface', 'midjourney', 'copilot.microsoft', 'deepseek', 'mistral.ai', 'poe.com', 'x.ai', 'grok.com', 'civitai', 'leonardo.ai', 'runwayml', 'elevenlabs', 'suno.com', 'ideogram.ai']],
  ['work', ['mail.google', 'gmail', 'calendar.google', 'drive.google', 'docs.google', 'sheets.google', 'slides.google', 'meet.google', 'keep.google', 'groups.google', 'accounts.google', 'myaccount.google', 'outlook', 'office.com', 'office365', 'sharepoint', 'onedrive', 'teams.microsoft', 'notion.so', 'notion.com', 'slack.com', 'zoom.us', 'asana', 'trello', 'clickup', 'atlassian', 'jira', 'confluence', 'monday.com', 'linear.app', 'basecamp', 'dropbox', 'box.com', 'figma', 'canva', 'miro.com', 'evernote', 'todoist', 'airtable', 'zapier', 'calendly', 'docusign', 'hubspot', 'salesforce']],
  ['dev', ['github', 'gitlab', 'bitbucket', 'stackoverflow', 'stackexchange', 'serverfault', 'superuser', 'npmjs', 'yarnpkg', 'pypi', 'crates.io', 'packagist', 'developer.mozilla', 'developer.chrome', 'developer.apple', 'developer.android', 'web.dev', 'caniuse', 'devdocs', 'readthedocs', 'w3schools', 'w3.org', 'whatwg', 'regex101', 'codepen', 'codesandbox', 'stackblitz', 'replit', 'jsfiddle', 'glitch.com', 'jetbrains', 'visualstudio', 'nodejs', 'deno.com', 'bun.sh', 'react.dev', 'reactjs', 'vuejs', 'svelte.dev', 'angular.dev', 'angular.io', 'nextjs', 'nuxt.com', 'astro.build', 'vite.dev', 'vitejs', 'tailwindcss', 'getbootstrap', 'threejs', 'jquery', 'python.org', 'rust-lang', 'go.dev', 'golang', 'php.net', 'ruby-lang', 'kotlinlang', 'swift.org', 'docker', 'kubernetes', 'terraform', 'ansible', 'vercel', 'netlify', 'render.com', 'onrender.com', 'railway.app', 'fly.io', 'heroku', 'cloudflare', 'digitalocean', 'linode', 'aws.amazon', 'console.aws', 'cloud.google', 'portal.azure', 'azure.microsoft', 'supabase', 'firebase', 'planetscale', 'prisma.io', 'mongodb', 'postgresql', 'mysql.com', 'redis.io', 'sqlite.org', 'sentry.io', 'datadoghq', 'grafana', 'postman', 'swagger.io', 'insomnia.rest', 'ngrok', 'reactbits.dev', 'shadcn', 'radix-ui', 'chakra-ui', 'mui.com', 'motion.dev', 'framer.com', 'fontawesome', 'flaticon', 'iconify', 'icones.js.org', 'lucide.dev', 'heroicons', 'remixicon', 'boxicons', 'fonts.google', 'fontshare', 'freecodecamp']],
  ['social', ['facebook', 'fb.com', 'messenger', 'instagram', 'threads.net', 'threads.com', 'twitter', 'x.com', 'tiktok', 'reddit', 'linkedin', 'discord', 'telegram', 'whatsapp', 'snapchat', 'pinterest', 'line.me', 'weibo', 'mastodon', 'bsky.app', 'bluesky', 'tumblr', 'quora', 'pantip', 'vk.com']],
  ['media', ['youtube', 'youtu.be', 'netflix', 'twitch', 'spotify', 'soundcloud', 'disneyplus', 'primevideo', 'hulu', 'hbomax', 'viu.com', 'iqiyi', 'wetv', 'bilibili', 'vimeo', 'dailymotion', 'deezer', 'tidal.com', 'music.apple', 'tv.apple', 'crunchyroll', 'nicovideo', 'webtoons', 'mangadex', 'anilist', 'myanimelist', 'imdb', 'letterboxd', 'steampowered', 'epicgames', 'itch.io']],
  ['news', ['bbc.co', 'bbc.com', 'cnn.com', 'nytimes', 'washingtonpost', 'theguardian', 'reuters', 'apnews', 'aljazeera', 'nhk.or', 'thairath', 'khaosod', 'matichon', 'dailynews.co', 'posttoday', 'bangkokpost', 'sanook', 'kapook', 'techcrunch', 'theverge', 'arstechnica', 'wired.com', 'engadget', 'news.ycombinator', 'slashdot', 'zdnet', 'cnet.com', 'blognone']],
  ['learn', ['coursera', 'udemy', 'edx.org', 'khanacademy', 'duolingo', 'skillshare', 'pluralsight', 'codecademy', 'leetcode', 'hackerrank', 'codewars', 'exercism', 'wikipedia', 'wikimedia', 'scholar.google', 'translate.google', 'arxiv', 'jstor', 'researchgate', 'sciencedirect', 'pubmed', 'nature.com', 'brilliant.org', 'monkeytype', 'chula.ac', 'ku.ac', 'mahidol.ac']],
  ['shopping', ['amazon', 'ebay', 'shopee', 'lazada', 'aliexpress', 'alibaba', 'taobao', 'temu.com', 'etsy', 'walmart', 'target.com', 'bestbuy', 'ikea', 'jd.com', 'rakuten', 'shein', 'banggood', 'jib.co', 'advice.co', 'kaidee']],
  ['finance', ['binance', 'coinbase', 'bybit', 'okx.com', 'bitkub', 'tradingview', 'paypal', 'stripe.com', 'wise.com', 'revolut', 'settrade', 'investing.com', 'bloomberg', 'marketwatch', 'finance.yahoo', 'xe.com', 'kasikornbank', 'kbank', 'scb.co', 'scbeasy', 'krungsri', 'bangkokbank', 'ktb.co', 'gsb.or', 'ttbbank']],
];

// A pattern matches when it lines up with whole host segments.
function hostMatches(host, pattern) {
  return host === pattern
    || host.endsWith('.' + pattern)
    || host.startsWith(pattern + '.')
    || host.includes('.' + pattern + '.');
}

// Local dev servers ("localhost:5173", "127.0.0.1:5500", "192.168.1.4",
// "api.test.local") are the strongest dev signal there is, so they win first.
const LOCAL_HOST = /^(localhost|\[?::1\]?|[\d.]+|.+\.local)$/i;
// .dev and .sh are developer TLDs; .test/.localhost are reserved for local work.
const DEV_TLD = /\.(dev|sh|test|localhost)$/i;

export function categorize(host) {
  const h = String(host ?? '').toLowerCase().replace(/^www\./, '');
  if (!h) return 'other';
  const bare = h.split(':')[0];
  if (LOCAL_HOST.test(bare)) return 'dev';
  for (const [id, patterns] of CATEGORY_RULES) {
    if (patterns.some((p) => hostMatches(bare, p))) return id;
  }
  return DEV_TLD.test(bare) ? 'dev' : 'other';
}

// prefs.categories is a { host: categoryId } map of manual corrections, so a
// site that lands in the wrong drawer can be moved without touching the rules.
export function categoryOf(host, overrides) {
  const manual = overrides?.[host];
  return CATEGORY_IDS.includes(manual) ? manual : categorize(host);
}

// Counts per category for a chip row, in CATEGORY_IDS order, empty ones dropped.
export function categoryCounts(items) {
  const counts = new Map();
  for (const item of items ?? []) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return CATEGORY_IDS.filter((id) => counts.has(id)).map((id) => ({ id, count: counts.get(id) }));
}

// A folder takes the category most of its links agree on. Ties go to whichever
// reached the count first, which keeps small folders from flipping about.
export function folderCategory(items, overrides) {
  const counts = new Map();
  let best = 'other';
  let bestN = 0;
  for (const item of items ?? []) {
    const u = parseWeb(item.url);
    const id = u ? categoryOf(hostKey(u), overrides) : 'other';
    const n = (counts.get(id) ?? 0) + 1;
    counts.set(id, n);
    if (n > bestN) { best = id; bestN = n; }
  }
  return best;
}

/* ---------------------------------------------------------------- weather */

// WMO weather interpretation codes → one of eight buckets. Each bucket is both
// an icon name in dom.js ICONS and a message key ("wxClear", "wxRain", …).
export function wmoBucket(code) {
  const c = Number(code);
  if (c === 0) return 'clear';
  if (c === 1 || c === 2) return 'partly';
  if (c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 51 && c <= 57) return 'drizzle';
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c >= 95 && c <= 99) return 'storm';
  return 'cloudy';
}

// Open-Meteo times are local to the place ("2026-09-27T06:07"), which is what a
// sunrise should read in, so they are sliced rather than run through Date.
const clockOf = (iso) => (typeof iso === 'string' && /T\d\d:\d\d/.test(iso) ? iso.slice(11, 16) : '');

// One forecast response → the reading the page paints. `hourly` covers the next
// few hours from now, so its highest precipitation chance is "rain soon".
export function readingFrom(data, place, at) {
  const now = data?.current ?? {};
  const day = data?.daily ?? {};
  const chances = (data?.hourly?.precipitation_probability ?? []).filter(Number.isFinite);
  const reading = {
    temp: Math.round(now.temperature_2m),
    feels: Math.round(now.apparent_temperature),
    humidity: Math.round(now.relative_humidity_2m),
    high: Math.round(day.temperature_2m_max?.[0]),
    low: Math.round(day.temperature_2m_min?.[0]),
    rainChance: chances.length ? Math.max(...chances) : null,
    sunrise: clockOf(day.sunrise?.[0]),
    sunset: clockOf(day.sunset?.[0]),
    bucket: wmoBucket(now.weather_code),
    isDay: now.is_day !== 0,
    unit: place.unit,
    name: place.name,
    at,
  };
  if (!Number.isFinite(reading.temp)) throw new Error('no reading');
  return reading;
}

// Open-Meteo returns coordinates with more precision than a weather forecast
// needs; two decimals (~1 km) is plenty and keeps less location data around.
export const roundCoord = (n) => Math.round(Number(n) * 100) / 100;

export function sanitizePlace(raw) {
  const lat = Number(raw?.lat);
  const lon = Number(raw?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    lat: roundCoord(lat),
    lon: roundCoord(lon),
    name: typeof raw?.name === 'string' ? raw.name.slice(0, 80) : '',
    unit: raw?.unit === 'f' ? 'f' : 'c',
  };
}
