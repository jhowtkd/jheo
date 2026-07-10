import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { createQueryClientWrapper } from '../../../test/queryClientWrapper';
import { ProjectsList } from '../ProjectsList.js';

// Mock the ../../api module (src/api). humanError must stay the real
// function so the test actually exercises the humanError → ErrorState
// render path, so we re-export it via importOriginal. listProjects returns
// empty by default; createProject is overridden per-test.
vi.mock('../../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api.js')>();
  return {
    ...actual,
    listProjects: vi.fn(async () => []),
    createProject: vi.fn(),
  };
});

// Compose the QueryClient wrapper (ProjectsList uses useQuery/useMutation)
// with a MemoryRouter (the empty-state <Link> CTA and useNavigate need
// Router context).
function renderWith(node: ReactNode) {
  const QueryWrapper = createQueryClientWrapper();
  return render(<MemoryRouter><QueryWrapper>{node}</QueryWrapper></MemoryRouter>);
}

describe('ProjectsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders ErrorState with translated text + retry when createProject rejects', async () => {
    const { createProject } = await import('../../api.js');
    // "Failed to load health: 500" matches humanError's STATUS_RE →
    // { key: 'errors.server', params: { status: 500 }, retry: true } (500>=500).
    // This deterministically exercises the humanError → ErrorState path AND
    // yields retry: true so the retry button renders.
    (createProject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Failed to load health: 500'),
    );

    renderWith(<ProjectsList />);

    // Fill the create form and submit so the mutation runs + rejects.
    const nameInput = screen.getByPlaceholderText(/Marketing da Acme/i);
    const urlInput = screen.getByPlaceholderText('https://acme.com.br');
    fireEvent.change(nameInput, { target: { value: 'Acme' } });
    fireEvent.change(urlInput, { target: { value: 'https://acme.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar projeto/i }));

    // errors.server pt-BR with {{status}}=500:
    // "O servidor retornou um erro (500). Tente novamente."
    await waitFor(() => {
      expect(screen.getByText(/O servidor retornou um erro \(500\)/)).toBeInTheDocument();
    });
    // retry flag was set (500 >= 500) → the ErrorState retry button renders.
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('points the empty-state CTA at /projects#new-project-name when the list is empty', async () => {
    const { listProjects } = await import('../../api.js');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    renderWith(<ProjectsList />);

    // Wait for the empty state to render (after the list query resolves).
    const link = await screen.findByRole('link', { name: 'Criar projeto' });
    expect(link).toHaveAttribute('href', '/projects#new-project-name');
  });
});
