import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_IDS, DAY, agoParts, bookmarkHealth, buildGroups, categorize, categoryCounts, categoryOf, composeTiles,
  folderCategory, fuzzy, greetingKey, looksLikeUrl, rankSites, recentPages, sanitizePrefs,
  siteMatches, siteName, toUrl, wmoBucket,
} from '../js/model.js';

const NOW = Date.UTC(2026, 8, 19, 12);
const h = (url, title, visitCount, typedCount, daysAgo) =>
  ({ url, title, visitCount, typedCount, lastVisitTime: NOW - daysAgo * DAY });

test('siteName: picks the brand segment of real titles', () => {
  assert.equal(siteName('dashboard.render.com', new Map([['Dashboard | Render', 10]])), 'Render');
  assert.equal(siteName('github.com', new Map([['tp-job/repo · GitHub', 5]])), 'GitHub');
});

test('siteName: falls back to the host label, keeps localhost and ccTLDs sane', () => {
  assert.equal(siteName('dashboard.render.com', new Map()), 'Render Dashboard');
  assert.equal(siteName('localhost:3000', new Map([['dev', 1]])), 'localhost:3000');
  assert.equal(siteName('www.example.co.th', new Map()), 'Example');
});

test('rankSites: sums per host, typed visits and recency outrank raw counts', () => {
  const sites = rankSites([
    h('https://old.example/', 'Old', 50, 0, 80),
    h('https://fresh.example/a', 'Fresh', 20, 5, 0),
    h('https://fresh.example/b', 'Fresh', 10, 0, 1),
  ], [], new Set(), NOW);
  assert.deepEqual(sites.map((s) => s.host), ['fresh.example', 'old.example']);
  assert.equal(sites[0].visits, 30);
  assert.equal(sites[0].url, 'https://fresh.example/');
});

test('rankSites: skips hidden hosts and non-web URLs, merges www', () => {
  const sites = rankSites([
    h('https://www.a.com/', 'A', 5, 0, 0),
    h('https://a.com/x', 'A', 5, 0, 0),
    h('chrome://settings/', 'Settings', 99, 0, 0),
    h('https://b.com/', 'B', 50, 0, 0),
  ], [{ url: 'https://c.com/', title: 'C' }], new Set(['b.com']), NOW);
  assert.deepEqual(sites.map((s) => s.host).sort(), ['a.com', 'c.com']);
  assert.equal(sites.find((s) => s.host === 'a.com').visits, 10);
});

test('composeTiles: pins lead in pin order, hidden pins drop, limit applies', () => {
  const sites = [{ host: 'a' }, { host: 'b' }, { host: 'c' }, { host: 'd' }].map((s, i) => ({ ...s, url: `https://${s.host}/`, name: s.host, score: 10 - i }));
  const prefs = { pinned: [{ host: 'c', url: 'https://c/', name: 'c' }, { host: 'x', url: 'https://x/', name: 'x' }, { host: 'd', url: 'https://d/', name: 'd' }], hidden: ['d'] };
  const tiles = composeTiles(sites, prefs, 3);
  assert.deepEqual(tiles.map((s) => s.host), ['c', 'x', 'a']);
  assert.equal(tiles[1].visits, 0);
  assert.ok(tiles[0].pinned);
});

test('recentPages: newest first, skips homepages, duplicates and hidden hosts', () => {
  const pages = recentPages([
    h('https://a.com/', 'A home', 1, 0, 0),
    h('https://a.com/doc', 'Doc', 1, 0, 1),
    h('https://b.com/new', 'New', 1, 0, 0.5),
    h('https://hidden.com/x', 'X', 1, 0, 0),
  ], new Set(['hidden.com']), 5);
  assert.deepEqual(pages.map((p) => p.title), ['New', 'Doc']);
});

test('sanitizePrefs: tolerates junk from storage', () => {
  assert.deepEqual(sanitizePrefs(undefined), { pinned: [], hidden: [], categories: {}, weather: null });
  assert.deepEqual(
    sanitizePrefs({ pinned: [null, { host: 'a', url: 'u' }], hidden: ['a', 'a', 3] }),
    { pinned: [{ host: 'a', url: 'u' }], hidden: ['a'], categories: {}, weather: null });
});

