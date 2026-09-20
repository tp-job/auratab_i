// Data access. Inside the extension this wraps chrome.*; served as a plain web
// page it falls back to demo data, so the layout can be previewed without
// loading the extension into Chrome.

import { DAY, HISTORY_DAYS, parseWeb } from './model.js';
import { readLocal, writeLocal } from './dom.js';

export const isExtension = typeof chrome !== 'undefined' && !!chrome.history;
export const api = isExtension ? createChromeApi() : createDemoApi();

const BOOKMARK_EVENTS = ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded'];

function createChromeApi() {
  return {
    history: () => chrome.history.search({ text: '', startTime: Date.now() - HISTORY_DAYS * DAY, maxResults: 5000 }),
    topSites: () => chrome.topSites.get(),
    bookmarkTree: () => chrome.bookmarks.getTree(),
    onBookmarksChanged(fn) {
      for (const ev of BOOKMARK_EVENTS) chrome.bookmarks[ev]?.addListener(fn);
    },
    searchHistory: (text) => chrome.history.search({ text, startTime: 0, maxResults: 50 }),
    searchBookmarks: (text) => chrome.bookmarks.search(text),
    favicon(pageUrl) {
      const u = new URL(chrome.runtime.getURL('/_favicon/'));
      u.searchParams.set('pageUrl', pageUrl);
      u.searchParams.set('size', '64');
      return u.toString();
    },
    getPrefs: () => chrome.storage.sync.get({ pinned: [], hidden: [], categories: {}, weather: null }),
    setPrefs: (prefs) => chrome.storage.sync.set(prefs),
    onPrefsChanged(fn) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && (changes.pinned || changes.hidden || changes.categories || changes.weather)) fn();
      });
    },
    async isPinnedToToolbar() {
      try { return (await chrome.action.getUserSettings()).isOnToolbar; } catch { return true; }
    },
    onToolbarChanged: (fn) => chrome.action.onUserSettingsChanged?.addListener(fn),
    webSearch: (text, background) => chrome.search.query({ text, disposition: background ? 'NEW_TAB' : 'CURRENT_TAB' }),
    openBackground: (url) => chrome.tabs.create({ url, active: false }),
    // chrome://, file:// … can't be opened by a plain link from an extension page.
    open: (url) => (parseWeb(url) ? location.assign(url) : chrome.tabs.update({ url })),
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
  const b = (id, title, url) => ({ id, title, url });
  const tree = [{ id: '0', children: [
    { id: '1', title: 'Bookmarks bar', children: [
      b('10', 'GitHub', 'https://github.com/'),
      b('11', 'Gmail', 'https://mail.google.com/'),
      b('12', 'Calendar', 'https://calendar.google.com/'),
      { id: '20', title: 'Design', children: [
        b('21', 'Nocturnal Atelier v3.2 — design system', 'https://github.com/tp-job/nevinas_ka_i/blob/main/.agent/design-system/md/design-v3-2.md'),
        b('22', 'Figma', 'https://www.figma.com/'),
        b('23', 'Refactoring UI', 'https://www.refactoringui.com/'),
        b('24', 'Type scale', 'https://typescale.com/'),
        b('25', 'Coolors', 'https://coolors.co/'),
        b('26', 'Realtime colors', 'https://www.realtimecolors.com/'),
        b('27', 'Fontshare', 'https://www.fontshare.com/'),
        b('28', 'Mobbin', 'https://mobbin.com/'),
      ] },
      { id: '30', title: 'Docs', children: [
        b('31', 'Chrome extension docs — chrome.history', 'https://developer.chrome.com/docs/extensions/reference/api/history'),
        b('32', 'MDN', 'https://developer.mozilla.org/'),
        b('33', 'three.js docs', 'https://threejs.org/docs/'),
      ] },
    ] },
    { id: '2', title: 'Other bookmarks', children: [b('40', 'Pantip', 'https://pantip.com/'), b('41', 'r/webdev', 'https://www.reddit.com/r/webdev/')] },
  ] }];
  const flat = (nodes) => nodes.flatMap((n) => (n.url ? [n] : flat(n.children ?? [])));
  const matches = (text) => (item) => `${item.title} ${item.url}`.toLowerCase().includes(text.toLowerCase());
  const webSearchUrl = (text) => `https://www.google.com/search?q=${encodeURIComponent(text)}`;

  return {
    history: async () => history,
    topSites: async () => history.slice(0, 8).map(({ url, title }) => ({ url, title })),
    bookmarkTree: async () => tree,
    onBookmarksChanged() {},
    searchHistory: async (text) => history.filter(matches(text)),
    searchBookmarks: async (text) => flat(tree).filter(matches(text)),
    favicon: () => null,
    getPrefs: async () => readLocal('launchpad:demo-prefs', { pinned: [], hidden: [], categories: {}, weather: null }),
    setPrefs: async (v) => writeLocal('launchpad:demo-prefs', v),
    onPrefsChanged() {},
    isPinnedToToolbar: async () => false,
    onToolbarChanged() {},
    webSearch: (text, background) => (background ? window.open(webSearchUrl(text), '_blank') : location.assign(webSearchUrl(text))),
    openBackground: (url) => window.open(url, '_blank'),
    open: (url) => location.assign(url),
  };
}
