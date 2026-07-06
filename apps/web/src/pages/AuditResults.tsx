import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { FindingList } from '../components/FindingList.js';
import { ScoreCard } from '../components/ScoreCard.js';
import { getAudit, type Finding } from '../api.js';

export function AuditResults() {
  const { auditId } = useParams<{ auditId: string }>();
  const q = useQuery({
    queryKey: ['audit', auditId],
    queryFn: () => getAudit(auditId!),
    enabled: !!auditId,
    refetchInterval: (query) => {
      const a = query.state.data as (Awaited<ReturnType<typeof getAudit>> | undefined);
      if (!a) return 2000;
      return a.status === 'running' || a.status === 'queued' ? 2000 : false;
    },
  });
  if (!q.data) return <p>Loading…</p>;
  return (
    <section>
      <h1>Audit {q.data.id}</h1>
      <p>Status: {q.data.status}</p>
      {q.data.score && (
        <div style={{ display: 'flex', gap: 8 }}>
          <ScoreCard label="Overall" value={q.data.score.overall} />
          {Object.entries(q.data.score.byCategory).map(([k, v]) => (
            <ScoreCard key={k} label={k} value={v} />
          ))}
        </div>
      )}
      <h2>Findings ({q.data.findings.length})</h2>
      <FindingList findings={q.data.findings as Finding[]} />
    </section>
  );
}
