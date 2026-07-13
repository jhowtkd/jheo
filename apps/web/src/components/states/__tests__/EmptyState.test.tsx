import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { EmptyState } from '../EmptyState';
import { i18n } from '../../../i18n/index.js';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function renderWith(node: React.ReactNode) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );
}

describe('EmptyState', () => {
  it('renders title and hint keys', () => {
    renderWith(<EmptyState titleKey="projects.empty.title" hintKey="projects.empty.hint" />);
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByText(/Create your first project/)).toBeInTheDocument();
  });

  it('renders a CTA Link when cta is provided', () => {
    renderWith(
      <EmptyState
        titleKey="projects.empty.title"
        cta={{ to: '/projects/new', labelKey: 'projects.empty.action' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Create project' });
    expect(link).toHaveAttribute('href', '/projects/new');
  });

  it('renders children (escape hatch for rich art)', () => {
    renderWith(
      <EmptyState titleKey="projects.empty.title">
        <svg data-testid="art" viewBox="0 0 56 56" />
      </EmptyState>,
    );
    expect(screen.getByTestId('art')).toBeInTheDocument();
  });

  it('omits CTA when not provided', () => {
    renderWith(<EmptyState titleKey="projects.empty.title" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // --- kind + COPY discriminant (spec-frozen contract) ---

  it('renders a known kind title from COPY (no explicit titleKey)', () => {
    renderWith(<EmptyState kind="no-findings" />);
    // COPY['no-findings'] = { titleKey: 'fixes.empty' } → en catalog.
    expect(screen.getByText('No pending findings. Run an audit to get started.')).toBeInTheDocument();
  });

  it("renders a known kind's COPY CTA when present", () => {
    renderWith(<EmptyState kind="no-projects" />);
    // COPY['no-projects'] CTA → localePath('projects') = '/projects' under en.
    const link = screen.getByRole('link', { name: 'Go to projects' });
    expect(link).toHaveAttribute('href', '/projects');
  });

  it('lets an explicit titleKey override the kind default', () => {
    renderWith(<EmptyState kind="no-findings" titleKey="projects.empty.title" />);
    // Override wins: projects.empty.title, NOT fixes.empty.
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(
      screen.queryByText('No pending findings. Run an audit to get started.'),
    ).not.toBeInTheDocument();
  });

  it('throws when neither kind nor titleKey is given', () => {
    // Suppress the expected console.error noise from React for this throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderWith(<EmptyState />)).toThrow(
      /EmptyState requires either a known kind or an explicit titleKey/,
    );
    spy.mockRestore();
  });
});
