import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { getGeneration, reviewGeneration, type Generation } from '../api.js';
import { PublishActions } from '../components/PublishActions.js';
import { useDataTranslations } from '../i18n/useDataTranslations';
import type { SupportedLocale } from '../i18n';
import { localePath } from '../i18n/localePath.js';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GenerationReview() {
  const { t } = useTranslation();
  const { generationId } = useParams<{ generationId: string }>();
  const q = useQuery({
    queryKey: ['generation', generationId],
    queryFn: () => getGeneration(generationId!),
    enabled: !!generationId,
    refetchInterval: (query) => {
      const a = query.state.data as Generation | undefined;
      if (!a) return 2000;
      return a.status === 'queued' || a.status === 'running' ? 2000 : false;
    },
  });
  const [notes, setNotes] = useState('');
  const review = useMutation({
    mutationFn: (action: 'send_to_review' | 'approve' | 'reject') =>
      reviewGeneration(generationId!, action, notes || undefined),
    onSuccess: async () => q.refetch(),
  });

  if (!q.data) {
    return (
      <div className="page">
        <div className="skeleton skeleton--title" style={{ marginBottom: 'var(--space-3)' }} />
        <div className="skeleton skeleton--card" style={{ height: 200 }} />
      </div>
    );
  }
  const g = q.data;
  const fm = (g.outputFrontMatter ?? {}) as Record<string, unknown>;
  const title =
    (fm.title as string) || t('generation.review.titleFallback', { id: g.id.slice(0, 8) });

  const { translated: translatedBody, error: bodyError } = useDataTranslations({
    texts: g.outputMarkdown ? [g.outputMarkdown] : [],
    sourceLocale: (g.locale as SupportedLocale) ?? 'en',
    context: 'generation',
  });
  const renderedBody = g.outputMarkdown
    ? (translatedBody.get(g.outputMarkdown) ?? g.outputMarkdown)
    : null;

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
              to={localePath('projectDashboard', { projectId: g.projectId })}
              className="muted tiny"
            >
              {g.projectId.slice(0, 8)}
            </Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{t('generation.review.breadcrumb')}</span>
          </div>
          <h1 className="page__title">{title}</h1>
          <p className="page__subtitle">{g.prompt}</p>
        </div>
        <div className="status-meta">
          <span className={`badge badge--${g.status}`}>{g.status}</span>
          <span className="badge badge--neutral">review · {g.reviewState}</span>
        </div>
      </div>

      {!g.outputMarkdown && (
        <div className="empty">
          <div className="empty__art">
            <svg viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="20" />
              <path d="M28 16v12l8 4" />
            </svg>
          </div>
          <p className="empty__title">{t('generation.review.progressTitle')}</p>
          <p className="empty__hint">{t('generation.review.progressHint', { status: g.status })}</p>
        </div>
      )}

      {g.outputMarkdown && (
        <div className="gen-grid">
          <article className="gen-grid__body">
            <ReactMarkdown>{renderedBody ?? ''}</ReactMarkdown>
            {bodyError &&
              (() => {
                const label = t(`errors.${bodyError}`, {
                  defaultValue: t('topbar.translationUnavailable'),
                });
                return (
                  <span className="translation-unavailable" aria-label={label} title={label}>
                    {' '}
                    ↻
                  </span>
                );
              })()}
          </article>

          <aside className="col">
            <div className="card">
              <div className="card__title">{t('generation.review.frontmatter')}</div>
              <dl className="fm-table">
                {Object.entries(fm).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {g.sources && g.sources.length > 0 && (
              <div className="card">
                <div className="card__title">{t('generation.review.sources')}</div>
                <div className="col" style={{ gap: 0 }}>
                  {g.sources.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        padding: i > 0 ? 'var(--space-3) 0 0' : 0,
                        borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <div className="spread">
                        <span className="mono tiny muted">{s.id.slice(0, 12)}…</span>
                        <span className="tiny tabular" style={{ color: 'var(--accent-bright)' }}>
                          {t('generation.review.score')} {s.score.toFixed(3)}
                        </span>
                      </div>
                      <p className="tiny muted" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>
                        {s.excerpt}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {g.usage && (
              <div className="card">
                <div className="card__title">{t('generation.review.usage')}</div>
                <dl className="fm-table">
                  <dt>{t('generation.review.providerModel')}</dt>
                  <dd>
                    {g.usage.provider}/{g.usage.model}
                  </dd>
                  <dt>{t('generation.review.promptTokens')}</dt>
                  <dd className="tabular">{g.usage.promptTokens.toLocaleString()}</dd>
                  <dt>{t('generation.review.completionTokens')}</dt>
                  <dd className="tabular">{g.usage.completionTokens.toLocaleString()}</dd>
                  <dt>{t('generation.review.started')}</dt>
                  <dd>{formatDate(g.startedAt)}</dd>
                  <dt>{t('generation.review.finished')}</dt>
                  <dd>{formatDate(g.finishedAt)}</dd>
                </dl>
              </div>
            )}

            <div className="card">
              <div className="card__title">{t('generation.review.review')}</div>
              <textarea
                className="textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('generation.review.reviewNotes')}
                rows={3}
                style={{ marginBottom: 'var(--space-3)' }}
              />
              <div className="actions">
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => review.mutate('send_to_review')}
                  disabled={g.reviewState !== 'draft' || review.isPending}
                >
                  {t('generation.review.sendToReview')}
                </button>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => review.mutate('approve')}
                  disabled={g.reviewState !== 'in_review' || review.isPending}
                >
                  {t('generation.review.approve')}
                </button>
                <button
                  className="btn btn--danger btn--sm"
                  onClick={() => review.mutate('reject')}
                  disabled={g.reviewState === 'approved' || review.isPending}
                >
                  {t('generation.review.reject')}
                </button>
              </div>
              <div style={{ marginTop: 'var(--space-4)' }}>
                <PublishActions
                  generationId={generationId!}
                  projectId={g.projectId}
                  reviewState={g.reviewState}
                />
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
