import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ensureI18n, i18n } from './index';
import { useDataTranslations, __resetTranslationCacheForTests } from './useDataTranslations';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as any;
  // Wipe the module-level cache so cache-sharing tests see a clean slate.
  __resetTranslationCacheForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDataTranslations', () => {
  it('skips network when uiLocale is en', async () => {
    await ensureI18n();
    i18n.changeLanguage('en');
    const { result } = renderHook(() =>
      useDataTranslations({ texts: ['x'], sourceLocale: 'en', context: 'finding' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.translated.get('x')).toBe('x');
  });

  it('skips network when uiLocale equals sourceLocale', async () => {
    await ensureI18n();
    i18n.changeLanguage('pt-BR');
    const { result } = renderHook(() =>
      useDataTranslations({ texts: ['x'], sourceLocale: 'pt-BR', context: 'finding' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls /api/translate when locales differ', async () => {
    await ensureI18n();
    i18n.changeLanguage('pt-BR');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        translations: [
          {
            original: 'Meta description is missing.',
            translated: 'Falta a descrição.',
            cached: true,
          },
        ],
      }),
    } as any);
    const { result } = renderHook(() =>
      useDataTranslations({
        texts: ['Meta description is missing.'],
        sourceLocale: 'en',
        context: 'finding',
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.translated.get('Meta description is missing.')).toBe(
      'Falta a descrição.',
    );
  });

  it('reports no_llm_provider error on 503', async () => {
    await ensureI18n();
    i18n.changeLanguage('pt-BR');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'no_llm_provider' }),
    } as any);
    const { result } = renderHook(() =>
      useDataTranslations({ texts: ['x'], sourceLocale: 'en', context: 'finding' }),
    );
    await waitFor(() => expect(result.current.error).toBe('no_llm_provider'));
  });

  it('shares the module-level cache across hook instances (no second request)', async () => {
    // Two components mount in parallel with the same text. The first
    // request resolves the translation; the second hook should read it
    // from the module-level cache and NOT issue a second /api/translate
    // call. This is the main defence against the 10-req/min/IP bucket.
    await ensureI18n();
    i18n.changeLanguage('pt-BR');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        translations: [{ original: 'Cached text', translated: 'Texto em cache', cached: false }],
      }),
    } as any);

    const first = renderHook(() =>
      useDataTranslations({ texts: ['Cached text'], sourceLocale: 'en', context: 'finding' }),
    );
    await waitFor(() =>
      expect(first.result.current.translated.get('Cached text')).toBe('Texto em cache'),
    );

    // Mount a second hook with the same text — should hit cache, zero new requests.
    const second = renderHook(() =>
      useDataTranslations({ texts: ['Cached text'], sourceLocale: 'en', context: 'finding' }),
    );
    await waitFor(() =>
      expect(second.result.current.translated.get('Cached text')).toBe('Texto em cache'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();
  });

  it('falls back to the source text when the server returns an empty translation', async () => {
    // translateBatch can return { translated: '' } for texts the LLM
    // didn't cover (e.g. mixed-language inputs the parser rejected).
    // The UI must show the source text in that case instead of an empty
    // string, and the cache must NOT store the empty value (otherwise
    // we'd lock the empty result in for the rest of the session).
    await ensureI18n();
    i18n.changeLanguage('pt-BR');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        translations: [{ original: 'Edge case', translated: '', cached: false }],
      }),
    } as any);
    const { result } = renderHook(() =>
      useDataTranslations({ texts: ['Edge case'], sourceLocale: 'en', context: 'finding' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.translated.get('Edge case')).toBe('Edge case');

    // A second hook should re-request the text (cache must not have
    // memoized the empty result).
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        translations: [{ original: 'Edge case', translated: 'Caso de borda', cached: false }],
      }),
    } as any);
    const second = renderHook(() =>
      useDataTranslations({ texts: ['Edge case'], sourceLocale: 'en', context: 'finding' }),
    );
    await waitFor(() =>
      expect(second.result.current.translated.get('Edge case')).toBe('Caso de borda'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
