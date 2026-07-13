import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { humanError, listAudits, type AuditListItem } from '../api.js';
import { EmptyState, ErrorState } from '../components/states/index.js';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AuditsList() {
  const { t } = useTranslation();
  const audits = useQuery({ queryKey: ['audits'], queryFn: () => listAudits(50) });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('audits.title')}</h1>
          <p className="page__subtitle">{t('audits.subtitle')}</p>
        </div>
      </div>

      {audits.isLoading && (
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          <div className="skeleton skeleton--row" />
          <div className="skeleton skeleton--row" />
          <div className="skeleton skeleton--row" />
        </div>
      )}

      {audits.isError &&
        (() => {
          const e = humanError(audits.error);
          return (
            <ErrorState
              titleKey={e.key}
              {...(e.params ? { params: e.params } : {})}
              {...(e.retry ? { retry: e.retry } : {})}
              onRetry={() => void audits.refetch()}
            />
          );
        })()}

      {audits.data && audits.data.length === 0 && !audits.isLoading && (
        <EmptyState
          titleKey="audits.empty.title"
          hintKey="audits.empty.hint"
          cta={{ to: '/projects', labelKey: 'nav.projects' }}
        />
      )}

      {audits.data && audits.data.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('audits.table.project')}</th>
                <th>{t('audits.table.status')}</th>
                <th style={{ textAlign: 'right' }}>{t('audits.table.score')}</th>
                <th>{t('audits.table.started')}</th>
                <th>{t('audits.table.finished')}</th>
              </tr>
            </thead>
            <tbody>
              {audits.data.map((a: AuditListItem) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/projects/${a.projectId}`} style={{ fontWeight: 500 }}>
                      {a.projectName}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge badge--${a.status}`}>{a.status}</span>
                  </td>
                  <td className="tabular" style={{ textAlign: 'right', fontWeight: 600 }}>
                    {a.score?.overall ?? '—'}
                  </td>
                  <td className="tiny tabular muted">{formatDate(a.startedAt)}</td>
                  <td className="tiny tabular muted">{formatDate(a.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
