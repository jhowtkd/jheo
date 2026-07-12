// Locally vendored copy of the i18n helpers from `@jheo/core`.
//
// `apps/web` previously imported these from `@jheo/core` (the barrel), but
// the barrel re-exports `AgentPublisher` which pulls `node:fs` and breaks the
// Vite client bundle (the module is server-only). Vendoring the ~30 lines
// here keeps the SPA decoupled from core's server-only modules while we
// continue to share the supported-locale contract.
export type SupportedLocale = 'en' | 'pt-BR';

export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
};

const PREFIX_MAP = {
  en: 'en',
  pt: 'pt-BR',
} as const satisfies Record<string, SupportedLocale>;
type Prefix = keyof typeof PREFIX_MAP;

/**
 * Parse an Accept-Language header (or null) and pick the best matching
 * supported locale. `pt*` → `pt-BR`; `en*` → `en`. Anything else → `en`.
 */
export function negotiateLocale(header: string | null | undefined): SupportedLocale {
  if (!header) return 'en';
  const tags = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number(qParam.split('=')[1]) : 1;
      return { tag: (tag ?? '').toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((t) => t.tag.length > 0 && t.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    const primary = tag.split('-')[0];
    if (primary && (primary as Prefix) in PREFIX_MAP) return PREFIX_MAP[primary as Prefix];
  }
  return 'en';
}

/** Display name for a locale tag; unknown tags fall back to the bare tag. */
export function localeDisplayName(locale: string): string {
  return (LOCALE_NAMES as Record<string, string>)[locale] ?? locale;
}
