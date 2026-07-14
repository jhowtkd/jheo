import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { ExecutiveReportView } from './ExecutiveReportView.js';
import { FilterBar } from '../components/FilterBar.js';
import { FindingList } from '../components/FindingList.js';
import { ScoreCard } from '../components/ScoreCard.js';
import { getAudit, getProject, type Finding } from '../api.js';
import { scoreHistoryFromAudits } from '../lib/scoreHistory.js';
import { localePath } from '../i18n/localePath.js';

export function AuditResults() {
  const { t } = useTranslation();
  const { auditId } = useParams<{ auditId: string }>();
  const [tab, setTab] = useState<'executive' | 'technical'>('executive');
  const q = useQuery({
    queryKey: ['audit', auditId],
    queryFn: () => getAudit(auditId!),
    enabled: !!auditId,
    refetchInterval: (query) => {
      const a = query.state.data as Awaited<ReturnType<typeof getAudit>> | undefined;
      if (!a) return 2000;
      return a.status === 'running' || a.status === 'queued' ? 2000 : false;
    },
  });

  // Pull the project (with its full audit list) so the ScoreCard can show
  // history + vs-last relative to the prior completed audit on the same
  // project. Cheap: /projects/:id is cached and the audit list is small.
  const project = useQuery({
    queryKey: ['project', q.data?.projectId],
    queryFn: () => getProject(q.data!.projectId),
    enabled: Boolean(q.data?.projectId),
  });
  const { history, previousOverall } = scoreHistoryFromAudits(project.data?.audits ?? []);

  if (!q.data) {
    return (
      <div className="page">
        <div className="skeleton skeleton--title" style={{ marginBottom: 'var(--space-3)' }} />
        <div
          className="skeleton skeleton--text"
          style={{ width: '40%', marginBottom: 'var(--space-8)' }}
        />
        <div className="skeleton skeleton--card" />
      </div>
    );
  }
  const a = q.data;
  const isPending = a.status === 'running' || a.status === 'queued';
  const effectiveTab = a.status === 'completed' ? tab : 'technical';
  const findings = a.findings as Finding[];
  const findingsByCategory = groupByCategory(findings);
  const { error: errorCount, warning: warningCount, info: infoCount } = tallySeverities(findings);

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to={localePath('projects')} className="muted tiny">
              {t('nav.projects')}
            </Link>
            <span className="muted tiny">/</span>
            <Link
              to={localePath('projectDashboard', { projectId: a.projectId })}
              className="muted tiny"
            >
              {a.projectId.slice(0, 8)}
            </Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{t('audit.results.breadcrumbAudit')}</span>
          </div>
          <h1 className="page__title">{t('audit.results.title')}</h1>
          <p className="page__subtitle mono tiny">{a.id}</p>
        </div>
        <div className="status-meta">
          <span className={`badge badge--${a.status}`}>{a.status}</span>
          {isPending && <span className="tiny tabular">{t('common.autoRefreshing')}</span>}
        </div>
      </div>

      {a.status === 'completed' && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <FilterBar
            value={tab}
            onChange={setTab}
            options={[
              { value: 'executive', label: t('audit.executive.tabExecutive') },
              { value: 'technical', label: t('audit.executive.tabTechnical') },
            ]}
          />
        </div>
      )}

      {effectiveTab === 'executive' && <ExecutiveReportView auditId={a.id} />}

      {effectiveTab === 'technical' && (
        <>
          {a.score && (
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <ScoreCard
                health={{
                  overall: a.score.overall,
                  byCategory: {
                    seo: a.score.byCategory.seo ?? null,
                    cwv: a.score.byCategory.cwv ?? null,
                    geo: a.score.byCategory.geo ?? null,
                    a11y: a.score.byCategory.a11y ?? null,
                    content: a.score.byCategory.content ?? null,
                  },
                  pagesAudited: a.score.pagesAudited ?? 0,
                  pagesTotal: a.score.pagesTotal ?? 0,
                  pagesWithError: a.score.pagesWithError ?? 0,
                  lastAuditAt: a.finishedAt,
                }}
                history={history}
                previousOverall={previousOverall}
                recomputed={Boolean(a.score.recomputedAt)}
              />
            </div>
          )}

          <div
            className="card"
            style={{
              marginBottom: 'var(--space-6)',
              padding: 'var(--space-5) var(--space-6)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-6)',
              flexWrap: 'wrap',
            }}
          >
            <span
              className="tiny"
              style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}
            >
              {t('audit.results.findings')}
            </span>
            <div className="row" style={{ gap: 'var(--space-5)' }}>
              <span className="row" style={{ gap: 'var(--space-2)' }}>
                <span className="finding__sev sev--error" style={{ paddingTop: 0 }}>
                  {t('audit.results.error')}
                </span>
                <span className="tabular" style={{ fontWeight: 600 }}>
                  {errorCount}
                </span>
              </span>
              <span className="row" style={{ gap: 'var(--space-2)' }}>
                <span className="finding__sev sev--warning" style={{ paddingTop: 0 }}>
                  {t('audit.results.warning')}
                </span>
                <span className="tabular" style={{ fontWeight: 600 }}>
                  {warningCount}
                </span>
              </span>
              <span className="row" style={{ gap: 'var(--space-2)' }}>
                <span className="finding__sev sev--info" style={{ paddingTop: 0 }}>
                  {t('audit.results.info')}
                </span>
                <span className="tabular" style={{ fontWeight: 600 }}>
                  {infoCount}
                </span>
              </span>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <span className="tabular" style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>
                {a.findings.length}
              </span>
              <span className="tiny muted" style={{ marginLeft: 'var(--space-2)' }}>
                {t('audit.results.total')}
              </span>
            </div>
          </div>

          <FindingList findings={findings} byCategory={findingsByCategory} />
        </>
      )}
    </div>
  );
}

function groupByCategory(findings: Finding[]): Record<string, Finding[]> {
  return findings.reduce<Record<string, Finding[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});
}

function tallySeverities(findings: Finding[]) {
  let error = 0;
  let warning = 0;
  let info = 0;
  for (const f of findings) {
    if (f.severity === 'error') error++;
    else if (f.severity === 'warning') warning++;
    else if (f.severity === 'info') info++;
  }
  return { error, warning, info };
}
