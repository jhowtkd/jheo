import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ensureI18n, i18n } from '../i18n/index.js';
import { THEME_STORAGE_KEY } from '../theme/theme.js';
import { ThemeToggle } from './ThemeToggle.js';

beforeEach(async () => {
  window.localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.setAttribute('data-theme', 'light');
  await ensureI18n();
  i18n.changeLanguage('en');
});

describe('ThemeToggle', () => {
  it('renders a button with an accessible label', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
  });

  it('opens the popover and lists both themes', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /theme/i }));
    expect(screen.getByRole('radio', { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /dark/i })).toBeInTheDocument();
  });

  it('selecting dark persists and flips data-theme', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /theme/i }));
    fireEvent.click(screen.getByRole('radio', { name: /dark/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
