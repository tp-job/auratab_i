import { t, localize, uiLanguage } from './i18n.js';
import {
  buildGroups, buildTopSites, bumpLaunch, greetingKey, isWebUrl, letterFor,
  matchesTokens, sanitizeSettings, searchText, sortByUsage, tokenize,
} from './model.js';

// The last rendered view is cached in localStorage (synchronous) so the page paints
// instantly, before the async chrome.* calls return.
const SNAPSHOT_KEY = 'auratab.snapshot.v1';

const $ = (id) => document.getElementById(id);
const els = {
  greeting: $('greeting'),
  time: $('time'),
  date: $('date'),
  search: $('search'),
  topSection: $('top-sites'),
  siteGrid: $('site-grid'),
  topEmpty: $('top-sites-empty'),
  bookmarksSection: $('bookmarks'),
  groups: $('groups'),
  bookmarksEmpty: $('bookmarks-empty'),
  noResults: $('no-results'),
  noResultsText: $('no-results-text'),
  filterCount: $('filter-count'),
  settingsBtn: $('open-settings'),
  dialog: $('settings'),
  form: $('settings-form'),
  restoreHidden: $('restore-hidden'),
  clearStats: $('clear-stats'),
  toast: $('toast'),
  toastText: $('toast-text'),
  toastAction: $('toast-action'),
};

const state = {
  settings: sanitizeSettings(),
  top: [],
  groups: [],
  stats: {},
  query: '',
};
let lastSignature = '';
let refreshSeq = 0;

// ---------- data ----------

function restoreSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;
    const snap = JSON.parse(raw);
    commit({ settings: sanitizeSettings(snap.settings), top: snap.top ?? [], groups: snap.groups ?? [] }, raw);
  } catch {
    // A missing or corrupt snapshot just means a normal (async) first paint.
  }
}

async function refresh() {
  const seq = ++refreshSeq;
  const { settings: rawSettings, stats = {} } = await chrome.storage.local.get(['settings', 'stats']);
  const settings = sanitizeSettings(rawSettings);
  const [sites, tree] = await Promise.all([
    settings.showTopSites ? chrome.topSites.get() : [],
    settings.showBookmarks ? chrome.bookmarks.getTree() : [],
  ]);
  if (seq !== refreshSeq) return; // a newer refresh has started

  state.stats = stats;
  const top = buildTopSites(sites, { hidden: settings.hiddenSites, limit: settings.topSitesLimit });
  let groups = buildGroups(tree, { includeOtherRoots: settings.includeOtherRoots });
  if (settings.bookmarkOrder === 'usage') {
    groups = groups.map((g) => ({ ...g, items: sortByUsage(g.items, stats) }));
  }
  commit({ settings, top, groups });
}

function commit(view, signature = JSON.stringify(view)) {
  if (signature === lastSignature) return;
  lastSignature = signature;
  Object.assign(state, view);
  applySettings();
  render();
  try {
    localStorage.setItem(SNAPSHOT_KEY, signature);
  } catch {
    // Storage full or blocked: the cache is only an optimisation.
  }
}

let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 150);
}

async function saveSettings(patch) {
  state.settings = sanitizeSettings({ ...state.settings, ...patch });
  syncForm();
  await chrome.storage.local.set({ settings: state.settings });
  await refresh();
}

function recordLaunch(url) {
  state.stats = bumpLaunch(state.stats, url);
  chrome.storage.local.set({ stats: state.stats });
}

// ---------- rendering ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.append(path);
  return svg;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const letterIcon = (item) => el('span', 'letter', letterFor(item));

function faviconSrc(pageUrl, cssSize) {
  const px = cssSize * (window.devicePixelRatio || 1);
  const size = px <= 16 ? 16 : px <= 32 ? 32 : 64;
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.href;
}

