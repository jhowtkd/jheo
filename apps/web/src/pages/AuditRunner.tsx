import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { runAudit } from '../api.js';

export function AuditRunner() {
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
          <h1 className="page__title">Run audit</h1>
          <p className="page__subtitle">
            Launch the audit pipeline (Fastify API + BullMQ worker + Postgres + pgvector) on this
            project. Results appear on the report page once the worker finishes.
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card__title">Ready to audit</div>
        <p className="tiny muted" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          The audit crawls the root URL, then runs 26 plugins across SEO, performance/CWV,
          GEO/AI-readiness, accessibility, and content. Typical runtime: 5–15s.
        </p>
        <button
          className="btn btn--primary btn--lg"
          onClick={() => run.mutate()}
          disabled={run.isPending}
        >
          {run.isPending ? 'Starting…' : 'Start audit'}
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