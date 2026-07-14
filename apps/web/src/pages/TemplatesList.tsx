import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { activateTemplate, humanError, listTemplates, type GenerationTemplate } from '../api.js';
import { EmptyState, ErrorState } from '../components/states/index.js';
import { localePath } from '../i18n/localePath.js';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TemplatesList() {
  const { t } = useTranslation();
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
          <h1 className="page__title">{t('templates.title')}</h1>
          <p className="page__subtitle">{t('templates.subtitle')}</p>
        </div>
      </div>

      {templates.isLoading && (
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          <div className="skeleton skeleton--row" />
          <div className="skeleton skeleton--row" />
        </div>
      )}

      {templates.isError &&
        (() => {
          const e = humanError(templates.error);
          return (
            <ErrorState
              titleKey={e.key}
              {...(e.params ? { params: e.params } : {})}
              {...(e.retry ? { retry: e.retry } : {})}
              onRetry={() => void templates.refetch()}
            />
          );
        })()}

      {templates.data && templates.data.length === 0 && !templates.isLoading && (
        <EmptyState
          titleKey="templates.empty.title"
          hintKey="templates.empty.hint"
          cta={{ to: () => localePath('templates'), labelKey: 'templates.activate' }}
        >
          <svg viewBox="0 0 56 56">
            <rect x="10" y="10" width="36" height="36" rx="3" />
            <path d="M16 18h24" />
            <path d="M16 24h24" />
            <path d="M16 30h16" />
          </svg>
        </EmptyState>
      )}

      {templates.data && templates.data.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '36%' }}>{t('templates.table.name')}</th>
                <th>{t('templates.table.version')}</th>
                <th>{t('templates.table.status')}</th>
                <th>{t('templates.table.created')}</th>
                <th style={{ width: 200, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {templates.data.map((tt) => (
                <TemplateRow
                  key={tt.id}
                  template={tt}
                  onActivate={() => activate.mutate(tt.id)}
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
  const { t } = useTranslation();
  return (
    <tr>
      <td>
        <Link
          to={localePath('templateEditor', { templateId: template.id })}
          style={{ fontWeight: 500 }}
        >
          {template.name}
        </Link>
        <div className="tiny mono muted">{template.id.slice(0, 12)}…</div>
      </td>
      <td className="tabular">v{template.version}</td>
      <td>
        {template.isActive ? (
          <span className="badge badge--success">{t('common.active')}</span>
        ) : (
          <span className="badge badge--neutral">{t('common.inactive')}</span>
        )}
      </td>
      <td className="tiny tabular muted">{formatDate(template.createdAt)}</td>
      <td style={{ textAlign: 'right' }}>
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Link
            to={localePath('templateEditor', { templateId: template.id })}
            className="btn btn--ghost btn--sm"
          >
            {t('common.edit')}
          </Link>
          {!template.isActive && (
            <button
              className="btn btn--secondary btn--sm"
              onClick={onActivate}
              disabled={isActivating}
            >
              {t('templates.activate')}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
