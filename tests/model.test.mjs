import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, agoParts, buildGroups, composeTiles, fuzzy, greetingKey, looksLikeUrl, rankSites,
  recentPages, sanitizePrefs, siteMatches, siteName, toUrl,
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
  assert.deepEqual(sanitizePrefs(undefined), { pinned: [], hidden: [] });
  assert.deepEqual(sanitizePrefs({ pinned: [null, { host: 'a', url: 'u' }], hidden: ['a', 'a', 3] }), { pinned: [{ host: 'a', url: 'u' }], hidden: ['a'] });
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
