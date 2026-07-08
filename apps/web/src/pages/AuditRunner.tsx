import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { runAudit } from '../api.js';

export function AuditRunner() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const run = useMutation({
    mutationFn: () => runAudit(projectId!),
    onSuccess: (audit) => navigate(`/audits/${audit.id}`),
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('audit.runner.title')}</h1>
          <p className="page__subtitle">{t('audit.runner.subtitle')}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card__title">{t('audit.runner.readyTitle')}</div>
        <p className="tiny muted" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {t('audit.runner.readyHint')}
        </p>
        <button
          className="btn btn--primary btn--lg"
          onClick={() => run.mutate()}
          disabled={run.isPending}
        >
          {run.isPending ? t('audit.runner.starting') : t('audit.runner.start')}
        </button>
        {run.isError && (
          <p className="tiny" style={{ color: 'var(--danger)', marginTop: 'var(--space-3)' }}>
            {(run.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}