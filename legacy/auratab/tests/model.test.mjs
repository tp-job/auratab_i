import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, buildGroups, buildTopSites, bumpLaunch, displayTitle, greetingKey,
  letterFor, matchesTokens, sanitizeSettings, searchText, sortByUsage, tokenize,
} from '../js/model.js';

const tree = [{
  id: '0',
  children: [
    {
      id: '1', title: 'Bookmarks bar', folderType: 'bookmarks-bar',
      children: [
        { id: '10', title: 'GitHub', url: 'https://github.com/' },
        { id: '11', title: '', url: 'https://www.example.com/page' },
        { id: '12', title: 'Bookmarklet', url: 'javascript:alert(1)' },
        {
          id: '20', title: 'Work',
          children: [
            { id: '21', title: 'Jira', url: 'https://jira.example.com/' },
            { id: '22', title: 'Empty', children: [] },
            { id: '23', title: 'Deep', children: [{ id: '24', title: 'Docs', url: 'https://docs.example.com/' }] },
          ],
        },
      ],
    },
    { id: '2', title: 'Other bookmarks', folderType: 'other', children: [{ id: '30', title: 'News', url: 'https://news.example.com/' }] },
    { id: '3', title: 'Mobile bookmarks', folderType: 'mobile', children: [] },
  ],
}];

test('buildGroups: one card per folder with links, in browser order, with paths', () => {
  const groups = buildGroups(tree);
  assert.deepEqual(groups.map((g) => g.id), ['1', '20', '23', '2']);
  assert.deepEqual(groups[2].path, ['Bookmarks bar', 'Work', 'Deep']);
  assert.equal(groups[2].title, 'Deep');
});

test('buildGroups: drops bookmarklets and titles untitled links by hostname', () => {
  const [bar] = buildGroups(tree);
  assert.deepEqual(bar.items.map((i) => i.title), ['GitHub', 'example.com']);
});

test('buildGroups: can limit to the bookmarks bar, with or without folderType', () => {
  assert.deepEqual(buildGroups(tree, { includeOtherRoots: false }).map((g) => g.id), ['1', '20', '23']);
  const legacy = structuredClone(tree);
  for (const node of legacy[0].children) delete node.folderType;
  assert.deepEqual(buildGroups(legacy, { includeOtherRoots: false }).map((g) => g.id), ['1', '20', '23']);
});

test('buildTopSites: dedupes, skips hidden and unlaunchable, respects limit', () => {
  const sites = [
    { title: 'A', url: 'https://a.com/' },
    { title: 'A again', url: 'https://a.com/' },
    { title: 'B', url: 'https://b.com/' },
    { title: 'Bad', url: 'javascript:void 0' },
    { title: 'C', url: 'https://c.com/' },
    { title: 'D', url: 'https://d.com/' },
  ];
  const top = buildTopSites(sites, { hidden: ['https://b.com/'], limit: 2 });
  assert.deepEqual(top.map((s) => s.title), ['A', 'C']);
});

test('sanitizeSettings: falls back to defaults on junk', () => {
  assert.deepEqual(sanitizeSettings(undefined), { ...DEFAULT_SETTINGS });
  const s = sanitizeSettings({ theme: 'neon', topSitesLimit: 7, showBookmarks: 'yes', hiddenSites: ['x', 'x', 3] });
  assert.equal(s.theme, 'system');
  assert.equal(s.topSitesLimit, 8);
  assert.equal(s.showBookmarks, true);
  assert.deepEqual(s.hiddenSites, ['x']);
  assert.equal(sanitizeSettings({ topSitesLimit: '12' }).topSitesLimit, 12);
});

test('sortByUsage: most opened first, ties keep original order', () => {
  const items = [{ url: 'a' }, { url: 'b' }, { url: 'c' }, { url: 'd' }];
  const stats = { c: { count: 5 }, b: { count: 1 }, d: { count: 1 } };
  assert.deepEqual(sortByUsage(items, stats).map((i) => i.url), ['c', 'b', 'd', 'a']);
});

test('bumpLaunch: counts and prunes least recently used', () => {
  let stats = {};
  stats = bumpLaunch(stats, 'a', 1, 2);
  stats = bumpLaunch(stats, 'a', 2, 2);
  stats = bumpLaunch(stats, 'b', 3, 2);
  assert.deepEqual(stats.a, { count: 2, last: 2 });
  stats = bumpLaunch(stats, 'c', 4, 2);
  assert.deepEqual(Object.keys(stats).sort(), ['b', 'c']);
});

test('search: every token must match title or url, ignoring scheme', () => {
  const text = searchText({ title: 'GitHub Issues', url: 'https://www.github.com/issues' });
  assert.equal(text, 'github issues github.com/issues');
  assert.ok(matchesTokens(text, tokenize('  git   ISSUES ')));
  assert.ok(!matchesTokens(text, tokenize('git jira')));
  assert.ok(!matchesTokens(text, tokenize('https')));
  assert.ok(matchesTokens(text, tokenize('')));
});

test('display helpers', () => {
  assert.equal(displayTitle({ title: '  ', url: 'https://www.foo.org/x' }), 'foo.org');
  assert.equal(letterFor({ title: 'x', url: 'https://www.youtube.com/' }), 'Y');
  assert.equal(letterFor({ title: 'ข่าว', url: 'chrome://settings' }), 'S');
  assert.equal(greetingKey(3), 'greetingNight');
  assert.equal(greetingKey(9), 'greetingMorning');
  assert.equal(greetingKey(14), 'greetingAfternoon');
  assert.equal(greetingKey(19), 'greetingEvening');
});
