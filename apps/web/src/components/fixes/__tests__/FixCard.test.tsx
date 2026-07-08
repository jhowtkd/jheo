import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FixCard } from '../FixCard.js';
import type { Suggestion } from '../../../api.js';
import { ensureI18n, i18n } from '../../../i18n';

const finding = {
  id: 'f1',
  category: 'seo',
  severity: 'warning',
  message: 'Meta description is missing',
  url: 'https://example.com/p',
};

const baseSuggestion: Suggestion = {
  id: 's1', findingId: 'f1', kind: 'snippet', category: 'seo',
  before: '<title>Old</title>', after: '<title>New</title>',
  confidence: 'high', rationale: 'Better title.', locale: 'en',
  status: 'pending', model: 'fake',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  decidedAt: null,
};

beforeEach(async () => {
  window.localStorage.removeItem('jheo.locale');
  await ensureI18n();
  i18n.changeLanguage('pt-BR');
});

describe('FixCard', () => {
  it('shows the Generate button when no suggestion exists', () => {
    const onGenerate = vi.fn();
    render(<FixCard finding={finding} suggestion={null} onGenerate={onGenerate} onAccept={() => {}} onReject={() => {}} onRegenerate={() => {}} />);
    expect(screen.getByText(/gerar/i)).toBeTruthy();
  });

  it('shows the suggestion body when one exists', () => {
    render(
      <FixCard
        finding={finding}
        suggestion={baseSuggestion}
        onGenerate={() => {}}
        onAccept={() => {}}
        onReject={() => {}}
        onRegenerate={() => {}}
      />,
    );
    expect(screen.getByText(/New/)).toBeTruthy();
  });

  it('hides the actions row when status !== pending', () => {
    const accepted = { ...baseSuggestion, status: 'accepted' as const };
    render(
      <FixCard
        finding={finding}
        suggestion={accepted}
        onGenerate={() => {}}
        onAccept={() => {}}
        onReject={() => {}}
        onRegenerate={() => {}}
      />,
    );
    // Accept button should not be present
    expect(screen.queryByText(/aceitar/i)).toBeNull();
  });

  it('calls onGenerate when the Generate button is clicked', () => {
    const onGenerate = vi.fn();
    render(<FixCard finding={finding} suggestion={null} onGenerate={onGenerate} onAccept={() => {}} onReject={() => {}} onRegenerate={() => {}} />);
    fireEvent.click(screen.getByText(/gerar/i));
    expect(onGenerate).toHaveBeenCalledOnce();
  });
});