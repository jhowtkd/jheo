import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { activateTemplate, listTemplates, type GenerationTemplate } from '../api.js';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TemplatesList() {
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const activate = useMutation({
    mutationFn: (id: string) => activateTemplate(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Templates</h1>
          <p className="page__subtitle">
            Versioned prompt + output schema pairs. Activate one to use as the default for new
            generations.
          </p>
        </div>
      </div>

      {templates.isLoading && (
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          <div className="skeleton skeleton--row" />
          <div className="skeleton skeleton--row" />
        </div>
      )}

      {templates.data && templates.data.length === 0 && !templates.isLoading && (
        <div className="empty">
          <div className="empty__art">
            <svg viewBox="0 0 56 56">
              <rect x="10" y="10" width="36" height="36" rx="3" />
              <path d="M16 18h24" />
              <path d="M16 24h24" />
              <path d="M16 30h16" />
            </svg>
          </div>
          <p className="empty__title">No templates yet</p>
          <p className="empty__hint">
            A template defines the system prompt and output schema the generator fills in. Activate
            one before running a generation.
          </p>
        </div>
      )}

      {templates.data && templates.data.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '36%' }}>Name</th>
                <th>Version</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ width: 200, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {templates.data.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  onActivate={() => activate.mutate(t.id)}
                  isActivating={activate.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TemplateRow({
  template,
  onActivate,
  isActivating,
}: {
  template: GenerationTemplate;
  onActivate: () => void;
  isActivating: boolean;
}) {
  return (
    <tr>
      <td>
        <Link to={`/templates/${template.id}`} style={{ fontWeight: 500 }}>
          {template.name}
        </Link>
        <div className="tiny mono muted">{template.id.slice(0, 12)}…</div>
      </td>
      <td className="tabular">v{template.version}</td>
      <td>
        {template.isActive ? (
          <span className="badge badge--success">active</span>
        ) : (
          <span className="badge badge--neutral">inactive</span>
        )}
      </td>
      <td className="tiny tabular muted">{formatDate(template.createdAt)}</td>
      <td style={{ textAlign: 'right' }}>
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Link to={`/templates/${template.id}`} className="btn btn--ghost btn--sm">
            Edit
          </Link>
          {!template.isActive && (
            <button
              className="btn btn--secondary btn--sm"
              onClick={onActivate}
              disabled={isActivating}
            >
              Activate
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}