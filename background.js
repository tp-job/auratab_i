// Atelier Launchpad is opt-in: it never replaces chrome://newtab. The toolbar
// icon (or Alt+Shift+L) is the only way in, and it behaves like a toggle:
//
//   • no launchpad open          → open one next to the current tab
//   • launchpad open elsewhere   → switch to it (no duplicate tabs)
//   • launchpad is the active tab → go back to the tab you came from
//
// The tab you came from is kept in session storage because an MV3 service
// worker can be stopped between clicks.

const PAGE = chrome.runtime.getURL('launchpad.html');

async function findLaunchpad(windowId) {
  // getContexts sees our own pages without the "tabs" permission. Compare
  // without the #fragment so a launchpad opened with one still counts.
  const contexts = (await chrome.runtime.getContexts({ contextTypes: ['TAB'] }))
    .filter((c) => c.documentUrl?.split('#')[0] === PAGE);
  if (!contexts.length) return null;
  // Prefer one in the current window, then any.
  return contexts.find((c) => c.windowId === windowId) ?? contexts[0];
}

async function activate(tabId, windowId) {
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(windowId, { focused: true });
}

chrome.action.onClicked.addListener(async (tab) => {
  const existing = await findLaunchpad(tab.windowId);

  if (existing && existing.tabId === tab.id) {
    const { returnTo } = await chrome.storage.session.get('returnTo');
    if (returnTo) {
      const back = await chrome.tabs.get(returnTo).catch(() => null);
      if (back) return activate(back.id, back.windowId);
    }
    return; // nowhere to go back to — the launchpad simply stays
  }

  await chrome.storage.session.set({ returnTo: tab.id });
  if (existing) return activate(existing.tabId, existing.windowId);

  await chrome.tabs.create({
    url: PAGE,
    index: typeof tab.index === 'number' ? tab.index + 1 : undefined,
    windowId: tab.windowId,
  });
});

// First install: open the launchpad once, so the pin-to-toolbar hint is seen.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: PAGE });
  }
});
