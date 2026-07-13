import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  cancelAudit,
  getAuditProgress,
  getPageAuditDetail,
  getProject,
  getProjectHealth,
  getProjectPages,
  humanError,
  listMaterials,
  listChannels,
  listGenerations,
  reAuditPage,
} from '../api.js';
import { ScoreCard } from '../components/ScoreCard.js';
import { FilterBar, type FilterOption } from '../components/FilterBar.js';
import { FindingList } from '../components/FindingList.js';
import { EmptyState, ErrorState } from '../components/states/index.js';
import { setLastProjectId } from '../lib/lastProject.js';
import { scoreHistoryFromAudits } from '../lib/scoreHistory.js';

type FilterValue =
  | 'all'
  | 'not_audited'
  | 'with_error'
  | 'discovered_via:sitemap'
  | 'discovered_via:crawl'
  | 'discovered_via:root';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectDashboard() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [filter, setFilter] = useState<FilterValue>('all');
  const apiFilter = filter === 'all' ? undefined : filter;
  const [openPageAuditId, setOpenPageAuditId] = useState<string | null>(null);
  // { err, pageId } so the error banner can truly re-invoke the failed re-audit
  // instead of only dismissing (the variables/pageId flow up from useMutation).
  const [actionError, setActionError] = useState<{ err: unknown; pageId: string } | null>(null);

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: Boolean(projectId),
  });

  // Persist the last-opened project so global nav gates (Materials/
  // Generations/Channels) can default to it.
  useEffect(() => {
    if (projectId) setLastProjectId(projectId);
  }, [projectId]);

  // Phase 3 T7: live audit progress + cancel — poll only while work is active.
  const lastAudit = project.data?.audits[0];
  const auditLive = lastAudit?.status === 'queued' || lastAudit?.status === 'running';

  const health = useQuery({
    queryKey: ['project-health', projectId],
    queryFn: () => getProjectHealth(projectId!),
    enabled: Boolean(projectId),
    refetchInterval: auditLive ? 5_000 : false,
  });

  const pages = useQuery({
    queryKey: ['project-pages', projectId, apiFilter],
    queryFn: () =>
      getProjectPages(projectId!, apiFilter ? { filter: apiFilter, limit: 200 } : { limit: 200 }),
    enabled: Boolean(projectId),
    refetchInterval: auditLive ? 5_000 : false,
  });

  // Materialized sections from F2/F3 — kept for backward compatibility
  const materials = useQuery({
    queryKey: ['materials', projectId],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
  });
  const channels = useQuery({
    queryKey: ['channels', projectId],
    queryFn: () => listChannels(projectId!),
    enabled: !!projectId,
  });
  const generations = useQuery({
    queryKey: ['generations', projectId],
    queryFn: () => listGenerations(projectId!),
    enabled: !!projectId,
    refetchInterval: (q) => {
      // When the underlying request errors, `state.data` is the parsed error
      // envelope (an object), not the list. Guard with Array.isArray so a
      // transient 5xx doesn't tear the dashboard down.
      const items = Array.isArray(q.state.data) ? q.state.data : [];
      const live = items.some((g) => g.status === 'queued' || g.status === 'running');
      return live ? 5_000 : false;
    },
  });

  const progress = useQuery({
    queryKey: ['audit-progress', lastAudit?.id],
    queryFn: () => getAuditProgress(lastAudit!.id),
    enabled: Boolean(lastAudit) && auditLive,
    staleTime: 0,
    refetchInterval: 2_000,
  });

  const cancel = useMutation({
    mutationFn: (auditId: string) => cancelAudit(auditId),
    onSuccess: () => {
      project.refetch();
      progress.refetch();
    },
  });

  // F5.4 T4: re-audit button + diff modal
  const detail = useQuery({
    queryKey: ['page-audit-detail', openPageAuditId],
    queryFn: () => getPageAuditDetail(openPageAuditId!),
    enabled: Boolean(openPageAuditId),
    refetchInterval: (query) =>
      query.state.data?.status === 'queued' || query.state.data?.status === 'running'
        ? 1_000
        : false,
  });

  const reAudit = useMutation({
    mutationFn: (pageId: string) => reAuditPage(pageId),
    onSuccess: (data) => {
      setOpenPageAuditId(data.pageAuditId);
    },
    onError: (err: Error, pageId: string) => {
      setActionError({ err, pageId });
    },
  });

  if (project.isPending) {
    return (
      <div className="page">
        <div className="skeleton skeleton--title" style={{ marginBottom: 'var(--space-3)' }} />
        <div
          className="skeleton skeleton--text"
          style={{ width: '30%', marginBottom: 'var(--space-8)' }}
        />
        <div className="skeleton skeleton--card" />
      </div>
    );
  }
  if (project.isError) {
    const he = humanError(project.error);
    return (
      <div className="page">
        <ErrorState
          titleKey={he.key}
          {...(he.params ? { params: he.params } : {})}
          {...(he.retry ? { retry: he.retry } : {})}
          onRetry={() => void project.refetch()}
        />
      </div>
    );
  }
  if (!project.data) return <p>{t('common.notFound')}</p>;

  const h = health.data;
  const inFlight = (h?.pagesTotal ?? 0) - (h?.pagesAudited ?? 0) > 0;
  const p = project.data;
  const latest = p.audits[0];
  const actionHE = actionError ? humanError(actionError.err) : null;

  const filterOptions: FilterOption<FilterValue>[] = [
    { value: 'all', label: t('projects.dashboard.filters.all') },
    { value: 'not_audited', label: t('projects.dashboard.filters.notAudited') },
    { value: 'with_error', label: t('projects.dashboard.filters.withError') },
    { value: 'discovered_via:sitemap', label: t('projects.dashboard.filters.sitemap') },
    { value: 'discovered_via:crawl', label: t('projects.dashboard.filters.crawl') },
    { value: 'discovered_via:root', label: t('projects.dashboard.filters.root') },
  ];

  return (
    <div className="page col" style={{ gap: 'var(--space-6)' }}>
      {/* Header */}
      <header className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to="/projects" className="muted tiny">
              {t('nav.projects')}
            </Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{p.name}</span>
          </div>
          <h1 className="page__title">{p.name}</h1>
          <p className="page__subtitle mono">{p.rootUrl}</p>
        </div>
        <Link to={`/projects/${projectId}/audit`} className="btn btn--primary">
          {t('projects.dashboard.runAudit')}
        </Link>
      </header>

      {/* actionError — page-level re-audit failure (no window.alert) */}
      {actionHE && actionError && (
        <ErrorState
          titleKey={actionHE.key}
          {...(actionHE.params ? { params: actionHE.params } : {})}
          retry
          onRetry={() => {
            const pageId = actionError.pageId;
            setActionError(null);
            reAudit.mutate(pageId);
          }}
        />
      )}

      {/* Health card */}
      <ScoreCard
        health={h}
        {...(() => {
          const { history, previousOverall } = scoreHistoryFromAudits(p.audits);
          return {
            history,
            previousOverall,
            recomputed: Boolean(latest?.score?.recomputedAt),
          };
        })()}
      />

      {/* Actions — secondary navigation (does not compete with Run audit) */}
      <nav className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Link to={`/projects/${projectId}/compose`} className="btn btn--secondary btn--sm">
          {t('projects.dashboard.quickLinks.generate')}
        </Link>
        <Link to={`/projects/${projectId}/channels`} className="btn btn--secondary btn--sm">
          {t('projects.dashboard.quickLinks.channels')}
        </Link>
        <Link to={`/projects/${projectId}/materials`} className="btn btn--secondary btn--sm">
          {t('projects.dashboard.quickLinks.materials')}
        </Link>
      </nav>

      {/* Phase 3 T7: Last audit progress + cancel */}
      {lastAudit && (
        <div className="card">
          <h3>{t('projects.dashboard.lastAudit')}</h3>
          <p>
            {t('projects.dashboard.statusLabel')}: <strong>{lastAudit.status}</strong>
          </p>
          {progress.data && (
            <>
              <p>
                {t('projects.dashboard.pagesCompleted', {
                  completed: progress.data.pagesCompleted,
                  total: progress.data.pagesTotal,
                  failed: progress.data.pagesFailed,
                  skipped: progress.data.pagesSkipped,
                })}
              </p>
              {progress.data.currentPages.length > 0 && (
                <p>
                  {t('projects.dashboard.inProgress')}: {progress.data.currentPages.join(', ')}
                </p>
              )}
              <div
                style={{
                  height: '8px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-pill)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${
                      progress.data.pagesTotal
                        ? (progress.data.pagesCompleted / progress.data.pagesTotal) * 100
                        : 0
                    }%`,
                    height: '100%',
                    background: 'var(--accent)',
                    transition: 'width 200ms ease',
                  }}
                />
              </div>
              {progress.data.pagesCompleted >= 2 && lastAudit.startedAt && (() => {
                const elapsedSec = (Date.now() - new Date(lastAudit.startedAt).getTime()) / 1000;
                const pagesPerSec = progress.data.pagesCompleted / elapsedSec;
                if (!isFinite(pagesPerSec) || pagesPerSec <= 0) return null;
                const remaining = Math.max(0, progress.data.pagesTotal - progress.data.pagesCompleted);
                const etaSec = Math.round(remaining / pagesPerSec);
                return (
                  <p className="tiny muted" style={{ marginTop: 'var(--space-2)' }}>
                    {t('projects.dashboard.eta', { seconds: etaSec })}
                  </p>
                );
              })()}
            </>
          )}
          {(lastAudit.status === 'queued' || lastAudit.status === 'running') && (
            <button
              type="button"
              onClick={() => cancel.mutate(lastAudit.id)}
              disabled={cancel.isPending}
              style={{ marginTop: 'var(--space-3)' }}
            >
              {cancel.isPending
                ? t('projects.dashboard.cancelling')
                : t('projects.dashboard.cancelAudit')}
            </button>
          )}
        </div>
      )}

      {/* Filter bar */}
      <FilterBar value={filter} onChange={setFilter} options={filterOptions} />

      {/* Pages — empty state when zero pages and no filter; else the table */}
      {pages.data && pages.data.total === 0 && filter === 'all' ? (
        <EmptyState
          titleKey="projects.dashboard.pagesEmpty.title"
          hintKey="projects.dashboard.pagesEmpty.hint"
          cta={{ to: `/projects/${projectId}/audit`, labelKey: 'projects.dashboard.runAudit' }}
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('projects.dashboard.pagesTable.url')}</th>
                <th>{t('projects.dashboard.pagesTable.source')}</th>
                <th>{t('projects.dashboard.pagesTable.lastAudited')}</th>
                <th>{t('projects.dashboard.pagesTable.score')}</th>
                <th>{t('projects.dashboard.pagesTable.action')}</th>
              </tr>
            </thead>
            <tbody>
              {pages.data?.items.map((page) => (
                <tr key={page.id}>
                  <td>
                    <a href={page.url} target="_blank" rel="noreferrer" className="mono">
                      {page.url}
                    </a>
                  </td>
                  <td>
                    <span className={`tag tag--${page.discoveredVia}`}>{page.discoveredVia}</span>
                  </td>
                  <td>
                    {page.lastAuditedAt ? new Date(page.lastAuditedAt).toLocaleString() : '—'}
                  </td>
                  <td>{page.lastScore ? Math.round(page.lastScore.overall) : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => reAudit.mutate(page.id)}
                      disabled={reAudit.isPending}
                    >
                      {reAudit.isPending
                        ? t('projects.dashboard.pagesTable.queuing')
                        : t('projects.dashboard.pagesTable.reAudit')}
                    </button>
                  </td>
                </tr>
              ))}
              {pages.data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
                    {t('projects.dashboard.pagesTable.noMatch')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* F5.4 T4: re-audit diff modal */}
      {openPageAuditId && detail.data && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenPageAuditId(null)}
        >
          <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal__close"
              onClick={() => setOpenPageAuditId(null)}
              aria-label={t('projects.dashboard.diffModal.close')}
            >
              ×
            </button>
            <h2 style={{ margin: 0, marginBottom: 'var(--space-2)', fontSize: 'var(--fs-lg)' }}>
              {t('projects.dashboard.diffModal.title')}: {detail.data.url}
            </h2>
            <p style={{ color: 'var(--text-muted)', margin: 0, marginBottom: 'var(--space-4)' }}>
              {t('projects.dashboard.statusLabel')}:{' '}
              <strong style={{ color: 'var(--text)' }}>{detail.data.status}</strong>
              {detail.data.score && (
                <>
                  {' '}
                  · {t('projects.dashboard.diffModal.score')}:{' '}
                  <strong style={{ color: 'var(--text)' }}>{detail.data.score.overall}</strong>
                </>
              )}
            </p>
            <FindingList
              findings={
                detail.data.findings as unknown as Parameters<typeof FindingList>[0]['findings']
              }
              fixed={detail.data.fixed}
            />
          </div>
        </div>
      )}

      {/* Sticky footer with audited progress */}
      <footer
        style={{
          position: 'sticky',
          bottom: 0,
          padding: 'var(--space-3)',
          background: 'var(--bg-elevated)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span className="mono">
          {t('projects.dashboard.footerAudited', {
            audited: h?.pagesAudited ?? 0,
            total: h?.pagesTotal ?? 0,
          })}
        </span>
        {inFlight && <span className="spinner" aria-label={t('common.inProgress')} />}
      </footer>

      {/* Secondary — below-the-fold reference material */}
      <div className="dashboard__secondary">
        <p
          className="tiny muted"
          style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
        >
          {t('projects.dashboard.secondary')}
        </p>

        {/* Stat tiles — restored from F1 */}
        <section>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            <StatTile
              label={t('projects.dashboard.stats.audits')}
              value={p.audits.length}
              {...(latest?.status === 'completed' ? { accent: 'success' as const } : {})}
            />
            <StatTile
              label={t('projects.dashboard.stats.materials')}
              value={materials.data?.length ?? '—'}
            />
            <StatTile
              label={t('projects.dashboard.stats.generations')}
              value={generations.data?.length ?? '—'}
            />
            <StatTile
              label={t('projects.dashboard.stats.channels')}
              value={channels.data?.length ?? '—'}
            />
          </div>
        </section>

        {/* Latest audit score — restored from F1 */}
        {latest?.score && (
          <section>
            <div className="spread" style={{ marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>
                {t('projects.dashboard.latestAudit')}
              </h2>
              <Link to={`/audits/${latest.id}`} className="tiny">
                {t('projects.dashboard.openFullReport')}
              </Link>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(200px, auto) 1fr',
                gap: 'var(--space-3)',
                alignItems: 'stretch',
              }}
            >
              <div className="card" style={{ padding: 'var(--space-5)' }}>
                <div
                  className="tiny"
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  {t('projects.dashboard.overall')}
                </div>
                <div
                  className="tabular"
                  style={{
                    fontSize: 'var(--fs-2xl)',
                    fontWeight: 700,
                    letterSpacing: '-0.025em',
                  }}
                >
                  {latest.score.overall}
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 'var(--space-3)',
                }}
              >
                {Object.entries(latest.score.byCategory).map(([k, v]) => (
                  <CategoryScoreCard key={k} label={k} value={v} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Audit history — restored from F1 */}
        {p.audits.length > 0 && (
          <section>
            <div className="spread" style={{ marginBottom: 'var(--space-3)' }}>
              <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>
                {t('projects.dashboard.auditHistory')}
              </h2>
              <Link to={`/reports?projectId=${projectId}`} className="tiny">
                {t('projects.dashboard.viewAllReports')}
              </Link>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('projects.dashboard.historyStatus')}</th>
                    <th>{t('projects.dashboard.historyStarted')}</th>
                    <th style={{ textAlign: 'right' }}>{t('projects.dashboard.overall')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {p.audits.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <span className={`badge badge--${a.status}`}>{a.status}</span>
                      </td>
                      <td className="tiny tabular muted">
                        {a.startedAt ? formatDate(a.startedAt) : '—'}
                      </td>
                      <td className="tabular" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {a.score?.overall ?? '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link to={`/audits/${a.id}`} className="tiny">
                          {t('projects.dashboard.viewLink')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Workspace quick links — preserved from F2/F3 (materials, channels, generations) */}
        <section>
          <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, marginBottom: 'var(--space-3)' }}>
            {t('projects.dashboard.workspace')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            <QuickLink
              to={`/projects/${projectId}/materials`}
              label={t('projects.dashboard.quickLinks.materials')}
              hint={t('projects.dashboard.quickLinks.materialsHint')}
              {...(materials.data ? { count: materials.data.length } : {})}
            />
            <QuickLink
              to={`/projects/${projectId}/compose`}
              label={t('projects.dashboard.quickLinks.generate')}
              hint={t('projects.dashboard.quickLinks.generateHint')}
              {...(generations.data ? { count: generations.data.length } : {})}
            />
            <QuickLink
              to={`/projects/${projectId}/channels`}
              label={t('projects.dashboard.quickLinks.channels')}
              hint={t('projects.dashboard.quickLinks.channelsHint')}
              {...(channels.data ? { count: channels.data.length } : {})}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: 'success';
}) {
  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-4) var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      <span
        className="tiny"
        style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
      >
        {label}
      </span>
      <span
        className="tabular"
        style={{
          fontSize: 'var(--fs-2xl)',
          fontWeight: 700,
          letterSpacing: '-0.025em',
          color: accent === 'success' ? 'var(--accent-bright)' : 'var(--text)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function CategoryScoreCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      <span
        className="tiny"
        style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
      >
        {label}
      </span>
      <span
        className="tabular"
        style={{
          fontSize: 'var(--fs-xl)',
          fontWeight: 700,
          letterSpacing: '-0.025em',
        }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

function QuickLink({
  to,
  label,
  hint,
  count,
}: {
  to: string;
  label: string;
  hint: string;
  count?: number;
}) {
  return (
    <Link
      to={to}
      className="card card--interactive"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <div className="spread">
        <span style={{ fontWeight: 600 }}>{label}</span>
        {count !== undefined && <span className="tabular tiny muted">{count}</span>}
      </div>
      <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>
        {hint}
      </p>
    </Link>
  );
}
