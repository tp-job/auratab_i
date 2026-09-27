/* Atelier Launchpad — page controller.
 *
 * The page only exists while the user has asked for it: the toolbar icon (or
 * Alt+Shift+L) opens it, switches to it, or leaves it (see background.js). A
 * launchpad tab can therefore sit in the background for a while, so it
 * refreshes its data whenever it becomes visible again.
 */

import {
  CATEGORY_IDS, HISTORY_DAYS, agoParts, buildGroups, categorize, categoryCounts, categoryOf, composeTiles,
  folderCategory, greetingKey, hostKey, looksLikeUrl, parseWeb, rankSites, recentPages,
  sanitizePrefs, siteMatches, toUrl,
} from './model.js';
import { loadMessages, localize, t, uiLanguage } from './i18n.js';
import { api, isExtension } from './api.js';
import { el, readLocal, svg, whenIdle, writeLocal } from './dom.js';
import { clearWeatherCache, currentPosition, lastReading, loadWeather, searchPlaces } from './weather.js';

const BENTO_SMALL = 8;   // cards around the #1 feature card
const DOCK_COUNT = 12;   // Everyday: how many sites a tab shows
const RECENT_COUNT = 20; // "Pick up where you left off" keeps 20 …
const RECENT_PREVIEW = 6; // … and shows 6 until you ask for the rest
const FOLDER_PREVIEW = 6;
const STALE_AFTER = 30_000;
const SEARCH_DEBOUNCE = 60;
const SNAPSHOT_HISTORY = 1500;
const CACHE_KEY = 'launchpad:snapshot:v2';
const EXPANDED_KEY = 'launchpad:expanded-folders';
const PIN_HINT_KEY = 'launchpad:pin-hint-dismissed';
const FILTER_KEY = 'launchpad:site-filter';
const DOCK_TAB_KEY = 'launchpad:dock-tab';
const BOOKMARK_FILTER_KEY = 'launchpad:bookmark-filter';
const RECENT_OPEN_KEY = 'launchpad:recent-open';
const WX_UNIT_KEY = 'launchpad:weather-unit';

const $ = (id) => document.getElementById(id);
const dom = {
  bento: $('bento'),
  dock: $('dock'),
  folders: $('folders'),
  input: $('q'),
  panel: $('results'),
  resultsStatus: $('results-status'),
  theme: $('theme'),
  pinHint: $('pin-hint'),
  reset: $('reset'),
  siteChips: $('site-chips'),
  dockTabs: $('dock-tabs'),
  bookmarkChips: $('bookmark-chips'),
  wx: $('wx'),
  wxPanel: $('wx-panel'),
};

const state = {
  history: [],
  topSites: [],
  groups: [],
  prefs: { pinned: [], hidden: [] },
  sites: [],      // full ranked list, best first (for search)
  recent: [],     // recently visited deep pages
  tiles: [],      // what is on screen, in order (for Alt+1–9)
  results: [],
  resultsFor: '', // the query `results` were built for
  active: -1,
  queryToken: 0,
  loadedAt: 0,
  expanded: new Set(readLocal(EXPANDED_KEY, [])),
  filter: readLocal(FILTER_KEY, 'all'),          // Most used — category chip
  dockTab: readLocal(DOCK_TAB_KEY, 'all'),       // Everyday — sub-tab
  bookmarkFilter: readLocal(BOOKMARK_FILTER_KEY, 'all'),
  recentOpen: readLocal(RECENT_OPEN_KEY, false),
  weather: null,
  weatherError: '',
};

/* ---------------------------------------------------------------- formatting */

const lang = uiLanguage();
const fmt = new Intl.NumberFormat(lang);
const timeFmt = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat(lang, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });

function ago(ts) {
  const parts = agoParts(ts);
  return parts ? rtf.format(...parts) : '';
}

const pad2 = (n) => String(n).padStart(2, '0');
const share = (site, max) => (max ? Math.max(4, Math.round((site.score / max) * 100)) : 0);
const siteTitle = (site) => `${site.name} — ${site.host}${site.visits ? ` · ${t('visits', fmt.format(site.visits))}` : ''}`;

/* ---------------------------------------------------------------- categories */

// "dev" → "catDev", so one message key per category id.
const catKey = (id) => `cat${id[0].toUpperCase()}${id.slice(1)}`;
const catName = (id) => t(catKey(id));
const withCategory = (item) => ({ ...item, category: categoryOf(item.host, state.prefs.categories) });

// One row of filter chips: "All" plus every category that actually has sites.
// `kind` is read back by the delegated click handler.
function chipRow(kind, counts, current, total, { tabs = false } = {}) {
  const chip = (id, label, n) => el('button', {
    class: 'chip', type: 'button', data: { chip: id, kind },
    role: tabs ? 'tab' : null,
    'aria-selected': tabs ? String(id === current) : null,
    'aria-pressed': tabs ? null : String(id === current),
    tabindex: tabs ? (id === current ? '0' : '-1') : null,
  }, el('span', {}, label), el('span', { class: 'chip-n' }, fmt.format(n)));

  return el('div', {
    class: 'chips', role: tabs ? 'tablist' : 'group', 'aria-label': t(tabs ? 'tabsLabel' : 'filterLabel'),
  }, chip('all', t('catAll'), total), ...counts.map((c) => chip(c.id, catName(c.id), c.count)));
}

// Fall back to "all" when the saved chip no longer has anything behind it.
const validFilter = (want, counts) => (want === 'all' || counts.some((c) => c.id === want) ? want : 'all');

// The menu behind a tile's tag button: move this host to another category.
function categoryMenu(site) {
  return el('div', { class: 'cat-menu', role: 'menu', 'aria-label': t('moveToCategory', site.name) },
    ...CATEGORY_IDS.map((id) => el('button', {
      class: 'cat-option', type: 'button', role: 'menuitemradio', data: { action: 'set-category', category: id },
      'aria-checked': String(id === site.category),
    }, catName(id))));
}

/* ---------------------------------------------------------------- icons */

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

