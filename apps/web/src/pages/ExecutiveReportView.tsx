import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  executiveReportExportUrl,
  getExecutiveReport,
  humanError,
  type ExecutiveReportResponse,
} from '../api.js';
import { CategoryBarChart } from '../components/reports/CategoryBarChart.js';
import { SeverityChart } from '../components/reports/SeverityChart.js';
import { ErrorState } from '../components/states/index.js';

interface Props {
  auditId: string;
}

const IMPACT_KEY: Record<'high' | 'medium' | 'low', string> = {
  high: 'audit.executive.impactHigh',
  medium: 'audit.executive.impactMedium',
  low: 'audit.executive.impactLow',
};

export function ExecutiveReportView({ auditId }: Props) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['executive-report', auditId],
    queryFn: () => getExecutiveReport(auditId),
    refetchInterval: (query) =>
      query.state.data?.status === 'generating' ? 2000 : false,
  });

  const data = q.data;

  if (!data) {
    // Show a translated error state if the load failed and we have no cached
    // data; otherwise fall through to skeletons during refetches.
    if (q.isError) {
      const e = humanError(q.error);
      return (
        <div className="page">
          <ErrorState
            titleKey={e.key}
            {...(e.params ? { params: e.params } : {})}
            {...(e.retry ? { retry: e.retry } : {})}
            onRetry={() => void q.refetch()}
          />
        </div>
      );
    }
    return (
      <div className="page">
        <div className="skeleton skeleton--title" style={{ marginBottom: 'var(--space-3)' }} />
        <div className="skeleton skeleton--card" />
      </div>
    );
  }

  if (data.status === 'generating') {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <span className="badge badge--running" style={{ marginBottom: 'var(--space-3)' }}>
            {data.status}
          </span>
          <p style={{ margin: 0 }}>{t('audit.executive.generating')}</p>
        </div>
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <span className="badge badge--failed" style={{ marginBottom: 'var(--space-3)' }}>
            {t('audit.executive.failed')}
          </span>
          {data.errorMessage && (
            <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>{data.errorMessage}</p>
          )}
          <button className="btn" onClick={() => q.refetch()}>
            {t('audit.executive.retry')}
          </button>
        </div>
      </div>
    );
  }

  return <ReadyReport auditId={auditId} data={data} />;
}

