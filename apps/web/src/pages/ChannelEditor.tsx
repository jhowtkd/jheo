import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { getChannel } from '../api.js';

export function ChannelEditor() {
  const { t } = useTranslation();
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
            <Link to="/projects" className="muted tiny">{t('nav.projects')}</Link>
            <span className="muted tiny">/</span>
            <Link to={`/projects/${c.projectId}`} className="muted tiny">{c.projectId.slice(0, 8)}</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{t('channels.editor.breadcrumb')}</span>
          </div>
          <h1 className="page__title">{c.name}</h1>
          <p className="page__subtitle mono tiny">{c.id}</p>
        </div>
        <div className="row">
          <span className="badge badge--neutral">{t(`channels.types.${c.type}`)}</span>
          {c.isActive ? (
            <span className="badge badge--success">{t('common.active')}</span>
          ) : (
            <span className="badge badge--neutral">{t('common.paused')}</span>
          )}
        </div>
      </div>

      <div className="col" style={{ gap: 'var(--space-4)' }}>
        <div className="card">
          <div className="card__title">{t('channels.editor.configuration')}</div>
          <p className="tiny muted" style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
            {t('channels.editor.configHint')}
          </p>
          <pre style={{ margin: 0 }}>{JSON.stringify(c.config, null, 2)}</pre>
        </div>

        <div className="card">
          <div className="card__title">{t('channels.editor.metadataTitle')}</div>
          <dl className="fm-table">
            <dt>{t('templates.editor.idLabel')}</dt><dd>{c.id}</dd>
            <dt>{t('channels.editor.projectLabel')}</dt><dd>{c.projectId}</dd>
            <dt>{t('channels.editor.typeLabel')}</dt><dd>{c.type}</dd>
            <dt>{t('channels.editor.createdLabel')}</dt><dd>{new Date(c.createdAt).toLocaleString()}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}