// Monogram tile that upgrades to the real favicon once it loads.
function iconFor(url, name, host) {
  const [m1, m2] = MONO[hash(host || url) % MONO.length];
  const letter = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '·').toUpperCase();
  const node = el('span', { class: 'icon', vars: { '--m1': m1, '--m2': m2 }, 'aria-hidden': 'true' }, letter);
  const src = api.favicon(url);
  if (src) {
    const img = el('img', { src, alt: '', width: 64, height: 64, loading: 'lazy', decoding: 'async' });
    img.addEventListener('load', () => node.classList.add('has-img'), { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    node.append(img);
  }
  return node;
}

const glyph = (name) => el('span', { class: 'glyph', 'aria-hidden': 'true' }, svg(name));

/* ---------------------------------------------------------------- render: sites */

// Handled by one delegated listener per container (see onTileAction).
function tileActions(site) {
  return el('div', { class: 'tile-actions' },
    el('button', {
      class: 'act', type: 'button', data: { action: 'pin' },
      'aria-pressed': String(Boolean(site.pinned)),
      'aria-label': t('pinSite', site.name),
      title: site.pinned ? t('unpinShort') : t('pinShort'),
    }, svg('pin')),
    el('button', {
      class: 'act', type: 'button', data: { action: 'category' },
      'aria-haspopup': 'true', 'aria-expanded': 'false',
      'aria-label': t('moveToCategory', site.name), title: catName(site.category ?? 'other'),
    }, svg('tag')),
    el('button', {
      class: 'act', type: 'button', data: { action: 'hide' },
      'aria-label': t('hideSite', site.name), title: t('hideShort'),
    }, svg('hide')));
}

// #1 — the velvet card in the centre column, same treatment as BentoGrid's bc--3.
function featureCard(site) {
  return el('article', { class: 'bc bc--feature', data: { host: site.host }, vars: { '--i': 0 } },
    el('span', { class: 'velvet', 'aria-hidden': 'true' }),
    el('a', { href: site.url, title: siteTitle(site), 'aria-keyshortcuts': 'Alt+1' },
      el('div', { class: 'feature-top' },
        iconFor(site.url, site.name, site.host),
        el('span', { class: 'pill' }, site.pinned ? t('pinnedTag') : t('mostUsedTag'))),
      el('span', { class: 'feature-cat' }, catName(site.category ?? 'other')),
      el('div', {},
        el('p', { class: 'feature-name' }, site.name),
        el('p', { class: 'feature-host' }, site.host)),
      el('dl', { class: 'feature-stats' },
        el('div', {}, el('dt', {}, t('statVisits')), el('dd', {}, site.visits ? fmt.format(site.visits) : '—')),
        el('div', {}, el('dt', {}, t('statLastSeen')), el('dd', {}, ago(site.lastVisit) || '—'))),
      el('span', { class: 'feature-cta', 'aria-hidden': 'true' },
        el('span', { class: 'paren' }, '('), t('openHint'), el('span', { class: 'paren' }, ')'))),
    tileActions(site));
}

function siteCard(site, rank, max) {
  return el('article', { class: 'bc bc--site', data: { host: site.host }, vars: { '--i': rank + 1 } },
    el('a', { href: site.url, title: siteTitle(site), 'aria-keyshortcuts': rank < 9 ? `Alt+${rank + 1}` : null },
      el('span', { class: 'bc-eyebrow' },
        iconFor(site.url, site.name, site.host),
        site.pinned ? el('span', { class: 'pinned-dot', role: 'img', 'aria-label': t('pinnedDot'), title: t('pinnedDot') }) : null),
      el('span', { class: 'bc-name' },
        el('span', { class: 'bc-title' }, site.name),
        el('span', { class: 'bc-sub' }, `${catName(site.category ?? 'other')} · ${site.host}`)),
      el('span', { class: 'meter' },
        el('span', { class: 'meter-track', 'aria-hidden': 'true' }, el('i', { vars: { '--w': `${share(site, max)}%` } })),
        el('span', {}, site.visits ? fmt.format(site.visits) : t('pinnedWord')))),
    el('span', { class: 'rank-num', 'aria-hidden': 'true' }, pad2(rank + 1)),
    tileActions(site));
}

const SHARE_COLORS = ['#AFAECC', '#878CB4', '#85758F', '#524E68'];

function statsCard(sites) {
  let total = 0;
  let visits = 0;
  for (const s of sites) { total += s.score; visits += s.visits; }
  total ||= 1;
  const top = sites.slice(0, 4).map((s, i) => ({ s, pct: (s.score / total) * 100, c: SHARE_COLORS[i] }));
  const top3 = Math.round(top.slice(0, 3).reduce((n, x) => n + x.pct, 0));
  const otherPct = Math.max(0, 100 - top.reduce((n, x) => n + x.pct, 0));
  const legend = top.map((x) => `${x.s.name} ${Math.round(x.pct)}%`);

  return el('article', { class: 'bc bc--stats', vars: { '--i': 1 + BENTO_SMALL } },
    el('span', { class: 'bc-eyebrow' }, t('insight', HISTORY_DAYS), isExtension ? null : el('span', {}, t('demo'))),
    el('p', { class: 'stat-big' }, fmt.format(visits), el('small', {}, t('visitsSites', fmt.format(sites.length)))),
    el('div', { class: 'stack' },
      el('div', { class: 'share-bar', role: 'img', 'aria-label': legend.join(', ') },
        ...top.map((x) => el('i', { vars: { '--w': `${x.pct}%`, '--c': x.c } })),
        el('i', { vars: { '--w': `${otherPct}%`, '--c': 'transparent' } })),
      el('p', { class: 'share-legend', 'aria-hidden': 'true' },
        ...top.map((x, i) => el('span', {}, el('i', { vars: { '--c': x.c } }), legend[i]))),
      el('p', { class: 'bc-sub' }, t('topShare', top3))));
}

// Up to RECENT_COUNT pages are kept; only the first RECENT_PREVIEW show until
// the reader asks for the rest. The choice is remembered per device.
function recentCard(pages) {
  const open = state.recentOpen;
  const shown = open ? pages : pages.slice(0, RECENT_PREVIEW);
  const hasMore = pages.length > RECENT_PREVIEW;

  return el('article', { class: 'bc bc--recent', 'aria-labelledby': 'recent-title', vars: { '--i': 2 + BENTO_SMALL } },
    el('h3', { class: 'bc-eyebrow', id: 'recent-title' },
      el('span', {}, t('recentTitle')),
      el('span', { class: 'bc-count' }, fmt.format(pages.length))),
    el('ul', { class: 'recent-list', id: 'recent-list' }, ...shown.map((p) =>
      el('li', {}, el('a', { href: p.url, title: p.url },
        iconFor(p.url, p.title, p.host),
        el('span', { class: 'recent-text' },
          el('span', { class: 'recent-title' }, p.title),
          el('span', { class: 'recent-sub' }, `${p.host} · ${ago(p.lastVisit)}`)))))),
    hasMore ? el('button', {
      class: 'linkish recent-more', type: 'button', data: { action: 'recent-more' },
      'aria-expanded': String(open), 'aria-controls': 'recent-list',
    }, open ? t('showLess') : t('showAll', fmt.format(pages.length))) : null);
}

// Only the recent card is rebuilt, so the rest of the bento does not flicker.
function toggleRecent() {
  state.recentOpen = !state.recentOpen;
  writeLocal(RECENT_OPEN_KEY, state.recentOpen);
  const card = dom.bento.querySelector('.bc--recent');
  if (!card) return renderSites();
  const next = recentCard(state.recent);
  next.classList.add('calm-card');
  card.replaceWith(next);
  next.querySelector('.recent-more')?.focus();
}

function dockItem(site, rank) {
  return el('li', { class: 'dock-item', data: { host: site.host } },
    el('a', { href: site.url, title: siteTitle(site), 'aria-keyshortcuts': rank < 9 ? `Alt+${rank + 1}` : null },
      iconFor(site.url, site.name, site.host),
      el('span', { class: 'dock-name' }, site.name)),
    tileActions(site));
}

// Ranking is the expensive part (thousands of history rows), so it only runs
// when history or the hidden list changes — not on every pin or re-render.
function recomputeRanking() {
  const hidden = new Set(state.prefs.hidden);
  state.sites = rankSites(state.history, state.topSites, hidden).map(withCategory);
  state.recent = recentPages(state.history, hidden, RECENT_COUNT).map(withCategory);
}

// Categories are cheap to recompute but depend on the override map, so pins,
// hides and ranking stay untouched when only a category moves.
function recategorize() {
  state.sites = state.sites.map(withCategory);
  state.recent = state.recent.map(withCategory);
  recomputeFolderCategories();
}

function recomputeFolderCategories() {
  state.groups = state.groups.map((g) => ({ ...g, category: folderCategory(g.items, state.prefs.categories) }));
}

function renderSites() {
  const { sites, recent, prefs } = state;
  const counts = categoryCounts(sites);
  state.filter = validFilter(state.filter, counts);
  dom.siteChips.replaceChildren(chipRow('filter', counts, state.filter, sites.length));
  dom.siteChips.hidden = sites.length === 0;

  // Filtering narrows the pool the bento is built from — pins included, so a
  // pinned site does not jump into a drawer it does not belong to.
  const pool = state.filter === 'all' ? sites : sites.filter((s) => s.category === state.filter);
  const scoped = state.filter === 'all' ? prefs
    : { ...prefs, pinned: prefs.pinned.filter((pin) => categoryOf(pin.host, prefs.categories) === state.filter) };
  const bento = composeTiles(pool, scoped, 1 + BENTO_SMALL).map(withCategory);
  const [feature, ...rest] = bento;
  const max = sites[0]?.score ?? 0; // sites are sorted best first

  dom.bento.replaceChildren(...(feature ? [
    featureCard(feature),
    ...rest.map((s, i) => siteCard(s, i + 1, max)),
    sites.length ? statsCard(sites) : null,
    recent.length ? recentCard(recent) : null,
  ] : []).filter(Boolean));
  dom.bento.hidden = !feature;
  $('empty').hidden = Boolean(feature) || sites.length > 0;
  $('filtered-empty').hidden = Boolean(feature) || sites.length === 0;

  state.tiles = [...bento, ...renderDock(counts, bento)];

  $('meta').textContent = sites.length ? t('rankedMeta', timeFmt.format(new Date())) : '';

  dom.reset.hidden = prefs.hidden.length === 0;
  dom.reset.textContent = t('restoreHidden', prefs.hidden.length);
}

// Everyday. "All" carries on where the bento stopped; a category tab is a
// drawer of its own — the top sites of that category, bento or not.
function renderDock(counts, inBento) {
  const { sites, prefs } = state;
  state.dockTab = validFilter(state.dockTab, counts);
  dom.dockTabs.replaceChildren(chipRow('dock', counts, state.dockTab, sites.length, { tabs: true }));

  const taken = new Set(inBento.map((s) => s.host));
  const pool = state.dockTab === 'all'
    ? composeTiles(sites, prefs, 1 + BENTO_SMALL + DOCK_COUNT).filter((s) => !taken.has(s.host))
    : sites.filter((s) => s.category === state.dockTab);
  const dock = pool.slice(0, DOCK_COUNT).map(withCategory);

  dom.dock.replaceChildren(...dock.map((s, i) => dockItem(s, 1 + BENTO_SMALL + i)));
  dom.dock.hidden = dock.length === 0;
  $('dock-empty').hidden = dock.length > 0;
  $('dock-section').hidden = sites.length === 0;
  return dock;
}

// Re-rendering replaces the tile a keyboard user was on. Put focus back on the
// same control (a pinned tile moves to the front), or on whichever tile now
// sits where a hidden one was, so focus never falls back to <body>.
const TILE_SELECTOR = '#bento [data-host], #dock [data-host]';

function renderSitesKeepingFocus() {
  const focused = document.activeElement;
  const tile = focused instanceof Element ? focused.closest(TILE_SELECTOR) : null;
  if (!tile) return renderSites();

  const position = [...document.querySelectorAll(TILE_SELECTOR)].indexOf(tile);
  const { action } = focused.dataset;
  renderSites();

  const tiles = [...document.querySelectorAll(TILE_SELECTOR)];
  const same = tiles.find((n) => n.dataset.host === tile.dataset.host);
  const target = same ?? tiles[Math.min(position, tiles.length - 1)];
  const control = same && action ? target.querySelector(`[data-action="${action}"]`) : target?.querySelector('a');
  (control ?? dom.input).focus();
}

/* ---------------------------------------------------------------- render: bookmarks */

function folderCard(group, i) {
  const open = state.expanded.has(group.id);
  const items = open ? group.items : group.items.slice(0, FOLDER_PREVIEW);
  const hasMore = group.items.length > FOLDER_PREVIEW;
  const path = group.path.slice(0, -1).filter(Boolean).join(' / ');
  const titleId = `folder-title-${group.id}`;
  const listId = `folder-list-${group.id}`;

  return el('article', { class: 'folder', data: { folder: group.id }, 'aria-labelledby': titleId, vars: { '--i': Math.min(i, 12) } },
    el('header', { class: 'folder-head' },
      glyph('folder'),
      el('span', { class: 'folder-text' },
        el('h3', { class: 'folder-title', id: titleId }, group.title || '—'),
        path ? el('span', { class: 'folder-path' }, path) : null),
      el('span', { class: 'folder-count' }, fmt.format(group.items.length))),
    el('span', { class: 'folder-cat' }, catName(group.category ?? 'other')),
    el('ul', { class: 'folder-list', id: listId }, ...items.map((item) => {
      const u = parseWeb(item.url);
      return el('li', {}, el('a', { href: item.url, title: item.url },
        iconFor(item.url, item.title, u ? hostKey(u) : ''),
        el('span', { class: 'folder-link' }, item.title)));
    })),
    hasMore ? el('button', {
      class: 'linkish folder-more', type: 'button', 'aria-expanded': String(open), 'aria-controls': listId,
    }, open ? t('showLess') : t('showAll', fmt.format(group.items.length))) : null);
}

function renderBookmarks() {
  const { groups } = state;
  const counts = categoryCounts(groups);
  state.bookmarkFilter = validFilter(state.bookmarkFilter, counts);
  dom.bookmarkChips.replaceChildren(chipRow('bookmark', counts, state.bookmarkFilter, groups.length));
  dom.bookmarkChips.hidden = groups.length === 0;

  const shown = state.bookmarkFilter === 'all' ? groups : groups.filter((g) => g.category === state.bookmarkFilter);
  const links = shown.reduce((n, g) => n + g.items.length, 0);
  dom.folders.replaceChildren(...shown.map(folderCard));
  $('bookmarks-empty').hidden = groups.length > 0;
  $('bookmarks-meta').textContent = shown.length
    ? t('bookmarksMeta', fmt.format(links), fmt.format(shown.length))
    : '';
}

// Only the toggled card is rebuilt; focus stays on its button.
function toggleFolder(card) {
  const id = card.dataset.folder;
  const index = state.groups.findIndex((g) => g.id === id);
  if (index < 0) return;
  if (!state.expanded.delete(id)) state.expanded.add(id);
  writeLocal(EXPANDED_KEY, [...state.expanded]);
  const next = folderCard(state.groups[index], index);
  card.replaceWith(next);
  next.querySelector('.folder-more')?.focus();
}

function render() {
  renderSites();
  renderBookmarks();
}

/* ---------------------------------------------------------------- interactions */

// Plain left-clicks go through api.open so non-web URLs (chrome://, file://)
// work too; modified clicks keep the browser's own new-tab behaviour.
function openLink(e, url) {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  api.open(url);
}

dom.folders.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;
  const more = e.target.closest('.folder-more');
  if (more) return toggleFolder(more.closest('[data-folder]'));
  const link = e.target.closest('a[href]');
  if (link) openLink(e, link.getAttribute('href'));
});