function favicon(item, cssSize, eager) {
  if (!isWebUrl(item.url)) return letterIcon(item);
  const img = new Image(cssSize, cssSize);
  img.alt = '';
  img.decoding = 'async';
  img.loading = eager ? 'eager' : 'lazy';
  img.addEventListener('error', () => img.replaceWith(letterIcon(item)), { once: true });
  img.src = faviconSrc(item.url, cssSize);
  return img;
}

function link(item, className, key) {
  const a = el('a', className);
  a.href = item.url;
  a.title = `${item.title}\n${item.url}`;
  a.dataset.url = item.url;
  a.dataset.key = key;
  return a;
}

function siteTile(site) {
  const li = el('li', 'site');
  li.dataset.search = searchText(site);

  const a = link(site, 'tile', `top:${site.url}`);
  const badge = el('span', 'tile-icon');
  badge.append(favicon(site, 32, true));
  a.append(badge, el('span', 'tile-label', site.title));

  const hide = el('button', 'tile-hide');
  hide.type = 'button';
  hide.dataset.hide = site.url;
  hide.title = t('hideSite');
  hide.setAttribute('aria-label', `${t('hideSite')}: ${site.title}`);
  hide.append(icon('close'));

  li.append(a, hide);
  return li;
}

// A folder is a GroupLabel (small caps over a hairline) plus a row list — not a nested card.
function groupBlock(group, collapsed) {
  const section = el('section', 'group');
  section.dataset.id = group.id;
  section.classList.toggle('is-collapsed', collapsed);

  const listId = `group-${group.id}`;
  const head = el('button', 'group-head');
  head.type = 'button';
  head.dataset.toggle = group.id;
  head.dataset.key = `group:${group.id}`;
  head.setAttribute('aria-expanded', String(!collapsed));
  head.setAttribute('aria-controls', listId);

  head.append(icon('chevron'), el('span', 'group-title', group.title || '—'));
  if (group.path.length > 1) head.append(el('span', 'group-note', group.path.slice(0, -1).join(' / ')));
  head.append(el('span', 'group-count', String(group.items.length)));
  const label = el('h4', 'group-label');
  label.append(head);

  const list = el('ul', 'links');
  list.id = listId;
  for (const item of group.items) {
    const li = el('li');
    li.dataset.search = searchText(item);
    const a = link(item, 'link', `bm:${group.id}:${item.id}`);
    a.append(favicon(item, 16, false), el('span', 'link-label', item.title));
    li.append(a);
    list.append(li);
  }

  section.append(label, list);
  return section;
}

// Loading state: placeholders with the real tile/row geometry, shown only when there is no cached view.
function renderSkeleton() {
  const { showTopSites, showBookmarks, topSitesLimit } = state.settings;
  els.topSection.hidden = !showTopSites;
  els.bookmarksSection.hidden = !showBookmarks;
  const tiles = document.createDocumentFragment();
  for (let i = 0; i < topSitesLimit; i++) {
    const li = el('li', 'site skeleton');
    const tile = el('span', 'tile');
    tile.append(el('span', 'tile-icon'), el('span', 'skeleton-bar'));
    li.append(tile);
    tiles.append(li);
  }
  els.siteGrid.replaceChildren(tiles);
  const group = el('section', 'group skeleton');
  const list = el('ul', 'links');
  for (let i = 0; i < 6; i++) {
    const li = el('li');
    const row = el('span', 'link');
    row.append(el('span', 'skeleton-bar'));
    li.append(row);
    list.append(li);
  }
  group.append(list);
  els.groups.replaceChildren(group);
}

function render() {
  const focusKey = document.activeElement?.dataset?.key;

  const tiles = document.createDocumentFragment();
  for (const site of state.top) tiles.append(siteTile(site));
  els.siteGrid.replaceChildren(tiles);

  const collapsed = new Set(state.settings.collapsed);
  const blocks = document.createDocumentFragment();
  for (const group of state.groups) blocks.append(groupBlock(group, collapsed.has(group.id)));
  els.groups.replaceChildren(blocks);

  applyFilter();

  if (focusKey) document.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
}

