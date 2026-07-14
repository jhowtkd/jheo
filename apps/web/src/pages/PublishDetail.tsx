import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  cancelPublish,
  getPublish,
  getPublishFiles,
  retryPublish,
  type PublishEvent,
  type PublishStatus,
} from '../api.js';
import { localePath } from '../i18n/localePath.js';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PublishDetail() {
  const { t } = useTranslation();
  const { publishId } = useParams<{ publishId: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['publish', publishId],
    queryFn: () => getPublish(publishId!),
    enabled: !!publishId,
    refetchInterval: (query) => {
      const p = query.state.data;
      if (!p) return 2000;
      return p.status === 'running' || p.status === 'queued' ? 2000 : false;
    },
  });
  const files = useQuery({
    queryKey: ['publish-files', publishId],
    queryFn: () => getPublishFiles(publishId!),
    enabled: !!publishId && q.data?.status === 'completed' && q.data?.channel?.type === 'agent',
  });
  const retry = useMutation({
    mutationFn: () => retryPublish(publishId!),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['publish', publishId] }),
  });
  const cancel = useMutation({
    mutationFn: () => cancelPublish(publishId!),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['publish', publishId] }),
  });

  if (!q.data) {
    return (
      <div className="page">
        <div className="skeleton skeleton--title" />
      </div>
    );
  }
  const p = q.data as typeof q.data & {
    channel?: { type: 'wordpress' | 'http' | 'agent'; name: string };
    events?: PublishEvent[];
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to={localePath('projects')} className="muted tiny">
              {t('nav.projects')}
            </Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{t('publish.breadcrumb')}</span>
          </div>
          <h1 className="page__title">{t('publish.title')}</h1>
          <p className="page__subtitle mono tiny">{p.id}</p>
        </div>
        <div className="status-meta">
          <span className={`badge badge--${p.status}`}>{p.status}</span>
          <span className="tiny tabular muted">
            {t('publish.fields.attempts', { count: p.attempts })}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="spread" style={{ marginBottom: 'var(--space-2)' }}>
          <div className="card__title">{t('projects.dashboard.statusLabel')}</div>
          <span className="tiny muted">{t(`publish.status.${p.status as PublishStatus}`)}</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-4)',
            marginTop: 'var(--space-4)',
          }}
        >
          <div>
            <div className="tiny muted">{t('publish.fields.generation')}</div>
            <Link
              to={localePath('generationReview', { generationId: p.generationId })}
              className="mono tiny"
            >
              {p.generationId.slice(0, 12)}…
            </Link>
          </div>
          <div>
            <div className="tiny muted">{t('publish.fields.channel')}</div>
            <Link
              to={localePath('channelEditor', { channelId: p.channelId })}
              className="mono tiny"
            >
              {p.channelId.slice(0, 12)}…
            </Link>
          </div>
          <div>
            <div className="tiny muted">{t('publish.fields.started')}</div>
            <span className="tiny tabular">{formatDate(p.startedAt)}</span>
          </div>
          <div>
            <div className="tiny muted">{t('publish.fields.finished')}</div>
            <span className="tiny tabular">{formatDate(p.finishedAt)}</span>
          </div>
          {p.externalUrl && (
            <div>
              <div className="tiny muted">{t('publish.fields.external')}</div>
              <a href={p.externalUrl} target="_blank" rel="noreferrer" className="tiny">
                {p.externalUrl} ↗
              </a>
            </div>
          )}
        </div>
        {p.lastError && (
          <div
            style={{
              marginTop: 'var(--space-4)',
              padding: 'var(--space-3)',
              background: 'rgba(239,68,68,0.08)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            <div
              className="tiny"
              style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}
            >
              {t('publish.fields.lastError')}
            </div>
            <code className="mono tiny" style={{ color: 'var(--text-dim)' }}>
              {p.lastError}
            </code>
          </div>
        )}
        <div className="row" style={{ marginTop: 'var(--space-5)', gap: 'var(--space-2)' }}>
          {(p.status === 'failed' || p.status === 'cancelled') && (
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => retry.mutate()}
              disabled={retry.isPending}
            >
              {retry.isPending ? t('publish.actions.retrying') : t('publish.actions.retry')}
            </button>
          )}
          {(p.status === 'queued' || p.status === 'running') && (
            <button
              className="btn btn--danger btn--sm"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? t('publish.actions.cancelling') : t('publish.actions.cancel')}
            </button>
          )}
          {p.channel?.type === 'agent' && p.status === 'completed' && (
            <Link
              to={localePath('agentBundle', { publishId: p.id })}
              className="btn btn--primary btn--sm"
            >
              {t('publish.actions.openBundle')}
            </Link>
          )}
        </div>
      </div>

      {p.events && p.events.length > 0 && (
        <div className="card">
          <div className="card__title">{t('publish.auditTrail')}</div>
          <p
            className="tiny muted"
            style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-4)' }}
          >
            {t('publish.auditTrailHint', { count: p.events.length })}
          </p>
          <div className="col" style={{ gap: 'var(--space-3)' }}>
            {p.events.map((e) => (
              <div key={e.id} className="row" style={{ gap: 'var(--space-3)' }}>
                <span className="tiny tabular muted" style={{ minWidth: 120 }}>
                  {formatDate(e.createdAt)}
                </span>
                <span
                  className="row"
                  style={{ gap: 'var(--space-1)', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                >
                  {e.fromStatus && (
                    <>
                      <span className="badge badge--neutral">{e.fromStatus}</span>
                      <span className="muted">→</span>
                    </>
                  )}
                  <span className={`badge badge--${e.toStatus}`}>{e.toStatus}</span>
                </span>
                {e.message && <span className="tiny muted">{e.message}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
