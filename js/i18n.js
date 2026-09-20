// chrome.i18n inside the extension; the English messages.json when previewed
// as a plain web page (no chrome.* APIs), so both paths share one string table.

const hasI18n = typeof chrome !== 'undefined' && !!chrome.i18n?.getMessage;
let fallback = {};

export async function loadMessages() {
  if (hasI18n) return;
  try {
    const res = await fetch(new URL('../_locales/en/messages.json', import.meta.url));
    fallback = await res.json();
  } catch { /* keys render as-is */ }
}

export function t(key, ...subs) {
  const args = subs.map(String);
  if (hasI18n) return chrome.i18n.getMessage(key, args) || key;
  const message = fallback[key]?.message;
  return message ? message.replace(/\$(\d)/g, (_, n) => args[n - 1] ?? '') : key;
}

export const uiLanguage = () => (hasI18n ? chrome.i18n.getUILanguage() : navigator.language);

export function localize(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
  for (const node of root.querySelectorAll('[data-i18n-label]')) node.setAttribute('aria-label', t(node.dataset.i18nLabel));
  document.documentElement.lang = uiLanguage();
  document.title = t('pageTitle');
}
