import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { humanError, runAudit } from '../api.js';
import { ErrorState } from '../components/states/index.js';
import { localePath } from '../i18n/localePath.js';

const SECONDS_PER_PAGE = 8;

export function AuditRunner() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [maxPages, setMaxPages] = useState(50);
  const [sources, setSources] = useState({ root: true, sitemap: true, crawl: true });

  const run = useMutation({
    mutationFn: () =>
      runAudit(projectId!, {
        maxPages,
        sources,
      }),
    onSuccess: async (audit) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['project', projectId] }),
        qc.invalidateQueries({ queryKey: ['audits'] }),
        qc.invalidateQueries({ queryKey: ['project-health', projectId] }),
      ]);
      navigate(localePath('auditResults', { auditId: audit.id }));
    },
  });

  const etaSeconds = maxPages * SECONDS_PER_PAGE;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('audit.runner.title')}</h1>
          <p className="page__subtitle">{t('audit.runner.subtitle')}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div
          className="tiny"
          role="note"
          style={{
            marginTop: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)',
          }}
        >
          {t('audit.runner.cwvBrowserWarning')}
        </div>
        <div className="card__title">{t('audit.runner.readyTitle')}</div>
        <p
          className="tiny muted"
          style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}
        >
          {t('audit.runner.readyHint')}
        </p>

        {/* maxPages */}
        <div className="field" style={{ marginBottom: 'var(--space-4)' }}>
          <label className="field__label">{t('audit.runner.maxPagesLabel')}</label>
          <input
            className="input"
            type="number"
            min="1"
            max="5000"
            value={maxPages}
            onChange={(e) => setMaxPages(Math.max(1, Number(e.target.value) || 1))}
            style={{ maxWidth: 160 }}
          />
          <span className="tiny muted" style={{ marginTop: 4, display: 'block' }}>
            {t('audit.runner.maxPagesHint')}
          </span>
        </div>

        {/* sources */}
        <div className="field" style={{ marginBottom: 'var(--space-4)' }}>
          <label className="field__label">{t('audit.runner.sourcesLabel')}</label>
          <div className="col" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <label className="row" style={{ gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sources.root}
                onChange={(e) => setSources((s) => ({ ...s, root: e.target.checked }))}
              />
              {t('audit.runner.sourceRoot')}
            </label>
            <label className="row" style={{ gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sources.sitemap}
                onChange={(e) => setSources((s) => ({ ...s, sitemap: e.target.checked }))}
              />
              {t('audit.runner.sourceSitemap')}
            </label>
            <label className="row" style={{ gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sources.crawl}
                onChange={(e) => setSources((s) => ({ ...s, crawl: e.target.checked }))}
              />
              {t('audit.runner.sourceCrawl')}
            </label>
          </div>
        </div>

        <p className="tiny muted" style={{ marginBottom: 'var(--space-4)' }}>
          {t('audit.runner.etaHint', { seconds: etaSeconds, perPage: SECONDS_PER_PAGE })}
        </p>

        <button
          className="btn btn--primary btn--lg"
          onClick={() => run.mutate()}
          disabled={run.isPending}
        >
          {run.isPending ? t('audit.runner.starting') : t('audit.runner.start')}
        </button>
        {run.isError &&
          (() => {
            const e = humanError(run.error);
            return (
              <ErrorState
                titleKey={e.key}
                {...(e.params ? { params: e.params } : {})}
                {...(e.retry ? { retry: e.retry } : {})}
                onRetry={() => run.mutate()}
                className="tiny"
              />
            );
          })()}
      </div>
    </div>
  );
}
