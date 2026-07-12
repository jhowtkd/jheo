// apps/web/src/theme/theme.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { THEME_STORAGE_KEY, resolveTheme, applyTheme, type Theme } from './theme.js';

describe('theme', () => {
  beforeEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to light when nothing stored', () => {
    expect(resolveTheme()).toBe('light');
  });

  it('reads valid localStorage value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(resolveTheme()).toBe('dark');
  });

  it('ignores invalid localStorage and returns light', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(resolveTheme()).toBe('light');
  });

  it('applyTheme sets data-theme and persists', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
