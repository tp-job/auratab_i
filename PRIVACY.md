# Atelier Launchpad Privacy Policy

_Last updated: 2026-09-27_

Atelier Launchpad is a browser extension. When you click its toolbar icon, it opens a launchpad page with your most-used sites, your bookmarks and a search box. It does not replace the New Tab page.

## What Atelier Launchpad accesses

| Data | Why | Where it goes |
| --- | --- | --- |
| Browsing history (`history`) | Ranks your most-used sites from the last 90 days, lists recent pages, and searches history when you type | Read in your browser only. A copy of the ranking inputs is cached in the extension's own local storage so the page opens instantly. It is never sent anywhere. |
| Most visited sites (`topSites`) | Adds a small bonus to the ranking | Read in your browser only |
| Bookmarks (`bookmarks`) | Shows your bookmark folders and searches them | Read in your browser only. Bookmarks are never modified or sent anywhere. |
| Site icons (`favicon`) | Shows each site's icon from the browser's own local icon cache | Stays in your browser |
| Pins and hidden sites (`storage`) | Remembers the sites you pin or hide | Saved in your browser's extension storage. If you use browser sync, your browser syncs them between your own devices. |
| Search text (`search`) | When you choose "Search the web", your text goes to **your browser's default search engine**, just as if you typed it in the address bar | Handled by your browser and your chosen search engine, never by Atelier Launchpad |
| Weather place (`storage`) | **Off until you turn it on.** Once you pick a city — or press **Use my location**, which shows your browser's own location prompt — it fetches the current conditions for that place | The place (rounded to ~1 km) is saved in extension storage like your pins. Fetching a forecast sends only those rounded coordinates to `open-meteo.com`, with no account, no cookies and no referrer. Nothing else about you is sent, and no other origin can be reached: the CSP allows those two hosts and nothing more. |

## What Atelier Launchpad does not do

- It makes **no network requests at all** unless you turn on weather. Its Content Security Policy allows exactly two origins (`api.open-meteo.com` and `geocoding-api.open-meteo.com`) and nothing else; its fonts are bundled.
- It has no analytics, tracking, ads or remote code.
- It does not sell, transfer or share any data with third parties.
- It does not read the content of the pages you visit.

## Your control

- Hide any site from its tile. Use **Restore hidden sites** in the footer to bring them back.
- Turn weather off at any time from the weather panel; that removes the saved place and the page goes back to making no network requests.
- Categories are worked out from the site's own address on your device. Nothing is looked up online, and you can move any site to another category from its tile.
- Uninstalling Atelier Launchpad deletes all of its stored data.

## Contact

Questions: `<your support email>`
