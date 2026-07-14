import { useEffect, useRef, useState } from 'react';
import { i18n } from './index';
import { translateTexts } from '../api';
import type { SupportedLocale } from './locale';

type TranslateError = 'no_llm_provider' | 'rate_limited' | null;

export function useDataTranslations(opts: {
  texts: string[];
  sourceLocale: SupportedLocale;
  context: 'finding' | 'generation' | 'material' | 'help';
}) {
  const { texts, sourceLocale, context } = opts;
  const [translated, setTranslated] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TranslateError>(null);
  const cache = useRef<Map<string, Map<string, string>>>(new Map());

  useEffect(() => {
    const uiLocale = (i18n.language as SupportedLocale) ?? 'en';
    if (uiLocale === 'en' || uiLocale === sourceLocale) {
      setError(null);
      setLoading(false);
      // For sourceLocale === uiLocale, surface the original text as translated.
      const next = new Map<string, string>();
      for (const t of texts) next.set(t, t);
      setTranslated(next);
      return;
    }

    const key = `${uiLocale}|${context}`;
    const pageCache = cache.current.get(key) ?? new Map();
    cache.current.set(key, pageCache);

    const missing = texts.filter((t) => !pageCache.has(t));
    if (missing.length === 0) {
      setTranslated(new Map(texts.map((t) => [t, pageCache.get(t) ?? t])));
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    translateTexts(missing, context)
      .then((rows) => {
        if (cancelled) return;
        for (const r of rows) pageCache.set(r.original, r.translated);
        setTranslated(new Map(texts.map((t) => [t, pageCache.get(t) ?? t])));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'no_llm_provider') setError('no_llm_provider');
        else if (msg === 'rate_limited') setError('rate_limited');
        else setError('rate_limited'); // fall back silently
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [i18n.language, texts.join('\u0000'), sourceLocale, context]);

  return { translated, loading, error };
}
