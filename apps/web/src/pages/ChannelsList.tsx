import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { deleteChannel, humanError, listChannels, type Channel, type ChannelType } from '../api.js';
import { EmptyState, ErrorState } from '../components/states/index.js';
import { localePath } from '../i18n/localePath.js';

export function ChannelsList() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const channels = useQuery({
    queryKey: ['channels', projectId],
    queryFn: () => listChannels(projectId!),
    enabled: !!projectId,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteChannel(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['channels', projectId] }),
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to={localePath('projects')} className="muted tiny">{t('nav.projects')}</Link>
            <span className="muted tiny">/</span>
            <Link to={localePath('projectDashboard', { projectId: projectId! })} className="muted tiny">{projectId?.slice(0, 8)}</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{t('channels.breadcrumb')}</span>
          </div>
          <h1 className="page__title">{t('channels.title')}</h1>
          <p className="page__subtitle">{t('channels.subtitle')}</p>
        </div>
      </div>

      {channels.isLoading && (
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          <div className="skeleton skeleton--row" />
          <div className="skeleton skeleton--row" />
        </div>
      )}

      {channels.isError &&
        (() => {
          const e = humanError(channels.error);
          return (
            <ErrorState
              titleKey={e.key}
              {...(e.params ? { params: e.params } : {})}
              {...(e.retry ? { retry: e.retry } : {})}
              onRetry={() => void channels.refetch()}
            />
          );
        })()}

      {channels.data && channels.data.length === 0 && !channels.isLoading && (
        <EmptyState
          titleKey="channels.empty.title"
          hintKey="channels.empty.hint"
          {...(projectId ? { cta: { to: () => localePath('auditRunner', { projectId: projectId! }), labelKey: 'channels.empty.cta' } } : {})}
        >
          <svg viewBox="0 0 56 56">
            <path d="M10 28h36" />
            <path d="M28 10v36" />
            <circle cx="28" cy="28" r="20" />
          </svg>
        </EmptyState>
      )}

      {channels.data && channels.data.length > 0 && (
        <div className="col" style={{ gap: 'var(--space-3)' }}>
          {channels.data.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              onRemove={() => {
                if (confirm(t('channels.deleteConfirm', { name: c.name }))) remove.mutate(c.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelRow({ channel, onRemove }: { channel: Channel; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <Link
      to={localePath('channelEditor', { channelId: channel.id })}
      className="card card--interactive"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <div className="spread">
        <div>
          <div style={{ fontWeight: 600 }}>{channel.name}</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>{t(`channels.typeDescriptions.${channel.type}`)}</div>
        </div>
        <div className="row">
          <span className="badge badge--neutral">{t(`channels.types.${channel.type}`)}</span>
          {channel.isActive ? (
            <span className="badge badge--success">{t('common.active')}</span>
          ) : (
            <span className="badge badge--neutral">{t('common.paused')}</span>
          )}
        </div>
      </div>
      <div className="spread">
        <span className="tiny mono muted">{channel.id.slice(0, 16)}…</span>
        <span className="tiny tabular muted">{formatDate(channel.createdAt)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn--ghost btn--sm"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        >
          {t('common.delete')}
        </button>
      </div>
    </Link>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}