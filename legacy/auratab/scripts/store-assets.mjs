// Renders Chrome Web Store / Edge Add-ons images into store/ using headless Edge or Chrome.
// The real newtab page is served locally with a stubbed chrome.* API and demo data.
// Set BROWSER=<path to chrome/msedge> if auto-detection fails.
// --qa renders the design-system review set (375/768/1024/1440 × light/dark) into dist/qa/ instead.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QA = process.argv.includes('--qa');
const OUT = QA ? join(ROOT, 'dist', 'qa') : join(ROOT, 'store');

const STORE_SHOTS = [
  { file: 'screenshot-1-light.png', size: [1280, 800], query: 'theme=light' },
  { file: 'screenshot-2-dark.png', size: [1280, 800], query: 'theme=dark' },
  { file: 'screenshot-3-search.png', size: [1280, 800], query: 'theme=light&q=dev' },
  { file: 'screenshot-4-settings.png', size: [1280, 800], query: 'theme=light&settings=1' },
  { file: 'screenshot-5-thai.png', size: [1280, 800], query: 'theme=dark&lang=th' },
  { file: 'promo-small-440x280.png', size: [440, 280], page: '/__promo.html' },
  { file: 'promo-marquee-1400x560.png', size: [1400, 560], page: '/__promo.html' },
];

// Headless windows can't be narrower than ~500px, so phone widths render inside an iframe.
const QA_SHOTS = [375, 768, 1024, 1440].flatMap((w) => ['light', 'dark'].map((theme) => ({
  file: `qa-${w}-${theme}.png`,
  size: [Math.max(w, 520), 1100],
  page: '/__frame.html',
  query: `w=${w}&src=${encodeURIComponent(`/__page.html?theme=${theme}`)}`,
})));
const SHOTS = QA ? QA_SHOTS : STORE_SHOTS;

const CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const DEMO = {
  topSites: [
    ['GitHub', 'github.com'], ['YouTube', 'youtube.com'], ['Gmail', 'mail.google.com'],
    ['Stack Overflow', 'stackoverflow.com'], ['MDN', 'developer.mozilla.org'], ['Figma', 'figma.com'],
    ['Notion', 'notion.so'], ['Calendar', 'calendar.google.com'],
  ].map(([title, host]) => ({ title, url: `https://${host}/` })),
  tree: [{ id: '0', children: [
    { id: '1', title: 'Bookmarks bar', folderType: 'bookmarks-bar', children: [
      { id: 'a', title: 'Claude', url: 'https://claude.ai/' },
      { id: 'b', title: 'Extensions', url: 'chrome://extensions' },
      { id: 'w', title: 'Work', children: [
        { id: 'c', title: 'Sprint board', url: 'https://jira.example.com/' },
        { id: 'd', title: 'Team wiki', url: 'https://wiki.example.com/' },
        { id: 'e', title: 'Design system', url: 'https://design.example.com/' },
      ] },
      { id: 'v', title: 'Dev', children: [
        { id: 'f', title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' },
        { id: 'g', title: 'Chrome extension docs', url: 'https://developer.chrome.com/docs/extensions' },
        { id: 'h', title: 'Can I use', url: 'https://caniuse.com/' },
        { id: 'i', title: 'npm', url: 'https://www.npmjs.com/' },
      ] },
    ] },
    { id: '2', title: 'Other bookmarks', folderType: 'other', children: [
      { id: 'j', title: 'ข่าวไทย', url: 'https://www.thairath.co.th/' },
      { id: 'k', title: 'Hacker News', url: 'https://news.ycombinator.com/' },
      { id: 'l', title: 'Recipes', url: 'https://recipes.example.com/' },
    ] },
    { id: '3', title: 'Mobile bookmarks', folderType: 'mobile', children: [] },
  ] }],
};

function stubScript() {
  const locales = Object.fromEntries(['en', 'th'].map((l) =>
    [l, JSON.parse(readFileSync(join(ROOT, '_locales', l, 'messages.json'), 'utf8'))]));
  return `
(() => {
  const Q = new URLSearchParams(location.search);
  const lang = Q.get('lang') || 'en';
  const M = ${JSON.stringify(locales)}[lang];
  const DEMO = ${JSON.stringify(DEMO)};
  const RealDate = Date;
  const fixed = new RealDate(2026, 8, 18, 9, 41).getTime();
  window.Date = class extends RealDate {
    constructor(...a) { a.length ? super(...a) : super(fixed); }
    static now() { return fixed; }
  };
  const store = { settings: { theme: Q.get('theme') || 'system' } };
  const ev = { addListener() {} };
  window.chrome = {
    i18n: {
      getMessage: (k, s) => { let m = M[k]?.message || ''; (s || []).forEach((v, i) => { m = m.replace('$' + (i + 1), v); }); return m; },
      getUILanguage: () => lang,
    },
    runtime: { getURL: (p) => location.origin + '/__nofavicon' + p },
    storage: { local: { get: async () => structuredClone(store), set: async (o) => Object.assign(store, o), remove: async (k) => delete store[k] }, onChanged: ev },
    topSites: { get: async () => DEMO.topSites },
    bookmarks: { getTree: async () => DEMO.tree, onCreated: ev, onRemoved: ev, onChanged: ev, onMoved: ev, onChildrenReordered: ev, onImportEnded: ev },
    tabs: { update() {}, create() {} },
    search: { query() {} },
  };
  addEventListener('load', () => setTimeout(() => {
    const q = Q.get('q');
    if (q) { const s = document.getElementById('search'); s.value = q; s.dispatchEvent(new Event('input')); s.focus(); }
    if (Q.get('settings')) { document.getElementById('open-settings').click(); document.activeElement.blur(); }
  }, 200));
})();`;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function serve(req, res) {
  const path = new URL(req.url, 'http://x').pathname;
  const send = (status, type, body) => { res.writeHead(status, { 'content-type': `${type}; charset=utf-8` }); res.end(body); };
  if (path === '/__stub.js') return send(200, TYPES['.js'], stubScript());
  if (path === '/__page.html') {
    const html = readFileSync(join(ROOT, 'newtab.html'), 'utf8')
      .replace('<script type="module"', '<script src="/__stub.js"></script><script type="module"');
    return send(200, TYPES['.html'], html);
  }
  if (path === '/__frame.html') {
    const q = new URL(req.url, 'http://x').searchParams;
    const w = Number(q.get('w')) || 375;
    return send(200, TYPES['.html'], `<!doctype html><body style="margin:0;background:#777">` +
      `<iframe src="${q.get('src')}" style="display:block;width:${w}px;height:100vh;border:0"></iframe></body>`);
  }
  if (path === '/__promo.html') return send(200, TYPES['.html'], readFileSync(join(ROOT, 'scripts/assets/promo.html')));
  const file = normalize(join(ROOT, decodeURIComponent(path)));
  if (!file.startsWith(ROOT) || !existsSync(file)) return send(404, 'text/plain', 'not found');
  send(200, TYPES[extname(file)] ?? 'application/octet-stream', readFileSync(file));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

const browser = CANDIDATES.find((p) => p && existsSync(p));
if (!browser) {
  console.error('No Chrome/Edge found. Set BROWSER=<path to browser executable>.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const server = createServer(serve).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = mkdtempSync(join(tmpdir(), 'auratab-shots-'));

try {
  for (const shot of SHOTS) {
    const url = `${origin}${shot.page ?? '/__page.html'}${shot.query ? `?${shot.query}` : ''}`;
    const out = join(OUT, shot.file);
    await run(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--force-device-scale-factor=1',
      `--user-data-dir=${profile}`, `--window-size=${shot.size.join(',')}`,
      '--virtual-time-budget=4000', `--screenshot=${out}`, url,
    ]);
    console.log('wrote', out);
  }
} finally {
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