function onTileAction(e) {
  const button = e.target instanceof Element ? e.target.closest('button[data-action]') : null;
  if (!button) return;
  const { action } = button.dataset;
  if (action === 'recent-more') return toggleRecent();

  const site = state.tiles.find((s) => s.host === button.closest('[data-host]')?.dataset.host);
  if (!site) return;
  if (action === 'pin') togglePin(site);
  else if (action === 'category') openCategoryMenu(button, site);
  else hideSite(site);
}
dom.bento.addEventListener('click', onTileAction);
dom.dock.addEventListener('click', onTileAction);

/* ------------------------------------------------------------ category menu */

// The menu lives on <body>: .bc and .dock clip their overflow, and a fixed
// layer also keeps it on screen for the last tile in a row.
let openMenu = null;

function closeCategoryMenu({ restoreFocus = false } = {}) {
  if (!openMenu) return;
  const { button, menu } = openMenu;
  openMenu = null;
  button.setAttribute('aria-expanded', 'false');
  menu.remove();
  if (restoreFocus) button.focus();
}

function openCategoryMenu(button, site) {
  const reopening = openMenu?.button === button;
  closeCategoryMenu();
  if (reopening) return;

  const r = button.getBoundingClientRect();
  const menu = categoryMenu(site);
  menu.style.setProperty('--x', `${Math.round(r.right)}px`);
  menu.style.setProperty('--y', `${Math.round(r.bottom + 6)}px`);
  document.body.append(menu);
  button.setAttribute('aria-expanded', 'true');
  openMenu = { button, menu, host: site.host };
  (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button'))?.focus();
}

// A host whose rule already gives the chosen category drops its override, so
// the list keeps only the corrections that actually say something.
function setCategory(host, id) {
  if (!CATEGORY_IDS.includes(id)) return;
  const categories = { ...state.prefs.categories };
  if (categorize(host) === id) delete categories[host];
  else categories[host] = id;
  updatePrefs({ ...state.prefs, categories }, { recat: true });
}

document.addEventListener('click', (e) => {
  const option = e.target instanceof Element ? e.target.closest('[data-action="set-category"]') : null;
  if (option && openMenu) {
    const { host } = openMenu;
    closeCategoryMenu();
    return setCategory(host, option.dataset.category);
  }
  if (openMenu && e.target instanceof Node && !openMenu.menu.contains(e.target) && !openMenu.button.contains(e.target)) {
    closeCategoryMenu();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openMenu) {
    e.preventDefault();
    closeCategoryMenu({ restoreFocus: true });
  }
});
window.addEventListener('resize', () => closeCategoryMenu(), { passive: true });

/* ------------------------------------------------------------ category chips */

function onChip(e) {
  const chip = e.target instanceof Element ? e.target.closest('button[data-chip]') : null;
  if (!chip) return;
  const { kind, chip: id } = chip.dataset;
  const key = { filter: FILTER_KEY, dock: DOCK_TAB_KEY, bookmark: BOOKMARK_FILTER_KEY }[kind];
  const field = { filter: 'filter', dock: 'dockTab', bookmark: 'bookmarkFilter' }[kind];
  if (!key || state[field] === id) return;
  state[field] = id;
  writeLocal(key, id);
  if (kind === 'bookmark') renderBookmarks();
  else renderSites();
  // The row was rebuilt; put focus back on the chip that was just chosen.
  document.querySelector(`[data-kind="${kind}"][data-chip="${id}"]`)?.focus();
}
dom.siteChips.addEventListener('click', onChip);
dom.dockTabs.addEventListener('click', onChip);
dom.bookmarkChips.addEventListener('click', onChip);

// Everyday is a real tablist, so ←/→/Home/End move between its tabs.
dom.dockTabs.addEventListener('keydown', (e) => {
  const step = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity }[e.key];
  if (step === undefined) return;
  const tabs = [...dom.dockTabs.querySelectorAll('[role="tab"]')];
  const from = tabs.indexOf(document.activeElement);
  if (from < 0) return;
  e.preventDefault();
  const to = Number.isFinite(step) ? (from + step + tabs.length) % tabs.length : (step < 0 ? 0 : tabs.length - 1);
  tabs[to].click();
});

