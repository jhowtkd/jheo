import { LOCALE_NAMES, negotiateLocale, type SupportedLocale } from '@jheo/core';

export { LOCALE_NAMES, negotiateLocale, type SupportedLocale };

/** Resolution order for the SPA: localStorage > navigator.language > en default. */
export function resolveInitialLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem('jheo.locale');
  if (stored === 'en' || stored === 'pt-BR') return stored;
  return negotiateLocale(window.navigator.language);
}
