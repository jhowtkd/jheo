import { describe, it, expect } from 'vitest';
import { negotiateLocale, resolveInitialLocale } from './locale';

describe('negotiateLocale (web)', () => {
  it.each([
    [null, 'en'],
    ['en', 'en'],
    ['pt-BR', 'pt-BR'],
    ['pt', 'pt-BR'],
    ['fr', 'en'],
  ])('%s → %s', (input, expected) => {
    expect(negotiateLocale(input as string | null)).toBe(expected);
  });
});

describe('resolveInitialLocale', () => {
  it('returns localStorage value when valid', () => {
    window.localStorage.setItem('jheo.locale', 'pt-BR');
    expect(resolveInitialLocale()).toBe('pt-BR');
    window.localStorage.removeItem('jheo.locale');
  });

  it('falls back to navigator.language when storage empty', () => {
    window.localStorage.removeItem('jheo.locale');
    // navigator.language is en-US in jsdom by default.
    expect(resolveInitialLocale()).toBe('en');
  });

  it('ignores invalid storage value', () => {
    window.localStorage.setItem('jheo.locale', 'klingon');
    expect(resolveInitialLocale()).toBe('en');
    window.localStorage.removeItem('jheo.locale');
  });
});
