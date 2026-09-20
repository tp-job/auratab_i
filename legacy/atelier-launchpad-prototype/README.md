# Atelier Launchpad

A Chrome (MV3) extension: click the toolbar icon (or **Alt+Shift+L**) to open a
launchpad tab. It does **not** replace Chrome's normal new tab page.

## What it solves

| Problem | How |
|---|---|
| Frequently used sites are scattered across bookmarks, history and typed URLs | One page with your top sites, plus one search box that covers your sites, bookmarks, history and the web |
| Keeping favourites up to date by hand | No manual entry. Sites rank themselves from the last 90 days of history. Pin and hide are optional overrides |
| No visual hierarchy on the default new tab | A bento grid with #1 as the large feature card and ranks 02–09 around it, an Insight card with usage share, Recent pages, and a dock for the next 12 |

## Look

It matches the portfolio homepage (Nocturnal Atelier v3.2):

- **Ether backdrop** (`ether.js`): a single WebGL shader that draws the same palette and radial gradient as the site's LiquidEther. It is ambient only and does not follow the cursor. It runs at half resolution and 30 fps, and pauses in hidden tabs. It stays off on touch devices and under reduced-motion, which get the static gradient instead, as on the site. There is no three.js dependency.
- **Hero**: styled after `StatementSlide`: huge font-light clock, tracked `SAT · 19 · SEPT` eyebrow, Japanese greeting in Zen Kaku Gothic New.
- **Bento**: the `BentoGrid` 5-column layout (`1fr 1fr 1.65fr 1fr 1fr`) with the #1 site as the velvet centre card (the `bc--3` treatment).
- **Dock**: sites 10–21, with macOS-style magnification using CSS `:has()`.
- Cursor spotlight on cards, film grain, and a system / dark / light toggle (top right).

## Ranking

For each page in history:
`(visits + 3 × typed visits) × (0.3 + 0.7 × e^(−days since last visit / 21))`.
Pages are summed per host. Chrome's Top Sites adds a small bonus. URLs you typed
count 3× because typing a URL shows stronger intent than following a link.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**
2. Click **Load unpacked** and pick this folder
3. Pin the extension, then click its icon

## Keys

`/` focus search · `↑ ↓` move · `Enter` open · `Ctrl+Enter` open in a background tab ·
`Esc` clear · `Alt+1…9` open tile N (`Alt+Shift+N` opens it in the background)

## Permissions

`history`, `topSites`, `bookmarks` are read locally for ranking and search.
`favicon` is used for icons, `search` for your default engine, and `storage`
syncs pins and hidden sites. Browsing data never leaves the browser. The only
network request is Google Fonts (Inter + Zen Kaku Gothic New). Without it, the
page falls back to Segoe UI / Yu Gothic.

## Preview without installing

Serve the folder (for example `npx http-server`) and open `newtab.html`. When
the `chrome.*` APIs aren't available, the page falls back to demo data.
