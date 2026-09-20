export const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions) || key;

export const uiLanguage = () => chrome.i18n.getUILanguage();

export function localize(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-label]')) {
    const label = t(el.dataset.i18nLabel);
    el.setAttribute('aria-label', label);
    if (el.tagName === 'BUTTON') el.title = label;
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
    el.querySelector('input')?.setAttribute('aria-label', el.title);
  }
  document.documentElement.lang = uiLanguage();
}
