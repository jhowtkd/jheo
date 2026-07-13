import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { getProject, listProjects, type Audit, type Project } from '../api.js';
import { EmptyState, ErrorState } from '../components/states/index.js';
import { localePath } from '../i18n/localePath.js';

type ReportRow = Audit & {
  projectName: string;
  projectRootUrl: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LoadingSkeleton() {
  return (
    <div className="col" style={{ gap: 'var(--space-3)' }}>
      <div className="skeleton skeleton--card" />
      <div className="skeleton skeleton--card" />
    </div>
  );
}

async function loadReportRows(projects: Project[], projectId: string | null): Promise<ReportRow[]> {
  const targets = projectId ? projects.filter((p) => p.id === projectId) : projects;
  if (targets.length === 0) return [];
  const details = await Promise.all(targets.map((p) => getProject(p.id)));
  const rows: ReportRow[] = [];
  for (const detail of details) {
    for (const audit of detail.audits) {
      if (audit.status !== 'completed') continue;
      rows.push({
        ...audit,
        projectName: detail.name,
        projectRootUrl: detail.rootUrl,
      });
    }
  }
  rows.sort((a, b) => {
    const aAt = a.finishedAt ?? a.startedAt ?? '';
    const bAt = b.finishedAt ?? b.startedAt ?? '';
    return bAt.localeCompare(aAt);
  });
  return rows;
}

export function ReportsList() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('projectId');

  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects });
  const reports = useQuery({
    queryKey: ['reports', projectId ?? 'all', projects.data?.map((p) => p.id).join(',') ?? ''],
    queryFn: () => loadReportRows(projects.data ?? [], projectId),
    enabled: Boolean(projects.data),
  });

  const filterProject = useMemo(
    () => projects.data?.find((p) => p.id === projectId) ?? null,
    [projects.data, projectId],
  );

  function setProjectFilter(next: string) {
    const nextParams = new URLSearchParams(params);
    if (next) nextParams.set('projectId', next);
    else nextParams.delete('projectId');
    setParams(nextParams, { replace: true });
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('reports.title')}</h1>
          <p className="page__subtitle">{t('reports.subtitle')}</p>
        </div>
      </div>

      {projects.isLoading && <LoadingSkeleton />}

      {projects.isError && (
        <ErrorState titleKey="reports.failedToLoad" retry onRetry={() => void projects.refetch()} />
      )}

      {projects.data && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <label className="tiny" htmlFor="reports-project-filter" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
            {t('reports.filterProject')}
          </label>
          <select
            id="reports-project-filter"
            className="input"
            value={projectId ?? ''}
            onChange={(e) => setProjectFilter(e.target.value)}
            style={{ maxWidth: 360 }}
          >
            <option value="">{t('reports.allProjects')}</option>
            {projects.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {filterProject && (
            <p className="tiny muted" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
              {t('reports.filteredBy', { name: filterProject.name })}{' '}
              <Link to={localePath('projectDashboard', { projectId: filterProject.id })}>{t('reports.openProject')}</Link>
            </p>
          )}
        </div>
      )}

      {reports.isLoading && projects.data && <LoadingSkeleton />}

      {reports.isError && (
        <ErrorState titleKey="reports.failedToLoad" retry onRetry={() => void reports.refetch()} />
      )}

      {reports.data && reports.data.length === 0 && !reports.isLoading && (
        <EmptyState
          titleKey="reports.empty.title"
          hintKey="reports.empty.hint"
          {...(projectId
            ? { cta: { to: () => localePath('auditRunner', { projectId }), labelKey: 'reports.empty.action' } }
            : { cta: { to: () => localePath('projects'), labelKey: 'reports.empty.actionProjects' } })}
        >
          <svg viewBox="0 0 56 56">
            <rect x="10" y="8" width="36" height="40" rx="3" />
            <path d="M18 18h20" />
            <path d="M18 26h20" />
            <path d="M18 34h12" />
          </svg>
        </EmptyState>
      )}

      {reports.data && reports.data.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('reports.columns.project')}</th>
                <th>{t('reports.columns.finished')}</th>
                <th style={{ textAlign: 'right' }}>{t('reports.columns.score')}</th>
                <th>{t('reports.columns.pages')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.data.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{row.projectName}</div>
                    <div className="tiny muted mono">{row.projectRootUrl}</div>
                  </td>
                  <td className="tiny tabular muted">{formatDate(row.finishedAt ?? row.startedAt)}</td>
                  <td className="tabular" style={{ textAlign: 'right', fontWeight: 600 }}>
                    {row.score?.overall ?? '—'}
                  </td>
                  <td className="tiny tabular muted">
                    {row.score?.pagesAudited != null
                      ? t('reports.pagesAudited', { count: row.score.pagesAudited })
                      : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={localePath('auditResults', { auditId: row.id })} className="tiny">
                      {t('reports.openReport')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
