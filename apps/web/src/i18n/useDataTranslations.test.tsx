import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ensureI18n, i18n } from './index';
import { useDataTranslations } from './useDataTranslations';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as any;
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
});
