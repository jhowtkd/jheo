import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title and hint keys', () => {
    render(
      <MemoryRouter>
        <EmptyState titleKey="projects.empty.title" hintKey="projects.empty.hint" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Nenhum projeto ainda')).toBeInTheDocument();
    expect(screen.getByText(/Crie seu primeiro projeto/)).toBeInTheDocument();
  });

  it('renders a CTA Link when cta is provided', () => {
    render(
      <MemoryRouter>
        <EmptyState
          titleKey="projects.empty.title"
          cta={{ to: '/projects/new', labelKey: 'projects.empty.action' }}
        />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Criar projeto' });
    expect(link).toHaveAttribute('href', '/projects/new');
  });

  it('renders children (escape hatch for rich art)', () => {
    render(
      <MemoryRouter>
        <EmptyState titleKey="projects.empty.title">
          <svg data-testid="art" viewBox="0 0 56 56" />
        </EmptyState>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('art')).toBeInTheDocument();
  });

  it('omits CTA when not provided', () => {
    render(
      <MemoryRouter>
        <EmptyState titleKey="projects.empty.title" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // --- kind + COPY discriminant (spec-frozen contract) ---

  it('renders a known kind title from COPY (no explicit titleKey)', () => {
    render(
      <MemoryRouter>
        <EmptyState kind="no-findings" />
      </MemoryRouter>,
    );
    // COPY['no-findings'] = { titleKey: 'fixes.empty' } → pt-BR catalog.
    expect(screen.getByText('Nenhum achado pendente. Rode uma auditoria para começar.')).toBeInTheDocument();
  });

  it("renders a known kind's COPY CTA when present", () => {
    render(
      <MemoryRouter>
        <EmptyState kind="no-projects" />
      </MemoryRouter>,
    );
    // COPY['no-projects'] CTA → /projects, labelKey 'fixes.chooseProject.goProjects'.
    const link = screen.getByRole('link', { name: 'Ir para projetos' });
    expect(link).toHaveAttribute('href', '/projects');
  });

  it('lets an explicit titleKey override the kind default', () => {
    render(
      <MemoryRouter>
        <EmptyState kind="no-findings" titleKey="projects.empty.title" />
      </MemoryRouter>,
    );
    // Override wins: projects.empty.title, NOT fixes.empty.
    expect(screen.getByText('Nenhum projeto ainda')).toBeInTheDocument();
    expect(
      screen.queryByText('Nenhum achado pendente. Rode uma auditoria para começar.'),
    ).not.toBeInTheDocument();
  });

  it('throws when neither kind nor titleKey is given', () => {
    // Suppress the expected console.error noise from React for this throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <MemoryRouter>
          <EmptyState />
        </MemoryRouter>,
      ),
    ).toThrow(/EmptyState requires either a known kind or an explicit titleKey/);
    spy.mockRestore();
  });
});