test('sanitizePrefs: keeps known category overrides and a usable place', () => {
  const prefs = sanitizePrefs({
    categories: { 'a.com': 'dev', 'b.com': 'nonsense' },
    weather: { lat: 18.787_51, lon: 98.993_17, name: 'Chiang Mai', unit: 'f' },
  });
  assert.deepEqual(prefs.categories, { 'a.com': 'dev' });
  assert.deepEqual(prefs.weather, { lat: 18.79, lon: 98.99, name: 'Chiang Mai', unit: 'f' });
});

test('sanitizePrefs: drops a place that is not on the planet', () => {
  assert.equal(sanitizePrefs({ weather: { lat: 91, lon: 0 } }).weather, null);
  assert.equal(sanitizePrefs({ weather: { lat: 'north', lon: 0 } }).weather, null);
  assert.equal(sanitizePrefs({ weather: { lat: 0, lon: 0 } }).weather.unit, 'c');
});

test('categorize: local dev servers and developer TLDs are dev', () => {
  for (const host of ['localhost:5173', '127.0.0.1:5500', '192.168.1.4', 'api.myapp.local', 'reactbits.dev']) {
    assert.equal(categorize(host), 'dev', host);
  }
});

test('categorize: patterns match whole host segments only', () => {
  assert.equal(categorize('x.com'), 'social');
  assert.equal(categorize('sphinx.com'), 'other');
  assert.equal(categorize('gist.github.com'), 'dev');
  assert.equal(categorize('www.youtube.com'), 'media');
  assert.equal(categorize('nevinas-p.onrender.com'), 'dev');
  assert.equal(categorize('mail.google.com'), 'work');
  assert.equal(categorize('translate.google.com'), 'learn');
  assert.equal(categorize(''), 'other');
});

test('categoryOf: a manual override wins, junk does not', () => {
  assert.equal(categoryOf('youtube.com', { 'youtube.com': 'work' }), 'work');
  assert.equal(categoryOf('youtube.com', { 'youtube.com': 'nope' }), 'media');
  assert.equal(categoryOf('youtube.com', undefined), 'media');
});

test('categoryCounts: CATEGORY_IDS order, empty drawers dropped', () => {
  const counts = categoryCounts([{ category: 'media' }, { category: 'dev' }, { category: 'dev' }]);
  assert.deepEqual(counts, [{ id: 'dev', count: 2 }, { id: 'media', count: 1 }]);
  assert.ok(CATEGORY_IDS.indexOf('dev') < CATEGORY_IDS.indexOf('media'));
});

test('folderCategory: the folder follows the majority of its links', () => {
  const items = [
    { url: 'https://github.com/' },
    { url: 'https://stackoverflow.com/q' },
    { url: 'https://www.youtube.com/' },
  ];
  assert.equal(folderCategory(items), 'dev');
  assert.equal(folderCategory(items, { 'github.com': 'media', 'stackoverflow.com': 'media' }), 'media');
  assert.equal(folderCategory([]), 'other');
});

test('wmoBucket: every WMO code lands in a named bucket', () => {
  assert.equal(wmoBucket(0), 'clear');
  assert.equal(wmoBucket(2), 'partly');
  assert.equal(wmoBucket(45), 'fog');
  assert.equal(wmoBucket(55), 'drizzle');
  assert.equal(wmoBucket(82), 'rain');
  assert.equal(wmoBucket(73), 'snow');
  assert.equal(wmoBucket(99), 'storm');
  assert.equal(wmoBucket(undefined), 'cloudy');
});

test('search helpers: URL detection and fuzzy ranking', () => {
  assert.ok(looksLikeUrl('github.com/foo'));
  assert.ok(looksLikeUrl('localhost:3000'));
  assert.ok(!looksLikeUrl('two words'));
  assert.equal(toUrl('localhost:3000'), 'http://localhost:3000');
  assert.equal(toUrl('example.com'), 'https://example.com');
  assert.ok(fuzzy('git', 'github') > fuzzy('hub', 'github'));
  assert.ok(fuzzy('hub', 'github') > fuzzy('gthb', 'github'));
  assert.equal(fuzzy('zzz', 'github'), 0);
  const sites = [{ name: 'GitHub', host: 'github.com', score: 1 }, { name: 'Gmail', host: 'mail.google.com', score: 9 }];
  assert.equal(siteMatches(sites, 'git')[0].site.name, 'GitHub');
});

