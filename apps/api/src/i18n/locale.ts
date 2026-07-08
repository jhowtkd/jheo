export type SupportedLocale = 'en' | 'pt-BR';

export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
};

const PRIMARY = ['en', 'pt-BR'] as const;
const PREFIX_MAP = {
  en: 'en',
  pt: 'pt-BR',
} as const satisfies Record<string, SupportedLocale>;
type Prefix = keyof typeof PREFIX_MAP;

/**
 * Parse an Accept-Language header (or null) and pick the best matching
 * supported locale. `pt*` is normalized to `pt-BR`; `en*` to `en`.
 * Anything else falls back to `en`. The first comma-separated tag with a
 * non-zero q-value wins; ties are broken by source order.
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
