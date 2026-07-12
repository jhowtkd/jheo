// Locally vendored — see ./locale-base.ts for the rationale.
import {
  LOCALE_NAMES,
  negotiateLocale,
  localeDisplayName,
  type SupportedLocale,
} from './locale-base.js';

// Re-export so consumers of `locale.ts` keep working.
export { LOCALE_NAMES, negotiateLocale, localeDisplayName };
export type { SupportedLocale };

/** Resolution order for the SPA: localStorage > navigator.language > en default. */
export function resolveInitialLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem('jheo.locale');
  if (stored === 'en' || stored === 'pt-BR') return stored;
  return negotiateLocale(window.navigator.language);
}
