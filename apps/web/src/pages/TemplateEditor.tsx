import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { getTemplate } from '../api.js';
import { localePath } from '../i18n/localePath.js';

export function TemplateEditor() {
  const { t } = useTranslation();
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
  const tpl = q.data;
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to={localePath('templates')} className="muted tiny">{t('templates.breadcrumb')}</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{tpl.name}</span>
          </div>
          <h1 className="page__title">{tpl.name} <span className="muted tabular" style={{ fontWeight: 400, fontSize: 'var(--fs-lg)' }}>v{tpl.version}</span></h1>
        </div>
        <span className={`badge badge--${tpl.isActive ? 'success' : 'neutral'}`}>
          {tpl.isActive ? t('common.active') : t('common.inactive')}
        </span>
      </div>

      <div className="col" style={{ gap: 'var(--space-4)' }}>
        <div className="card">
          <div className="card__title">{t('templates.editor.promptTitle')}</div>
          <p className="tiny muted" style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
            {t('templates.editor.promptHint')}
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{tpl.prompt}</pre>
        </div>

        <div className="card">
          <div className="card__title">{t('templates.editor.outputSchemaTitle')}</div>
          <p className="tiny muted" style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
            {t('templates.editor.outputSchemaHint')}
          </p>
          <pre style={{ margin: 0 }}>{JSON.stringify(tpl.outputSchema, null, 2)}</pre>
        </div>

        <div className="card">
          <div className="card__title">{t('templates.editor.metadataTitle')}</div>
          <dl className="fm-table">
            <dt>{t('templates.editor.idLabel')}</dt><dd>{tpl.id}</dd>
            <dt>{t('templates.editor.createdLabel')}</dt><dd>{new Date(tpl.createdAt).toLocaleString()}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}