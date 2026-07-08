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

/** Resolution order for the SPA: localStorage > navigator.language > en default. */
export function resolveInitialLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem('jheo.locale');
  if (stored === 'en' || stored === 'pt-BR') return stored;
  return negotiateLocale(window.navigator.language);
}