import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionActions } from '../SuggestionActions.js';
import { ensureI18n, i18n } from '../../../i18n';

beforeEach(async () => {
  window.localStorage.removeItem('jheo.locale');
  await ensureI18n();
  i18n.changeLanguage('pt-BR');
});

describe('SuggestionActions', () => {
  it('calls onAccept when Accept is clicked', () => {
    const onAccept = vi.fn();
    render(<SuggestionActions onAccept={onAccept} onReject={() => {}} onRegenerate={() => {}} />);
    fireEvent.click(screen.getByText(/aceitar/i));
    expect(onAccept).toHaveBeenCalled();
  });

  it('calls onReject when Reject is clicked', () => {
    const onReject = vi.fn();
    render(<SuggestionActions onAccept={() => {}} onReject={onReject} onRegenerate={() => {}} />);
    fireEvent.click(screen.getByText(/rejeitar/i));
    expect(onReject).toHaveBeenCalled();
  });
});