// Cursor spotlight on bento cards: one delegated listener, at most one layout
// read per frame, CSS does the rest.
let spotFrame = 0;
let spotEvent = null;
dom.bento.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  spotEvent = e;
  spotFrame ||= requestAnimationFrame(() => {
    spotFrame = 0;
    const card = spotEvent.target instanceof Element ? spotEvent.target.closest('.bc') : null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${spotEvent.clientX - r.left}px`);
    card.style.setProperty('--my', `${spotEvent.clientY - r.top}px`);
  });
}, { passive: true });

/* ---------------------------------------------------------------- prefs */

async function updatePrefs(prefs, { rerank = false, recat = false } = {}) {
  state.prefs = prefs;
  if (rerank) recomputeRanking();
  if (rerank || recat) recategorize();
  renderSitesKeepingFocus();
  if (rerank || recat) renderBookmarks();
  scheduleSnapshot();
  await api.setPrefs(prefs).catch(() => {});
}

function togglePin(site) {
  const { pinned } = state.prefs;
  updatePrefs({
    ...state.prefs,
    pinned: site.pinned
      ? pinned.filter((p) => p.host !== site.host)
      : [...pinned, { host: site.host, url: site.url, name: site.name }],
  });
}

function hideSite(site) {
  const { pinned, hidden } = state.prefs;
  updatePrefs({
    ...state.prefs,
    pinned: pinned.filter((p) => p.host !== site.host),
    hidden: [...new Set([...hidden, site.host])],
  }, { rerank: true });
}

dom.reset.addEventListener('click', () => {
  updatePrefs({ ...state.prefs, hidden: [] }, { rerank: true });
  dom.input.focus();
});

/* ---------------------------------------------------------------- search */

function highlight(text, query) {
  const i = query ? text.toLowerCase().indexOf(query) : -1;
  if (i < 0) return [text];
  return [text.slice(0, i), el('mark', {}, text.slice(i, i + query.length)), text.slice(i + query.length)];
}

function buildResults(raw, extra = {}) {
  const q = raw.toLowerCase();
  const out = [];
  if (looksLikeUrl(raw)) out.push({ kind: 'go', group: t('groupGo'), title: raw, sub: toUrl(raw), url: toUrl(raw) });

  const sites = siteMatches(state.sites, q);
  const strongSite = sites.length > 0 && sites[0].rank >= 70;
  const web = { kind: 'web', group: t('groupWeb'), title: t('searchWeb', raw), sub: t('defaultEngine'), text: raw };

  if (!strongSite) out.push(web);
  for (const { site } of sites) {
    out.push({ kind: 'site', group: t('groupSites'), title: site.name, sub: site.host, url: site.url, host: site.host, tag: site.visits ? t('visits', fmt.format(site.visits)) : '' });
  }
  if (strongSite) out.push(web);

  const seen = new Set(out.map((r) => r.url).filter(Boolean));
  const add = (group, items, limit, withAge) => {
    let n = 0;
    for (const item of items) {
      if (n >= limit) break;
      const u = parseWeb(item.url);
      if (!u || seen.has(item.url)) continue;
      seen.add(item.url);
      out.push({ kind: 'page', group, title: item.title || item.url, sub: `${hostKey(u)}${u.pathname === '/' ? '' : u.pathname}`, url: item.url, host: hostKey(u), tag: withAge && item.lastVisitTime ? ago(item.lastVisitTime) : '' });
      n += 1;
    }
  };
  add(t('groupBookmarks'), (extra.bookmarks ?? []).filter((b) => b.url), 4, false);
  add(t('groupHistory'), [...(extra.history ?? [])].sort((a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0)), 5, true);
  return out;
}

function resultOption(r, i, q) {
  const lead = r.kind === 'web' ? glyph('search') : r.kind === 'go' ? glyph('go') : iconFor(r.url, r.title, r.host);
  return el('div', {
    class: 'result', id: `r-${i}`, role: 'option', data: { index: i },
    'aria-selected': String(i === state.active),
  },
  lead,
  el('span', { class: 'result-text' },
    el('span', { class: 'result-title' }, r.kind === 'site' || r.kind === 'page' ? highlight(r.title, q) : r.title),
    el('span', { class: 'result-sub' }, r.sub)),
  r.tag ? el('span', { class: 'result-tag' }, r.tag) : null);
}

function setPanelOpen(open) {
  dom.panel.hidden = !open;
  dom.input.setAttribute('aria-expanded', String(open));
  if (!open) dom.input.removeAttribute('aria-activedescendant');
}

// Options are grouped (Go to / Web / Your sites / …) so screen readers
// announce the group name along with each option.
function renderResults(query) {
  const q = query.toLowerCase();
  const groups = [];
  state.results.forEach((r, i) => {
    if (groups.at(-1)?.label !== r.group) groups.push({ label: r.group, options: [] });
    groups.at(-1).options.push(resultOption(r, i, q));
  });
  dom.panel.replaceChildren(...groups.map((g, gi) => el('div', { role: 'group', 'aria-labelledby': `rg-${gi}` },
    el('div', { class: 'results-group', id: `rg-${gi}`, 'aria-hidden': 'true' }, g.label),
    ...g.options)));

  const open = state.results.length > 0;
  setPanelOpen(open && document.activeElement === dom.input);
  if (open && state.active >= 0) dom.input.setAttribute('aria-activedescendant', `r-${state.active}`);
}

function setActive(i, { scroll = true } = {}) {
  if (i === state.active) return;
  $(`r-${state.active}`)?.setAttribute('aria-selected', 'false');
  state.active = i;
  const node = $(`r-${i}`);
  if (!node) return dom.input.removeAttribute('aria-activedescendant');
  node.setAttribute('aria-selected', 'true');
  if (scroll) node.scrollIntoView({ block: 'nearest' });
  dom.input.setAttribute('aria-activedescendant', node.id);
}

function announceResults() {
  const n = state.results.length;
  dom.resultsStatus.textContent = n ? t('resultsCount', fmt.format(n)) : '';
}

async function runSearch() {
  const raw = dom.input.value.trim();
  const token = ++state.queryToken;
  state.resultsFor = raw;
  if (!raw) {
    state.results = [];
    state.active = -1;
    renderResults('');
    announceResults();
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
  announceResults();
}

function openResult(r, background) {
  if (!r) return;
  if (r.kind === 'web') return api.webSearch(r.text, background);
  if (background) return api.openBackground(r.url);
  api.open(r.url);
}

function clearSearch() {
  clearTimeout(searchTimer);
  dom.input.value = '';
  runSearch();
}

const optionIndex = (e) => {
  const option = e.target instanceof Element ? e.target.closest('[role="option"]') : null;
  return option ? Number(option.dataset.index) : -1;
};

// Keep focus in the input while clicking options, so the combobox never loses
// its place (and blur can close the panel without a timer).
dom.panel.addEventListener('mousedown', (e) => e.preventDefault());
dom.panel.addEventListener('pointermove', (e) => {
  const i = optionIndex(e);
  if (i >= 0) setActive(i, { scroll: false });
});
dom.panel.addEventListener('click', (e) => {
  openResult(state.results[optionIndex(e)], e.ctrlKey || e.metaKey || e.shiftKey);
});
dom.panel.addEventListener('auxclick', (e) => {
  if (e.button !== 1) return;
  e.preventDefault();
  openResult(state.results[optionIndex(e)], true);
});

let searchTimer = 0;
dom.input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, SEARCH_DEBOUNCE);
});

dom.input.addEventListener('keydown', (e) => {
  const n = state.results.length;
  switch (e.key) {
    case 'ArrowDown':
      if (!n) return;
      e.preventDefault();
      setPanelOpen(true);
      setActive((state.active + 1) % n);
      break;
    case 'ArrowUp':
      if (!n) return;
      e.preventDefault();
      setPanelOpen(true);
      setActive((state.active - 1 + n) % n);
      break;
    case 'Enter': {
      e.preventDefault();
      const raw = dom.input.value.trim();
      if (!raw) return;
      // Enter before the debounce fired: act on what's typed, not the last results.
      const r = state.resultsFor === raw ? state.results[state.active] : buildResults(raw)[0];
      openResult(r, e.ctrlKey || e.metaKey);
      break;
    }
    case 'Escape':
      if (!dom.panel.hidden) setPanelOpen(false);
      else if (dom.input.value) clearSearch();
      else dom.input.blur();
      break;
  }
});

dom.input.addEventListener('blur', () => setPanelOpen(false));
dom.input.addEventListener('focus', () => {
  if (!state.results.length) return;
  setPanelOpen(true);
  if (state.active >= 0) dom.input.setAttribute('aria-activedescendant', `r-${state.active}`);
});

const isTyping = (target) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  || (target instanceof HTMLElement && target.isContentEditable);

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target)) {
    e.preventDefault();
    dom.input.focus();
    return;
  }
  // e.code, not e.key: with Shift held, e.key is "!" rather than "1".
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit && e.altKey && !e.ctrlKey && !e.metaKey) {
    const tile = state.tiles[Number(digit[1]) - 1];
    if (!tile) return;
    e.preventDefault();
    if (e.shiftKey) api.openBackground(tile.url);
    else api.open(tile.url);
  }
});

/* ---------------------------------------------------------------- clock */

const GREETING_JP = {
  greetingNight: 'こんばんは',
  greetingMorning: 'おはようございます',
  greetingAfternoon: 'こんにちは',
  greetingEvening: 'こんばんは',
};

let clockTimer = 0;

function tick() {
  clearTimeout(clockTimer);
  const now = new Date();
  const key = greetingKey(now.getHours());
  $('greeting').textContent = t('welcomeBack', t(key));
  $('greeting-jp').textContent = GREETING_JP[key];

  // "16:24" with a softly pulsing colon, StatementSlide scale
  const clock = $('clock');
  clock.replaceChildren(...timeFmt.formatToParts(now).map((p) => (
    p.type === 'literal' && p.value.trim() === ':' ? el('span', { class: 'colon' }, ':')
      : p.type === 'dayPeriod' ? el('span', { class: 'day-period' }, p.value)
        : p.value)));
  clock.setAttribute('aria-label', timeFmt.format(now));

  $('eyebrow').textContent = dateFmt.formatToParts(now)
    .filter((p) => p.type !== 'literal')
    .map((p) => p.value.replace(/\.$/, ''))
    .join(' · ');

  clockTimer = setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
}

/* ---------------------------------------------------------------- weather */

// The only networked part of the page, and it stays asleep until a place is
// chosen. See js/weather.js for what is (and is not) sent to Open-Meteo.

const wxKey = (bucket) => `wx${bucket[0].toUpperCase()}${bucket.slice(1)}`;
let wxPlaces = [];   // last geocoding results, indexed by the buttons' data-place
let wxToken = 0;     // drops the answer to a search the reader has moved past

function paintWeather() {
  const place = state.prefs.weather;
  const w = state.weather;
  // A failed refresh keeps the last reading on screen, dimmed and labelled.
  const stale = Boolean(place && w && state.weatherError);
  dom.wx.classList.toggle('is-set', Boolean(place && w));
  dom.wx.classList.toggle('is-stale', stale);

  if (!place) {
    dom.wx.replaceChildren(svg('partly'), el('span', { class: 'wx-label' }, t('weatherAdd')));
    dom.wx.setAttribute('aria-label', t('weatherAdd'));
    dom.wx.title = t('weatherAdd');
    return;
  }

  const where = place.name || t('weatherHere');
  if (!w) {
    const label = state.weatherError ? t('weatherUnavailable') : t('weatherLoading');
    dom.wx.replaceChildren(svg('cloudy'), el('span', { class: 'wx-label' }, label));
    dom.wx.setAttribute('aria-label', `${where} — ${label}`);
    dom.wx.title = `${where} — ${label}`;
    return;
  }

  const summary = t('weatherSummary', `${w.temp}°`, t(wxKey(w.bucket)), where)
    + (stale ? `. ${t('weatherStale', ago(w.at))}` : '');
  dom.wx.replaceChildren(
    svg(w.bucket),
    el('span', { class: 'wx-temp' }, `${w.temp}°`),
    el('span', { class: 'wx-label' }, where));
  dom.wx.setAttribute('aria-label', summary);
  dom.wx.title = `${summary} · ${t('wxFeels')} ${w.feels}°`;
}

async function refreshWeather(opts = {}) {
  if (!state.prefs.weather) {
    state.weather = null;
    state.weatherError = '';
    return paintWeather();
  }
  try {
    state.weather = await loadWeather(state.prefs.weather, opts);
    state.weatherError = '';
  } catch (err) {
    state.weatherError = String(err?.message ?? err);
    state.weather ??= lastReading(state.prefs.weather);
  }
  paintWeather();
  if (!dom.wxPanel.hidden) paintWxPanel();
}

/* the panel behind the pill */

const wxStat = (label, value) => el('div', {}, el('dt', {}, label), el('dd', {}, value));

function paintWxPanel() {
  const place = state.prefs.weather;
  const w = state.weather;
  const unit = place?.unit === 'f' ? 'f' : 'c';

  // replaceChildren() would turn a null child into the text "null", so the
  // optional rows are filtered out before they get there.
  dom.wxPanel.replaceChildren(...[
    el('h2', { class: 'wx-title' }, t('weatherTitle')),
    w ? el('dl', { class: 'wx-stats' },
      wxStat(t('wxNow'), `${w.temp}° ${t(wxKey(w.bucket))}`),
      wxStat(t('wxFeels'), `${w.feels}°`),
      wxStat(t('wxHumidity'), `${w.humidity}%`),
      wxStat(t('wxRange'), `${w.low}° / ${w.high}°`),
      w.rainChance == null ? null : wxStat(t('wxRainSoon'), `${w.rainChance}%`),
      w.sunrise && w.sunset ? wxStat(t('wxSun'), `${w.sunrise} / ${w.sunset}`) : null) : null,
    state.weatherError
      ? el('p', { class: 'wx-error', role: 'status' }, w ? t('weatherStale', ago(w.at)) : t('weatherUnavailable'))
      : w ? el('p', { class: 'wx-hint' }, t('weatherUpdated', ago(w.at))) : null,

    el('form', { class: 'wx-form', id: 'wx-form' },
      el('input', {
        class: 'wx-input', id: 'wx-city', type: 'text', autocomplete: 'off', spellcheck: 'false',
        placeholder: t('weatherCityPlaceholder'), 'aria-label': t('weatherCityLabel'), enterkeyhint: 'search',
      }),
      el('button', { class: 'wx-go', type: 'submit' }, t('weatherSearch'))),
    el('div', { class: 'wx-results', id: 'wx-results', role: 'status', 'aria-live': 'polite' }),

    el('div', { class: 'wx-row' },
      el('button', { class: 'wx-secondary', type: 'button', id: 'wx-locate' }, svg('locate'), el('span', {}, t('weatherUseLocation'))),
      el('button', {
        class: 'wx-secondary', type: 'button', id: 'wx-unit', 'aria-label': t('weatherUnit'),
      }, el('span', {}, unit === 'f' ? '°F → °C' : '°C → °F')),
      place ? el('button', { class: 'wx-secondary wx-off', type: 'button', id: 'wx-off' }, el('span', {}, t('weatherOff'))) : null),

    el('p', { class: 'wx-note' }, t('weatherNote')),
  ].filter(Boolean));
}

function toggleWxPanel(force) {
  const show = force ?? dom.wxPanel.hidden;
  dom.wxPanel.hidden = !show;
  dom.wx.setAttribute('aria-expanded', String(show));
  if (!show) return;
  paintWxPanel();
  refreshWeather();
  $('wx-city')?.focus();
}

dom.wx.addEventListener('click', () => toggleWxPanel());

async function setPlace(place) {
  const unit = state.prefs.weather?.unit ?? readLocal(WX_UNIT_KEY, 'c');
  clearWeatherCache();
  state.weather = null;
  state.weatherError = '';
  paintWeather();
  // Only the four fields the forecast needs are stored — the geocoder's extra
  // columns (country, region, population …) are not kept.
  await updatePrefs({ ...state.prefs, weather: { lat: place.lat, lon: place.lon, name: place.name ?? '', unit } });
  await refreshWeather({ force: true });
  toggleWxPanel(false);
  dom.wx.focus();
}

function showWxMessage(key) {
  $('wx-results')?.replaceChildren(el('p', { class: 'wx-hint' }, t(key)));
}

async function runPlaceSearch(query) {
  const token = ++wxToken;
  showWxMessage('weatherSearching');
  try {
    const places = await searchPlaces(query, lang);
    if (token !== wxToken) return;
    wxPlaces = places;
    if (!places.length) return showWxMessage('weatherNoPlaces');
    $('wx-results')?.replaceChildren(...places.map((place, i) => el('button', {
      class: 'wx-place', type: 'button', data: { place: String(i) },
    }, el('span', { class: 'wx-place-name' }, place.name), el('span', { class: 'wx-place-detail' }, place.detail))));
  } catch {
    if (token === wxToken) showWxMessage('weatherUnavailable');
  }
}

dom.wxPanel.addEventListener('submit', (e) => {
  e.preventDefault();
  const query = $('wx-city')?.value.trim() ?? '';
  if (query.length >= 2) runPlaceSearch(query);
});

dom.wxPanel.addEventListener('click', async (e) => {
  if (!(e.target instanceof Element)) return;

  const chosen = e.target.closest('[data-place]');
  if (chosen) return setPlace(wxPlaces[Number(chosen.dataset.place)]);

  if (e.target.closest('#wx-locate')) {
    showWxMessage('weatherLocating');
    try {
      return await setPlace(await currentPosition());
    } catch {
      return showWxMessage('weatherNoLocation');
    }
  }

  if (e.target.closest('#wx-unit')) {
    const place = state.prefs.weather ?? { lat: 0, lon: 0, name: '' };
    const unit = place.unit === 'f' ? 'c' : 'f';
    clearWeatherCache();
    state.weather = null; // a reading in the old unit must not survive a failed refetch
    await updatePrefs({ ...state.prefs, weather: state.prefs.weather ? { ...place, unit } : null });
    // Without a place there is nothing to convert yet; remember it for later.
    if (!state.prefs.weather) writeLocal(WX_UNIT_KEY, unit);
    await refreshWeather({ force: true });
    return paintWxPanel();
  }

  if (e.target.closest('#wx-off')) {
    clearWeatherCache();
    await updatePrefs({ ...state.prefs, weather: null });
    state.weather = null;
    state.weatherError = '';
    paintWeather();
    toggleWxPanel(false);
    dom.wx.focus();
  }
});

// Same dismissal rules as the category menu: click away or press Escape.
document.addEventListener('click', (e) => {
  if (dom.wxPanel.hidden || !(e.target instanceof Node)) return;
  if (!dom.wxPanel.contains(e.target) && !dom.wx.contains(e.target)) toggleWxPanel(false);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || dom.wxPanel.hidden) return;
  e.preventDefault();
  toggleWxPanel(false);
  dom.wx.focus();
});

/* ---------------------------------------------------------------- theme */

const THEME_ORDER = ['system', 'dark', 'light'];
const THEME_NAMES = { system: 'themeSystem', dark: 'themeDark', light: 'themeLight' };
const theme = window.launchpadTheme;

function paintThemeButton() {
  const pref = theme?.get() ?? 'system';
  const label = t('theme', t(THEME_NAMES[pref]));
  dom.theme.replaceChildren(svg(pref));
  dom.theme.setAttribute('aria-label', label);
  dom.theme.title = label;
}

dom.theme.addEventListener('click', () => {
  const pref = theme?.get() ?? 'system';
  theme?.set(THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length]);
  paintThemeButton();
});

/* ---------------------------------------------------------------- pin hint */

// The toolbar icon is the only way in, so while it is unpinned the page says
// how to pin it. Hides itself as soon as the icon is pinned, or on dismiss.
async function paintPinHint() {
  dom.pinHint.hidden = readLocal(PIN_HINT_KEY, false) || await api.isPinnedToToolbar();
}

$('pin-dismiss').addEventListener('click', () => {
  writeLocal(PIN_HINT_KEY, true);
  dom.pinHint.hidden = true;
  dom.input.focus();
});
api.onToolbarChanged(paintPinHint);

/* ---------------------------------------------------------------- load */

// Last snapshot is only painted if live history is slow (>150 ms), so the
// entry animation plays once on real data instead of twice. Writing it means
// serialising up to 1500 rows, so it waits for an idle moment and coalesces.
let snapshotQueued = false;

function scheduleSnapshot() {
  if (snapshotQueued) return;
  snapshotQueued = true;
  whenIdle(() => {
    snapshotQueued = false;
    writeLocal(CACHE_KEY, {
      history: state.history.slice(0, SNAPSHOT_HISTORY).map(({ url, title, visitCount, typedCount, lastVisitTime }) =>
        ({ url, title, visitCount, typedCount, lastVisitTime })),
      topSites: state.topSites,
      groups: state.groups,
      prefs: state.prefs,
    });
  });
}

function restore() {
  const cached = readLocal(CACHE_KEY, null);
  if (!cached) return false;
  Object.assign(state, {
    history: cached.history ?? [],
    topSites: cached.topSites ?? [],
    groups: cached.groups ?? [],
    prefs: sanitizePrefs(cached.prefs),
  });
  recomputeRanking();
  recomputeFolderCategories();
  render();
  return true;
}

async function fetchLive() {
  const [history, topSites, tree, prefs] = await Promise.all([
    api.history().catch(() => []),
    api.topSites().catch(() => []),
    api.bookmarkTree().catch(() => []),
    api.getPrefs().catch(() => ({})),
  ]);
  return { history, topSites, groups: buildGroups(tree), prefs: sanitizePrefs(prefs) };
}

function applyLive(live) {
  Object.assign(state, live, { loadedAt: Date.now() });
  recomputeRanking();
  recomputeFolderCategories();
  render();
  scheduleSnapshot();
}

let bookmarkTimer = 0;
api.onBookmarksChanged(() => {
  clearTimeout(bookmarkTimer);
  bookmarkTimer = setTimeout(async () => {
    state.groups = buildGroups(await api.bookmarkTree().catch(() => []));
    recomputeFolderCategories();
    renderBookmarks();
    scheduleSnapshot();
  }, 200);
});

// Pins/hides made in another launchpad window or on another synced device.
// storage.onChanged also echoes this page's own writes; those are skipped.
api.onPrefsChanged(async () => {
  const prefs = sanitizePrefs(await api.getPrefs().catch(() => ({})));
  const same = (key) => JSON.stringify(prefs[key]) === JSON.stringify(state.prefs[key]);
  const sameHidden = same('hidden');
  if (sameHidden && same('pinned') && same('categories') && same('weather')) return;
  const weatherMoved = !same('weather');
  state.prefs = prefs;
  if (!sameHidden) recomputeRanking();
  recategorize();
  renderSitesKeepingFocus();
  renderBookmarks();
  if (weatherMoved) refreshWeather({ force: true });
});

// Coming back to the launchpad (toolbar icon, Alt+Shift+L, or tab switch):
// fresh data, a current clock, a clean search box, and the cursor ready to type.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  tick();
  paintPinHint();
  refreshWeather();
  if (dom.input.value) clearSearch();
  dom.input.focus({ preventScroll: true });
  if (Date.now() - state.loadedAt > STALE_AFTER) fetchLive().then(applyLive);
});

async function boot() {
  await loadMessages();
  localize();
  tick();
  paintThemeButton();
  paintPinHint();
  paintWeather();

  const live = fetchLive();
  const slow = await Promise.race([live.then(() => false), new Promise((r) => setTimeout(() => r(true), 150))]);
  if (slow && restore()) document.body.classList.add('calm');

  applyLive(await live);
  refreshWeather();
  // Later re-renders (pin, hide, refresh) swap cards in place without replaying the entrance.
  setTimeout(() => document.body.classList.add('calm'), 1600);
  dom.input.focus({ preventScroll: true });
}

boot();
