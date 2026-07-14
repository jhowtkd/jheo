import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ensureI18n, i18n } from './index';
import { HelpTip } from './HelpTip';

beforeEach(async () => {
  await ensureI18n();
  i18n.changeLanguage('en');
});

describe('HelpTip', () => {
  it('renders a focusable button labeled "?"', () => {
    render(<HelpTip term="audit" />);
    const btn = screen.getByRole('button', { name: /\?/ });
    expect(btn).toBeInTheDocument();
  });

  it('opens the popover on Enter and shows the en text', () => {
    render(<HelpTip term="audit" />);
    const btn = screen.getByRole('button', { name: /\?/ });
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toHaveTextContent(/audit checks a page/i);
  });

  it('localizes the popover text in pt-BR', () => {
    i18n.changeLanguage('pt-BR');
    render(<HelpTip term="audit" />);
    fireEvent.click(screen.getByRole('button', { name: /\?/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/auditoria analisa uma p/i);
  });

  it('closes on Esc', () => {
    render(<HelpTip term="audit" />);
    fireEvent.click(screen.getByRole('button', { name: /\?/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