function ReadyReport({ auditId, data }: { auditId: string; data: ExecutiveReportResponse }) {
  const { t } = useTranslation();
  const { aggregates, narrative } = data;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('audit.executive.sections.summary')}</h1>
          <p className="page__subtitle mono tiny">{aggregates.projectName}</p>
        </div>
        <div className="status-meta">
          <a className="btn" href={executiveReportExportUrl(auditId)} target="_blank" rel="noreferrer">
            {t('audit.executive.exportHtml')}
          </a>
        </div>
      </div>

      {data.generatedAt && (
        <p className="tiny muted" style={{ marginBottom: 'var(--space-4)' }}>
          {t('audit.executive.generatedAt')}: {new Date(data.generatedAt).toLocaleString()}
          {data.model && ` · ${t('audit.executive.model')}: ${data.model}`}
        </p>
      )}

      {narrative && (
        <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>{narrative.executiveSummary}</p>
        </section>
      )}

      <div className="row" style={{ gap: 'var(--space-6)', marginBottom: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <section className="card" style={{ flex: '1 1 320px' }}>
          <h2 className="card__title" style={{ marginBottom: 'var(--space-3)' }}>
            {t('audit.executive.sections.scores')}
          </h2>
          <CategoryBarChart byCategory={aggregates.byCategory} />
          <div className="row" style={{ gap: 'var(--space-5)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
            <Metric label={t('audit.executive.overallScore')} value={String(aggregates.overall)} />
            <Metric label={t('audit.executive.pagesAudited')} value={String(aggregates.pagesAudited)} />
            <Metric label={t('audit.executive.pagesTotal')} value={String(aggregates.pagesTotal)} />
            {aggregates.pagesFailed > 0 && (
              <Metric label={t('audit.executive.pagesFailed')} value={String(aggregates.pagesFailed)} />
            )}
          </div>
        </section>

        <section className="card" style={{ flex: '0 1 220px' }}>
          <h2 className="card__title" style={{ marginBottom: 'var(--space-3)' }}>
            {t('audit.executive.sections.severity')}
          </h2>
          <SeverityChart counts={aggregates.severityCounts} />
          <div className="col" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <SevRow color="var(--danger)" label={t('audit.results.error')} value={aggregates.severityCounts.error} />
            <SevRow color="var(--warning)" label={t('audit.results.warning')} value={aggregates.severityCounts.warning} />
            <SevRow color="var(--info)" label={t('audit.results.info')} value={aggregates.severityCounts.info} />
          </div>
        </section>
      </div>

      {narrative && narrative.topIssues.length > 0 && (
        <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h2 className="card__title" style={{ marginBottom: 'var(--space-4)' }}>
            {t('audit.executive.sections.topIssues')}
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: 'var(--space-2)' }}>{t('audit.executive.sections.topIssues')}</th>
                <th style={{ padding: 'var(--space-2)' }}>{t('audit.executive.affectedPages')}</th>
                <th style={{ padding: 'var(--space-2)' }}>{t('audit.executive.impact')}</th>
              </tr>
            </thead>
            <tbody>
              {narrative.topIssues.map((issue) => (
                <tr key={issue.rule} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 'var(--space-2)' }}>
                    <div style={{ fontWeight: 600 }}>{issue.title}</div>
                    <div className="tiny muted">{issue.businessImpact}</div>
                  </td>
                  <td style={{ padding: 'var(--space-2)' }} className="tabular">{issue.affectedPages}</td>
                  <td style={{ padding: 'var(--space-2)' }}>
                    <span className={`badge badge--${issue.impactLevel === 'high' ? 'danger' : issue.impactLevel === 'medium' ? 'warning' : 'info'}`}>
                      {t(IMPACT_KEY[issue.impactLevel])}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {aggregates.gsc ? (
        <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h2 className="card__title" style={{ marginBottom: 'var(--space-4)' }}>
            {t('audit.executive.sections.gsc')}
          </h2>
          <div className="row" style={{ gap: 'var(--space-6)', flexWrap: 'wrap' }}>
            <Metric label={t('audit.executive.clicks')} value={aggregates.gsc.clicks.toLocaleString()} />
            <Metric label={t('audit.executive.impressions')} value={aggregates.gsc.impressions.toLocaleString()} />
            <Metric label={t('audit.executive.ctr')} value={`${(aggregates.gsc.ctr * 100).toFixed(1)}%`} />
            <Metric label={t('audit.executive.lowCtrQueries')} value={String(aggregates.gsc.lowCtrQueryCount)} />
          </div>
        </section>
      ) : (
        <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h2 className="card__title" style={{ marginBottom: 'var(--space-2)' }}>
            {t('audit.executive.sections.gsc')}
          </h2>
          <p className="muted" style={{ margin: 0 }}>{t('audit.executive.gscEmpty')}</p>
        </section>
      )}

      {narrative && narrative.scenarios.length > 0 && (
        <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h2 className="card__title" style={{ marginBottom: 'var(--space-4)' }}>
            {t('audit.executive.sections.scenarios')}
          </h2>
          <div className="col" style={{ gap: 'var(--space-4)' }}>
            {narrative.scenarios.map((s) => (
              <div key={s.label}>
                <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                  <span style={{ fontWeight: 600 }}>{s.label}</span>
                  <span className="badge badge--neutral">
                    {s.estimatedScoreFrom} → {s.estimatedScoreTo}
                  </span>
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>{s.rationale}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {narrative && narrative.recommendations.length > 0 && (
        <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h2 className="card__title" style={{ marginBottom: 'var(--space-4)' }}>
            {t('audit.executive.sections.recommendations')}
          </h2>
          <ol style={{ margin: 0, paddingLeft: 'var(--space-5)', lineHeight: 1.6 }}>
            {narrative.recommendations.map((rec, i) => (
              <li key={i} style={{ marginBottom: 'var(--space-2)' }}>{rec}</li>
            ))}
          </ol>
        </section>
      )}

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Link to={`/fixes?auditId=${auditId}`} className="btn">
          {t('audit.executive.viewFixes')}
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="col" style={{ gap: 'var(--space-1)' }}>
      <span className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span className="tabular" style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function SevRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="row" style={{ gap: 'var(--space-2)' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span className="tiny">{label}</span>
      <span className="tabular" style={{ fontWeight: 600 }}>{value}</span>
    </span>
  );
}