const tree = [{
  id: '0',
  children: [
    {
      id: '1', title: 'Bookmarks bar',
      children: [
        { id: '10', title: 'GitHub', url: 'https://github.com/' },
        { id: '11', title: '', url: 'https://www.example.com/page' },
        { id: '12', title: 'Bookmarklet', url: 'javascript:alert(1)' },
        { id: '20', title: 'Work', children: [
          { id: '22', title: 'Empty', children: [] },
          { id: '23', title: 'Deep', children: [{ id: '24', title: 'Docs', url: 'https://docs.example.com/' }] },
        ] },
      ],
    },
    { id: '2', title: 'Other bookmarks', children: [{ id: '30', title: 'News', url: 'https://news.example.com/' }] },
    { id: '3', title: 'Mobile bookmarks', children: [] },
  ],
}];

test('buildGroups: one group per folder with links, in browser order, with paths', () => {
  const groups = buildGroups(tree);
  assert.deepEqual(groups.map((g) => g.id), ['1', '23', '2']);
  assert.deepEqual(groups[1].path, ['Bookmarks bar', 'Work', 'Deep']);
  assert.deepEqual(groups[0].items.map((i) => i.title), ['GitHub', 'example.com']);
  assert.deepEqual(buildGroups([]), []);
});

test('greetingKey and agoParts', () => {
  assert.equal(greetingKey(3), 'greetingNight');
  assert.equal(greetingKey(9), 'greetingMorning');
  assert.equal(greetingKey(14), 'greetingAfternoon');
  assert.equal(greetingKey(21), 'greetingEvening');
  assert.equal(agoParts(0, NOW), null);
  assert.deepEqual(agoParts(NOW - 5 * 60_000, NOW), [-5, 'minute']);
  assert.deepEqual(agoParts(NOW - 3 * 3_600_000, NOW), [-3, 'hour']);
  assert.deepEqual(agoParts(NOW - 2 * DAY, NOW), [-2, 'day']);
  assert.deepEqual(agoParts(NOW - 90 * DAY, NOW), [-3, 'month']);
});

test('bookmarkHealth: front pages count on any visit to the host, deep links need the page', () => {
  const groups = [{ id: '1', path: ['Bar'], items: [
    { title: 'GitHub', url: 'https://github.com/' },                 // host visited → used
    { title: 'Repo', url: 'https://github.com/tp-job/repo#readme' },  // page visited (fragment ignored) → used
    { title: 'Old docs', url: 'https://github.com/old/docs' },        // host visited, page not → unused
    { title: 'Coolors', url: 'https://coolors.co/' },                 // never visited → unused
    { title: 'Settings', url: 'chrome://settings/' },                 // not a web page → ignored
  ] }];
  const history = [h('https://www.github.com/tp-job/repo/', 'Repo', 3, 0, 2), h('https://github.com/x', 'X', 1, 0, 40)];
  const health = bookmarkHealth(groups, history, []);
  assert.deepEqual(health.unused.map((b) => b.title), ['Old docs', 'Coolors']);
  assert.equal(health.since, NOW - 40 * DAY, 'the window is the oldest visit actually seen');
});

test('bookmarkHealth: duplicates list every folder, once per page', () => {
  const groups = [
    { id: '1', path: ['Bar'], items: [{ title: 'MDN', url: 'https://developer.mozilla.org/' }] },
    { id: '2', path: ['Other', 'Docs'], items: [
      { title: 'MDN again', url: 'https://www.developer.mozilla.org' },
      { title: 'Solo', url: 'https://solo.dev/' },
    ] },
  ];
  const { duplicates, unused } = bookmarkHealth(groups, [h('https://developer.mozilla.org/', 'MDN', 1, 0, 1)], []);
  assert.equal(duplicates.length, 1);
  assert.deepEqual(duplicates[0].paths, [['Bar'], ['Other', 'Docs']]);
  assert.deepEqual(unused.map((b) => b.title), ['Solo'], 'a duplicate is not reported as unused twice');
});

test('bookmarkHealth: favourites without a bookmark, skipping dev servers; no history → nothing flagged', () => {
  const sites = ['github.com', 'localhost:5173', 'claude.ai', 'youtube.com'].map((host) => ({ host }));
  const groups = [{ id: '1', path: ['Bar'], items: [{ title: 'GitHub', url: 'https://github.com/' }] }];
  const health = bookmarkHealth(groups, [h('https://github.com/', 'GitHub', 1, 0, 0)], sites, { limit: 1 });
  assert.deepEqual(health.unbookmarked.map((s) => s.host), ['claude.ai']);
  const empty = bookmarkHealth(groups, [], sites);
  assert.deepEqual(empty.unused, []);
  assert.equal(empty.since, null);
});
