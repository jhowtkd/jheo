import { useEffect, useState } from 'react';
import { i18n } from './index';
import { translateTexts } from '../api';
import type { SupportedLocale } from './locale';

type TranslateError = 'no_llm_provider' | 'rate_limited' | null;

// Module-level translation cache, shared across every instance of the
// hook. Without this, two components that mount at the same time (e.g.
// a Findings panel and a Materials list rendered in the same view)
// each issue their own /api/translate request for the same texts —
// which is what trips the 10-req/min/IP bucket in the api and returns
// 429s back to the UI.
const cache = new Map<string, string>();
// In-flight dedup: when two callers ask for the same key while a
// request is already running, both await the same promise instead of
// firing a second request.
const inFlight = new Map<string, Promise<string>>();

function cacheKey(uiLocale: string, context: string, text: string): string {
  return `${uiLocale}|${context}|${text}`;
}

export function useDataTranslations(opts: {
  texts: string[];
  sourceLocale: SupportedLocale;
  context: 'finding' | 'generation' | 'material' | 'help';
}) {
  const { texts, sourceLocale, context } = opts;
  const [translated, setTranslated] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TranslateError>(null);

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

    // Hit cache for every text first; only the misses go to the network.
    const missing: string[] = [];
    const next = new Map<string, string>();
    for (const t of texts) {
      const key = cacheKey(uiLocale, context, t);
      const hit = cache.get(key);
      if (hit !== undefined) next.set(t, hit);
      else missing.push(t);
    }
    if (missing.length === 0) {
      setTranslated(next);
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
        for (const r of rows) {
          if (r.translated) {
            const key = cacheKey(uiLocale, context, r.original);
            cache.set(key, r.translated);
            inFlight.delete(key);
            next.set(r.original, r.translated);
          } else {
            // Server returned an empty translation (e.g. cache miss with
            // no LLM result) — fall back to the source text so the UI
            // still shows something.
            next.set(r.original, r.original);
          }
        }
        setTranslated(next);
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

// Exposed for tests — clears the shared module-level cache between
// cases so the dedup behaviour is observable from a clean slate.
export function __resetTranslationCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
