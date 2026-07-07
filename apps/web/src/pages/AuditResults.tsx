import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { FindingList } from '../components/FindingList.js';
import { ScoreCard } from '../components/ScoreCard.js';
import { getAudit, type Finding, type ProjectHealth } from '../api.js';

export function AuditResults() {
  const { auditId } = useParams<{ auditId: string }>();
  const q = useQuery({
    queryKey: ['audit', auditId],
    queryFn: () => getAudit(auditId!),
    enabled: !!auditId,
    refetchInterval: (query) => {
      const a = query.state.data as (Awaited<ReturnType<typeof getAudit>> | undefined);
      if (!a) return 2000;
      return a.status === 'running' || a.status === 'queued' ? 2000 : false;
    },
  });

  if (!q.data) {
    return (
      <div className="page">
        <div className="skeleton skeleton--title" style={{ marginBottom: 'var(--space-3)' }} />
        <div className="skeleton skeleton--text" style={{ width: '40%', marginBottom: 'var(--space-8)' }} />
        <div className="skeleton skeleton--card" />
      </div>
    );
  }
  const a = q.data;
  const isPending = a.status === 'running' || a.status === 'queued';
  const findingsByCategory = groupByCategory(a.findings as Finding[]);
  const errorCount = (a.findings as Finding[]).filter((f) => f.severity === 'error').length;
  const warningCount = (a.findings as Finding[]).filter((f) => f.severity === 'warning').length;
  const infoCount = (a.findings as Finding[]).filter((f) => f.severity === 'info').length;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to="/projects" className="muted tiny">Projects</Link>
            <span className="muted tiny">/</span>
            <Link to={`/projects/${a.projectId}`} className="muted tiny">
              {a.projectId.slice(0, 8)}
            </Link>
            <span className="muted tiny">/</span>
            <span className="tiny">audit</span>
          </div>
          <h1 className="page__title">Audit report</h1>
          <p className="page__subtitle mono tiny">{a.id}</p>
        </div>
        <div className="status-meta">
          <span className={`badge badge--${a.status}`}>{a.status}</span>
          {isPending && <span className="tiny tabular">auto-refreshing · 2s</span>}
        </div>
      </div>

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
              pagesTotal: 0,
              pagesWithError: 0,
              lastAuditAt: null,
            }}
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
        <span className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
          Findings
        </span>
        <div className="row" style={{ gap: 'var(--space-5)' }}>
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <span className="finding__sev sev--error" style={{ paddingTop: 0 }}>error</span>
            <span className="tabular" style={{ fontWeight: 600 }}>{errorCount}</span>
          </span>
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <span className="finding__sev sev--warning" style={{ paddingTop: 0 }}>warning</span>
            <span className="tabular" style={{ fontWeight: 600 }}>{warningCount}</span>
          </span>
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <span className="finding__sev sev--info" style={{ paddingTop: 0 }}>info</span>
            <span className="tabular" style={{ fontWeight: 600 }}>{infoCount}</span>
          </span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span className="tabular" style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>
            {a.findings.length}
          </span>
          <span className="tiny muted" style={{ marginLeft: 'var(--space-2)' }}>total</span>
        </div>
      </div>

      <FindingList findings={a.findings as Finding[]} byCategory={findingsByCategory} />
    </div>
  );
}

function groupByCategory(findings: Finding[]): Record<string, Finding[]> {
  return findings.reduce<Record<string, Finding[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});
}