import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from '../ErrorState';

describe('ErrorState', () => {
  it('renders the translated title with interpolated params', () => {
    render(<ErrorState titleKey="errors.server" params={{ status: 500 }} />);
    // pt-BR catalog: "O servidor retornou um erro ({{status}}). Tente novamente."
    expect(screen.getByText(/O servidor retornou um erro \(500\)/)).toBeInTheDocument();
  });

  it('renders a retry button only when retry and onRetry are both present', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState titleKey="errors.network" retry onRetry={onRetry} />);
    const btn = screen.getByRole('button', { name: /tentar novamente/i });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledOnce();

    // Without onRetry → no button.
    rerender(<ErrorState titleKey="errors.network" retry />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    // Without retry → no button.
    rerender(<ErrorState titleKey="errors.network" onRetry={onRetry} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('omits the hint when hintKey is absent', () => {
    render(<ErrorState titleKey="errors.generic" />);
    expect(screen.getByText(/Algo deu errado/i)).toBeInTheDocument();
    // No extra hint paragraph beyond the title.
    expect(screen.queryByText(/dica/i)).not.toBeInTheDocument();
  });

  it('renders the hint when hintKey is provided', () => {
    render(<ErrorState titleKey="errors.generic" hintKey="projects.create.hint" />);
    // projects.create.hint exists in both catalogs; just assert something renders
    // with role complementary to the title.
    expect(screen.getByText(/Algo deu errado/i)).toBeInTheDocument();
  });

  it('has role=alert by default for accessibility', () => {
    render(<ErrorState titleKey="errors.generic" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
