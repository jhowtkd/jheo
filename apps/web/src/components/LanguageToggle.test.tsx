import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ensureI18n, i18n } from '../i18n';
import { LanguageToggle } from './LanguageToggle';

beforeEach(async () => {
  window.localStorage.removeItem('jheo.locale');
  await ensureI18n();
  i18n.changeLanguage('en');
});

function renderWithRouter(ui: React.ReactNode, initialPath = '/projects') {
  return render(<MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>);
}

describe('LanguageToggle', () => {
  it('renders a button with an accessible label', () => {
    renderWithRouter(<LanguageToggle />);
    expect(screen.getByRole('button', { name: /language/i })).toBeInTheDocument();
  });

  it('opens the popover and lists both locales', () => {
    renderWithRouter(<LanguageToggle />);
    fireEvent.click(screen.getByRole('button', { name: /language/i }));
    expect(screen.getByRole('radio', { name: /english/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /português/i })).toBeInTheDocument();
  });

  it('selecting pt-BR persists and changes language', () => {
    renderWithRouter(<LanguageToggle />);
    fireEvent.click(screen.getByRole('button', { name: /language/i }));
    fireEvent.click(screen.getByRole('radio', { name: /português/i }));
    expect(window.localStorage.getItem('jheo.locale')).toBe('pt-BR');
    expect(i18n.language).toBe('pt-BR');
  });
});
