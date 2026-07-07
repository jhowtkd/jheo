import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { deleteChannel, listChannels, type Channel, type ChannelType } from '../api.js';

const TYPE_LABEL: Record<ChannelType, string> = {
  wordpress: 'WordPress',
  http: 'HTTP',
  agent: 'Agent bundle',
};

const TYPE_DESC: Record<ChannelType, string> = {
  wordpress: 'Publishes as a WP post via the REST API (app-password auth)',
  http: 'POSTs the rendered markdown to any HTTPS endpoint',
  agent: 'Writes a ZIP bundle the user downloads and pushes by hand',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function ChannelsList() {
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
            <Link to="/projects" className="muted tiny">Projects</Link>
            <span className="muted tiny">/</span>
            <Link to={`/projects/${projectId}`} className="muted tiny">{projectId?.slice(0, 8)}</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">channels</span>
          </div>
          <h1 className="page__title">Channels</h1>
          <p className="page__subtitle">
            Where approved generations get published. Each channel type has a different config
            schema (WordPress credentials, an HTTP endpoint, or just an output directory).
          </p>
        </div>
      </div>

      {channels.isLoading && (
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          <div className="skeleton skeleton--row" />
          <div className="skeleton skeleton--row" />
        </div>
      )}

      {channels.data && channels.data.length === 0 && !channels.isLoading && (
        <div className="empty">
          <div className="empty__art">
            <svg viewBox="0 0 56 56">
              <path d="M10 28h36" />
              <path d="M28 10v36" />
              <circle cx="28" cy="28" r="20" />
            </svg>
          </div>
          <p className="empty__title">No channels configured</p>
          <p className="empty__hint">
            Channels are managed per-channel via the API. Use the WordPress / HTTP / Agent
            adapters to route approved generations to a destination.
          </p>
        </div>
      )}

      {channels.data && channels.data.length > 0 && (
        <div className="col" style={{ gap: 'var(--space-3)' }}>
          {channels.data.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              onRemove={() => {
                if (confirm(`Delete channel "${c.name}"?`)) remove.mutate(c.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelRow({ channel, onRemove }: { channel: Channel; onRemove: () => void }) {
  return (
    <Link
      to={`/channels/${channel.id}`}
      className="card card--interactive"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <div className="spread">
        <div>
          <div style={{ fontWeight: 600 }}>{channel.name}</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>{TYPE_DESC[channel.type]}</div>
        </div>
        <div className="row">
          <span className="badge badge--neutral">{TYPE_LABEL[channel.type]}</span>
          {channel.isActive ? (
            <span className="badge badge--success">active</span>
          ) : (
            <span className="badge badge--neutral">paused</span>
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
          Delete
        </button>
      </div>
    </Link>
  );
}