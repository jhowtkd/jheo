import { describe, it, expect } from 'vitest';
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
});
