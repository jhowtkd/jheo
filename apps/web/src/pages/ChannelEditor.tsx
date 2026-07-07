import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getChannel, type ChannelType } from '../api.js';

const TYPE_LABEL: Record<ChannelType, string> = {
  wordpress: 'WordPress',
  http: 'HTTP',
  agent: 'Agent bundle',
};

export function ChannelEditor() {
  const { channelId } = useParams<{ channelId: string }>();
  const q = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => getChannel(channelId!),
    enabled: !!channelId,
  });

  if (!q.data) {
    return (
      <div className="page">
        <div className="skeleton skeleton--title" />
      </div>
    );
  }
  const c = q.data;
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to="/projects" className="muted tiny">Projects</Link>
            <span className="muted tiny">/</span>
            <Link to={`/projects/${c.projectId}`} className="muted tiny">{c.projectId.slice(0, 8)}</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">channel</span>
          </div>
          <h1 className="page__title">{c.name}</h1>
          <p className="page__subtitle mono tiny">{c.id}</p>
        </div>
        <div className="row">
          <span className="badge badge--neutral">{TYPE_LABEL[c.type]}</span>
          {c.isActive ? (
            <span className="badge badge--success">active</span>
          ) : (
            <span className="badge badge--neutral">paused</span>
          )}
        </div>
      </div>

      <div className="col" style={{ gap: 'var(--space-4)' }}>
        <div className="card">
          <div className="card__title">Configuration</div>
          <p className="tiny muted" style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
            Encrypted at rest with <code className="mono">JHEO_SECRET_KEY</code>. The decrypted
            shape is documented per channel type.
          </p>
          <pre style={{ margin: 0 }}>{JSON.stringify(c.config, null, 2)}</pre>
        </div>

        <div className="card">
          <div className="card__title">Metadata</div>
          <dl className="fm-table">
            <dt>ID</dt><dd>{c.id}</dd>
            <dt>Project</dt><dd>{c.projectId}</dd>
            <dt>Type</dt><dd>{c.type}</dd>
            <dt>Created</dt><dd>{new Date(c.createdAt).toLocaleString()}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}