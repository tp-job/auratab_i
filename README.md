# Atelier Launchpad

A Chrome / Edge (MV3) extension that shows your most-used sites, bookmarks and one search box.
It opens **only when you ask**: click the toolbar icon or press **Alt+Shift+L**.
It does **not** replace the New Tab page.
See [docs/context.md](docs/context.md) for the problem statement and requirements.

> This replaces AuraTab (which always overrode the New Tab page). The old sources are archived in [`legacy/`](legacy/).

## Interaction model

The toolbar icon is the only way in, and it works as a toggle:

| When you click the icon (or press Alt+Shift+L)… | What happens |
|---|---|
| No launchpad tab is open | One opens next to your current tab |
| A launchpad tab is open somewhere else | That tab comes to the front. No duplicates are created. |
| You are already on the launchpad | You go back to the tab you came from |

Because the icon is the entry point, it has to stay visible. On install the launchpad opens once. While the icon is **not pinned** to the toolbar, the page shows a short hint explaining how to pin it. The hint disappears on its own once you pin the icon, or when you dismiss it.

A launchpad tab can sit in the background for a while, so each time you come back to it, it refreshes its data (if the data is more than 30 s old), clears the search and focuses the search box.

## What it solves

| Problem | How |
|---|---|
| Frequently used sites are scattered across bookmarks, history and typed URLs | One page with your top sites and bookmark folders, plus one search box for your sites, bookmarks, history and the web |
| Keeping favourites up to date by hand | No manual entry. Sites rank themselves from the last 90 days of history. Pin and hide are optional overrides. |
| No visual hierarchy | A bento grid with #1 as the large feature card and ranks 02–09 around it, an Insight card, Recent pages, a dock for the next 12, then Bookmarks by folder |
| Everything in one undifferentiated pile | Sites, the dock and bookmark folders are sorted into categories (Dev, AI, Work, Social, Media, News, Learn, Shopping, Finance) from the host name alone; chips filter each section and any site can be moved by hand |
| Privacy | Everything is processed locally and fonts are bundled. The only network call the CSP allows is the weather API, and only after you pick a place — see [PRIVACY.md](PRIVACY.md). |

## Sections

- **Weather** (top right): off until you pick a city or share your location. Then the pill shows the current temperature; the panel adds feels-like, humidity and the day's low/high, and switches between °C and °F.
- **02 Most used**: the bento grid. The #1 site is the velvet feature card. A row of category chips filters it. There are also usage-share insights and "Pick up where you left off", which keeps the last 20 pages and shows 6 until you expand it.
- **03 Everyday**: a dock with macOS-style magnification, behind sub-tabs. **All** carries on where the bento stopped (sites 10–21); **Dev**, **AI**, **Work** and the rest are drawers of their own, showing the top 12 sites of that category.
- **04 Bookmarks**: every folder that holds links becomes a card, labelled with its folder path and the category most of its links agree on, in browser order. Chips filter by category. Each card shows 6 links with "Show all" (the expanded state is remembered per device). The section updates live when bookmarks change.

## Categories

A site's category comes from its host alone, matched against a table of whole
host segments in `js/model.js` — so `x.com` is Social but `sphinx.com` is not,
and `localhost:5173`, `127.0.0.1:5500` and anything on a `.dev` address are Dev.
Nothing is looked up online. The tag button on any tile moves that host to a
different category; the override is stored with your pins (and drops itself
again if you pick the category the rules would have given it anyway).

## Ranking

For each page in history:
`(visits + 3 × typed visits) × (0.3 + 0.7 × e^(−days since last visit / 21))`, summed per host, plus a small bonus from Chrome's Top Sites.

## Keys

| Key | Action |
|---|---|
| `Alt+Shift+L` | Open / leave the launchpad |
| `/` | Focus search |
| `↑` `↓` | Move through results |
| `Enter` | Open the selected result |
| `Ctrl+Enter` | Open it in a background tab |
| `Esc` | Clear the search |
| `Alt+1…9` | Open tile N |
| `Alt+Shift+1…9` | Open tile N in the background |

You can change the shortcut at `chrome://extensions/shortcuts`.

## Install (Load unpacked)

```sh
npm run release          # test + validate + build → dist/atelier-launchpad/ and the store zip
```

1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and select `dist/atelier-launchpad`.
3. Pin the extension (puzzle-piece menu → pin), then click its icon.

If AuraTab is still installed, remove it. Otherwise it will keep overriding the New Tab page.

## Preview without installing

Serve the project root (for example `python -m http.server`) and open `/launchpad.html`. When the `chrome.*` APIs aren't available, the page uses demo data and always shows the pin hint.

## Project layout

```
manifest.json         MV3 manifest: action + Alt+Shift+L, no New Tab override, strict CSP
background.js         Toolbar-icon toggle (open / switch to / go back), first-install open
launchpad.html        The launchpad page
css/launchpad.css     Nocturnal Atelier v3.2 styles (dark / light), bundled Inter
js/launchpad.js       Page controller: data, rendering, search, pin hint, refresh-on-return
js/model.js           Pure logic (ranking, tiles, recent, search, bookmark groups); unit-tested
js/i18n.js            chrome.i18n, with messages.json fallback for the demo preview
js/theme.js           Theme applied before first paint
js/ether.js           WebGL ambient backdrop (off on touch / reduced motion)
_locales/{en,th}/     UI strings
fonts/ icons/         Bundled Inter, extension icons
scripts/build.mjs     Validate + build dist/atelier-launchpad and the store zip
tests/                node:test unit tests
legacy/               Archived AuraTab and the original launchpad prototype
```

`npm run build` fails when any of these hold:

- a New Tab override is set
- `action` is missing, or it has a popup (a popup would stop the icon click from opening the launchpad)
- the shortcut is missing
- there are inline styles or scripts, or remote resources
- a message key is undefined
- the locales are out of sync
- a font weight is above 600

## Permissions

| Permission | Why |
|---|---|
| `history` | Rank sites from the last 90 days and search history, locally |
| `topSites` | A small ranking bonus from the browser's own most-visited list |
| `bookmarks` | Show bookmark folders and search them (read-only) |
| `favicon` | Site icons from the browser's local favicon cache |
| `storage` | Sync pins and hidden sites (`storage.sync`), and remember the tab to return to (`storage.session`) |
| `search` | Send a web search to your default engine, only when you choose it |

No `tabs` permission is needed. The icon toggle finds its own tab with `chrome.runtime.getContexts`.
