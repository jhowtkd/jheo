import { describe, it, expect } from 'vitest';
import { negotiateLocale, LOCALE_NAMES } from '../src/i18n/locale.js';

describe('negotiateLocale', () => {
  it.each([
    [null, 'en'],
    [undefined, 'en'],
    ['', 'en'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['en-GB,en;q=0.5', 'en'],
    ['pt', 'pt-BR'],
    ['pt-BR', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['fr', 'en'],
    ['zh-CN', 'en'],
    ['pt-BR,en;q=0.8', 'pt-BR'],
  ])('negotiates %s → %s', (input, expected) => {
    expect(negotiateLocale(input as string | null)).toBe(expected);
  });
});

describe('LOCALE_NAMES', () => {
  it('has English and Portuguese labels', () => {
    expect(LOCALE_NAMES.en).toBe('English');
    expect(LOCALE_NAMES['pt-BR']).toBe('Português (Brasil)');
  });
});