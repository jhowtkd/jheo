import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getTemplate } from '../api.js';

export function TemplateEditor() {
  const { templateId } = useParams<{ templateId: string }>();
  const q = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => getTemplate(templateId!),
    enabled: !!templateId,
  });

  if (!q.data) {
    return (
      <div className="page">
        <div className="skeleton skeleton--title" />
      </div>
    );
  }
  const t = q.data;
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to="/templates" className="muted tiny">Templates</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{t.name}</span>
          </div>
          <h1 className="page__title">{t.name} <span className="muted tabular" style={{ fontWeight: 400, fontSize: 'var(--fs-lg)' }}>v{t.version}</span></h1>
        </div>
        <span className={`badge badge--${t.isActive ? 'success' : 'neutral'}`}>
          {t.isActive ? 'active' : 'inactive'}
        </span>
      </div>

      <div className="col" style={{ gap: 'var(--space-4)' }}>
        <div className="card">
          <div className="card__title">Prompt template</div>
          <p className="tiny muted" style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
            Use <code className="mono">{`{{userPrompt}}`}</code>, <code className="mono">{`{{sources}}`}</code>,
            and <code className="mono">{`{{outputSchemaDescription}}`}</code> as placeholders.
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{t.prompt}</pre>
        </div>

        <div className="card">
          <div className="card__title">Output schema</div>
          <p className="tiny muted" style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
            The model must emit a JSON object matching this shape, embedded in the post's frontmatter.
          </p>
          <pre style={{ margin: 0 }}>{JSON.stringify(t.outputSchema, null, 2)}</pre>
        </div>

        <div className="card">
          <div className="card__title">Metadata</div>
          <dl className="fm-table">
            <dt>ID</dt><dd>{t.id}</dd>
            <dt>Created</dt><dd>{new Date(t.createdAt).toLocaleString()}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}