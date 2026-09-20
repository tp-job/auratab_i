# AuraTab

A fast, private New Tab dashboard for **Google Chrome** and **Microsoft Edge** (Manifest V3).
It replaces the New Tab page with a one-click grid of your most visited sites and your bookmarks, grouped by folder.
See [docs/context.md](docs/context.md) for the problem statement and requirements.
The UI follows the Spec-Sheet design system in [docs/design-system.md](docs/design-system.md).

## Features

| Requirement (docs/context.md) | How AuraTab does it |
| --- | --- |
| Automatic data retrieval | `chrome.topSites` for **Most visited**, and `chrome.bookmarks` for **Bookmarks**. It stays live: bookmark edits in any window update every open New Tab. |
| Dynamic New Tab | `chrome_url_overrides.newtab` points to `newtab.html` |
| Smart UI & categorisation | A responsive grid of site tiles and a card for each bookmark folder, showing its folder path. Favicons come from the built-in `_favicon` API, with a coloured letter avatar as fallback. |
| Visual hierarchy | Top sites are ranked by the browser's real visit data. An optional "Most opened first" setting re-ranks bookmarks by how often you open them from AuraTab. |
| Low latency | No framework and no build step. The last view is cached in `localStorage` for an instant first paint, then refreshed from the browser APIs. |
| Local processing & privacy | No servers, no analytics, no remote code. The CSP sets `connect-src 'none'`, so the page *cannot* make network requests. All settings and open counts stay in `chrome.storage.local`. |

Also included:
- Instant search across sites and bookmarks. Press `/` to focus it and `Enter` to open the first match. `Ctrl+Enter` opens the match in a background tab. With no match, `Enter` searches the web with your default search engine.
- You can hide a top site and undo it.
- You can collapse folders.
- Themes: light, dark, or system (every colour token carries both values via CSS `light-dark()`). Densities: comfortable or compact.
- English and Thai UI (`_locales/`).

## Design system

The page implements [docs/design-system.md](docs/design-system.md) in `css/newtab.css`:

- **L1 primitives:** the periwinkle / haze / midnight ramp, a decorative-only sub-palette (used just for the static aura), status greens, and Inter (bundled in `fonts/`, OFL).
- **L2 semantic tokens:** `bg`, `surface`, `surface-2`, `border`, `border-soft`, `text`, `text-secondary`, `text-tertiary`, `text-muted`, `accent`, `focus-ring`, plus `info-*` and `success-*`. Each token is one `light-dark(light, dark)` pair.
- **L3 patterns:** PageHeader (eyebrow, h1 clock, locale date, actions), a filter bar with a live "n of m" count, DocSections (28/500 heading over a hairline, subtitle, 80px rhythm), GroupLabels instead of nested cards, row lists, a Callout, and loading, empty and no-match states.

Enforced, not just documented:
- `npm run build` fails on a raw colour in L3 or a font weight above 600.
- `tests/design-tokens.test.mjs` measures every text token at ≥ 4.5:1 and indicators at ≥ 3:1 on `bg`, `surface` and `surface-2`, in both modes, and prints the ratios.
- `node scripts/store-assets.mjs --qa` renders 375 / 768 / 1024 / 1440 × light / dark into `dist/qa/` for review.

Deviation from the reference values: dark `text-muted` is ramp-200 (not 300). At 300 it measured 4.46:1 on `surface-2`, so, per §0 step 3, it moved one ramp step.

## Install (Load unpacked)

```sh
npm run release          # test + validate + build → dist/auratab/ and dist/auratab-<version>.zip
```

**Chrome:** go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `dist/auratab`.
**Edge:** go to `edge://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `dist/auratab`.

After editing code, run `npm run build` and click **Reload** on the extension card.
The full deploy and store-submission guide (in Thai) is in [docs/DEPLOY.md](docs/DEPLOY.md).

## Project layout

```
manifest.json           MV3 manifest
newtab.html             New Tab page
css/newtab.css          Styles and theme tokens (light / dark / compact)
js/newtab.js            Page controller: data loading, rendering, events
js/model.js             Pure data logic (grouping, ranking, search); unit-tested
js/i18n.js              chrome.i18n helpers
_locales/{en,th}/       UI strings
fonts/                  Inter variable font (latin) + OFL licence
icons/                  Extension icons (generated from the ramp)
scripts/build.mjs       Validate + build dist/auratab and the store zip
scripts/bump.mjs        Bump version in manifest.json and package.json
scripts/make-icons.mjs  Regenerate icons/ and store/logo-300.png
scripts/store-assets.mjs  Render store screenshots and promo tiles with headless Edge/Chrome
store/                  Store images and LISTING.md (copy-paste listing text)
docs/DEPLOY.md          Deploy / Load unpacked / store submission guide
PRIVACY.md              Privacy policy (host it publicly for the store listing)
tests/                  node:test unit tests + design-token contrast tests
```

## Scripts

Requires Node 18 or newer. There are no npm dependencies.

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests |
| `npm run build` | Validate and build `dist/auratab/` and `dist/auratab-<version>.zip` |
| `npm run release` | Tests, then build |
| `npm run bump [-- minor\|major\|x.y.z]` | Bump the version (default: patch) |
| `npm run icons` | Regenerate icons |
| `npm run store-assets` | Regenerate store screenshots and promo tiles (`-- --qa` for breakpoint review shots) |

## Permissions

| Permission | Why |
| --- | --- |
| `topSites` | Read the browser's most-visited list |
| `bookmarks` | Read bookmarks and listen for changes (read-only use) |
| `favicon` | Show site icons from the browser's local favicon cache |
| `storage` | Save settings and per-link open counts locally |
| `search` | Send `Enter` with no match to your default search engine (only when you press it) |
