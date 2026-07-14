import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { getPublishFiles } from '../api.js';
import { localePath } from '../i18n/localePath.js';

export function AgentBundleView() {
  const { t } = useTranslation();
  const { publishId } = useParams<{ publishId: string }>();
  const q = useQuery({
    queryKey: ['publish-files', publishId],
    queryFn: () => getPublishFiles(publishId!),
    enabled: !!publishId,
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link
              to={localePath('publishDetail', { publishId: publishId! })}
              className="muted tiny"
            >
              {t('publish.title')}
            </Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{t('publish.bundle.breadcrumb')}</span>
          </div>
          <h1 className="page__title">{t('publish.bundle.title')}</h1>
          <p className="page__subtitle">{t('publish.bundle.subtitle')}</p>
        </div>
      </div>

      {q.isLoading && <div className="skeleton skeleton--card" />}

      {q.data && q.data.files.length === 0 && (
        <div className="empty">
          <p className="empty__title">{t('publish.bundle.noFiles.title')}</p>
          <p className="empty__hint">{t('publish.bundle.noFiles.hint')}</p>
        </div>
      )}

      {q.data && q.data.files.length > 0 && (
        <div className="col" style={{ gap: 'var(--space-3)' }}>
          <div className="card">
            <div className="card__title">{t('publish.bundle.directoryTitle')}</div>
            <code className="mono tiny muted">{q.data.dir}</code>
          </div>
          {q.data.files.map((f) => (
            <div key={f.name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ fontWeight: 500, fontSize: 'var(--fs-sm)' }}>{f.name}</span>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 'var(--space-4)',
                  borderRadius: 0,
                  border: 'none',
                  maxHeight: 360,
                  overflow: 'auto',
                }}
              >
                {f.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