function applyFilter() {
  const tokens = tokenize(state.query);
  const searching = tokens.length > 0;
  document.body.classList.toggle('is-searching', searching);

  for (const li of document.querySelectorAll('li[data-search]')) {
    li.hidden = !matchesTokens(li.dataset.search, tokens);
  }
  for (const group of els.groups.children) {
    group.hidden = !group.querySelector('li:not([hidden])');
  }

  const { showTopSites, showBookmarks } = state.settings;
  const topHasHits = showTopSites && !!els.siteGrid.querySelector('li:not([hidden])');
  const bookmarksHaveHits = showBookmarks && !!els.groups.querySelector('.group:not([hidden])');

  els.topSection.hidden = !showTopSites || (searching && !topHasHits);
  els.bookmarksSection.hidden = !showBookmarks || (searching && !bookmarksHaveHits);
  els.topEmpty.hidden = searching || state.top.length > 0;
  els.bookmarksEmpty.hidden = searching || state.groups.length > 0;

  // Live "n of m" count, over the sections the user has switched on.
  const rows = [...document.querySelectorAll('li[data-search]')]
    .filter((li) => (li.closest('#top-sites') ? showTopSites : showBookmarks));
  const shown = rows.filter((li) => !li.hidden).length;
  const total = rows.length;
  els.filterCount.hidden = !searching;
  els.filterCount.textContent = t('filterCount', [String(shown), String(total)]);

  els.noResults.hidden = !searching || topHasHits || bookmarksHaveHits;
  if (!els.noResults.hidden) els.noResultsText.textContent = t('noResults', [state.query.trim()]);
}

function applySettings() {
  const { theme, density } = state.settings;
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.dataset.density = density;
  syncForm();
}

function syncForm() {
  const s = state.settings;
  const f = els.form.elements;
  f.namedItem('theme').value = s.theme;
  f.namedItem('density').value = s.density;
  f.namedItem('showTopSites').checked = s.showTopSites;
  f.namedItem('topSitesLimit').value = String(s.topSitesLimit);
  f.namedItem('topSitesLimit').disabled = !s.showTopSites;
  f.namedItem('showBookmarks').checked = s.showBookmarks;
  f.namedItem('includeOtherRoots').checked = s.includeOtherRoots;
  f.namedItem('includeOtherRoots').disabled = !s.showBookmarks;
  f.namedItem('bookmarkOrder').value = s.bookmarkOrder;
  f.namedItem('bookmarkOrder').disabled = !s.showBookmarks;
  els.restoreHidden.textContent = t('restoreHidden', [String(s.hiddenSites.length)]);
  els.restoreHidden.disabled = s.hiddenSites.length === 0;
}

function readForm() {
  const f = els.form.elements;
  return {
    theme: f.namedItem('theme').value,
    density: f.namedItem('density').value,
    showTopSites: f.namedItem('showTopSites').checked,
    topSitesLimit: Number(f.namedItem('topSitesLimit').value),
    showBookmarks: f.namedItem('showBookmarks').checked,
    includeOtherRoots: f.namedItem('includeOtherRoots').checked,
    bookmarkOrder: f.namedItem('bookmarkOrder').value,
  };
}

// ---------- clock ----------

function startClock() {
  const lang = uiLanguage();
  const timeFmt = new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' });
  const dateFmt = new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' });
  const tick = () => {
    const now = new Date();
    els.greeting.textContent = t(greetingKey(now.getHours()));
    els.time.textContent = timeFmt.format(now);
    els.date.textContent = dateFmt.format(now);
    setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
  };
  tick();
}

// ---------- toast ----------

let toastTimer;
function toast(message, { variant = 'info', action } = {}) {
  clearTimeout(toastTimer);
  els.toast.dataset.variant = variant;
  els.toastText.textContent = message;
  els.toastAction.hidden = !action;
  els.toastAction.onclick = null;
  if (action) {
    els.toastAction.textContent = action.label;
    els.toastAction.onclick = () => {
      hideToast();
      action.run();
    };
  }
  els.toast.hidden = false;
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  clearTimeout(toastTimer);
  els.toast.hidden = true;
}

