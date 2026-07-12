// apps/web/src/theme/theme.ts
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'jheo.theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** Default is light (afternoon / projector). Stored preference wins. */
export function resolveTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function applyStoredTheme(): Theme {
  const theme = resolveTheme();
  applyTheme(theme);
  return theme;
}
