// The launchpad is opt-in: it does NOT replace chrome://newtab.
// Clicking the toolbar icon (or Alt+Shift+L) opens it next to the current tab.
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('newtab.html'),
    index: typeof tab?.index === 'number' ? tab.index + 1 : undefined,
  });
});
