import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { runAudit } from '../api.js';

export function AuditRunner() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => runAudit(projectId!),
    onSuccess: (audit) => navigate(`/audits/${audit.id}`),
  });
  return (
    <section>
      <h1>Run audit</h1>
      <button onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending ? 'Starting…' : 'Start'}
      </button>
      {m.error && <p style={{ color: 'red' }}>Failed to enqueue audit.</p>}
    </section>
  );
}
