import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  getGeneration,
  reviewGeneration,
  type Generation,
} from '../api.js';

export function GenerationReview() {
  const { generationId } = useParams<{ generationId: string }>();
  const q = useQuery({
    queryKey: ['generation', generationId],
    queryFn: () => getGeneration(generationId!),
    enabled: !!generationId,
    refetchInterval: (query) => {
      const a = query.state.data as Generation | undefined;
      if (!a) return 2000;
      return a.status === 'queued' || a.status === 'running' ? 2000 : false;
    },
  });
  const [notes, setNotes] = useState('');
  const review = useMutation({
    mutationFn: (action: 'send_to_review' | 'approve' | 'reject') =>
      reviewGeneration(generationId!, action, notes || undefined),
    onSuccess: async () => q.refetch(),
  });

  if (!q.data) return <p>Loading…</p>;
  const g = q.data;
  return (
    <section>
      <h1>Generation {g.id}</h1>
      <p>
        Status: {g.status} · Review state: <strong>{g.reviewState}</strong>
      </p>
      <p>{g.prompt}</p>
      {g.outputMarkdown ? (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <div>
            <h2>Output</h2>
            <ReactMarkdown>{g.outputMarkdown}</ReactMarkdown>
          </div>
          <div>
            <h2>Sources</h2>
            <ul>
              {(g.sources ?? []).map((s, i) => (
                <li key={i}>
                  <strong>{s.id}</strong> ({s.score.toFixed(3)})
                  <pre>{s.excerpt}</pre>
                </li>
              ))}
            </ul>
            {g.usage && (
              <p>
                {g.usage.provider}/{g.usage.model} — {g.usage.promptTokens} +
                {' '}{g.usage.completionTokens} tokens
              </p>
            )}
          </div>
        </div>
      ) : (
        <p>No output yet (job {g.status}).</p>
      )}
      <h3>Review</h3>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes"
        rows={3}
        style={{ width: '100%' }}
      />
      <div>
        <button onClick={() => review.mutate('send_to_review')} disabled={g.reviewState !== 'draft'}>
          Send to review
        </button>
        <button onClick={() => review.mutate('approve')} disabled={g.reviewState !== 'in_review'}>
          Approve
        </button>
        <button onClick={() => review.mutate('reject')} disabled={g.reviewState === 'approved'}>
          Reject
        </button>
      </div>
    </section>
  );
}