// ---------- actions ----------

function openUrl(url, { newTab = false, active = true } = {}) {
  recordLaunch(url);
  if (newTab) chrome.tabs.create({ url, active });
  else chrome.tabs.update({ url });
}

function hideSite(url) {
  const before = state.settings.hiddenSites;
  saveSettings({ hiddenSites: [...before, url] });
  toast(t('siteHidden'), {
    action: {
      label: t('undo'),
      run: () => saveSettings({ hiddenSites: state.settings.hiddenSites.filter((u) => u !== url) }),
    },
  });
}

function toggleGroup(id) {
  const collapsed = new Set(state.settings.collapsed);
  if (collapsed.has(id)) collapsed.delete(id);
  else collapsed.add(id);
  saveSettings({ collapsed: [...collapsed] });
}

const firstVisibleLink = () =>
  document.querySelector('.section:not([hidden]) li:not([hidden]) a[data-url]');

function onSearchKey(event) {
  if (event.key === 'Escape') {
    if (els.search.value) {
      els.search.value = '';
      state.query = '';
      applyFilter();
    } else {
      els.search.blur();
    }
    return;
  }
  if (event.key !== 'Enter' || event.isComposing) return;
  event.preventDefault();
  const query = els.search.value.trim();
  if (!query) return;
  const hit = firstVisibleLink();
  const background = event.ctrlKey || event.metaKey;
  if (hit) openUrl(hit.dataset.url, { newTab: background, active: false });
  else chrome.search?.query({ text: query, disposition: background ? 'NEW_TAB' : 'CURRENT_TAB' });
}

function onLinkActivate(event) {
  const a = event.target.closest('a[data-url]');
  if (!a) return;
  const middle = event.type === 'auxclick';
  if (middle && event.button !== 1) return;
  const url = a.dataset.url;
  if (isWebUrl(url)) {
    recordLaunch(url); // let the browser handle http(s) natively (modifier keys, middle click…)
    return;
  }
  // Pages cannot link to chrome://, edge://, file:// etc. — go through the tabs API instead.
  event.preventDefault();
  const newTab = middle || event.ctrlKey || event.metaKey || event.shiftKey;
  openUrl(url, { newTab, active: event.shiftKey });
}

function bindEvents() {
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    applyFilter();
  });
  els.search.addEventListener('keydown', onSearchKey);

  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (els.dialog.open || target.closest?.('input, select, textarea, [contenteditable]')) return;
    event.preventDefault();
    els.search.focus();
    els.search.select();
  });

  document.addEventListener('click', (event) => {
    const hide = event.target.closest('[data-hide]');
    if (hide) return hideSite(hide.dataset.hide);
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) return toggleGroup(toggle.dataset.toggle);
    onLinkActivate(event);
  });
  document.addEventListener('auxclick', onLinkActivate);

  els.settingsBtn.addEventListener('click', () => els.dialog.showModal());
  els.dialog.addEventListener('click', (event) => {
    if (event.target === els.dialog) els.dialog.close(); // backdrop click
  });
  els.form.addEventListener('change', () => saveSettings(readForm()));
  els.restoreHidden.addEventListener('click', () => saveSettings({ hiddenSites: [] }));
  els.clearStats.addEventListener('click', async () => {
    state.stats = {};
    await chrome.storage.local.remove('stats');
    await refresh();
    toast(t('statsCleared'), { variant: 'success' });
  });

  // Keep every open New Tab in sync with bookmark edits and settings changed elsewhere.
  for (const evt of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
    chrome.bookmarks[evt]?.addListener(scheduleRefresh);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) scheduleRefresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleRefresh();
  });
}

// ---------- boot ----------

localize();
restoreSnapshot();
if (!lastSignature) renderSkeleton();
startClock();
bindEvents();
refresh();
