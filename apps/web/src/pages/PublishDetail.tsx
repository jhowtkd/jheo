import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import {
  cancelPublish,
  getPublish,
  getPublishFiles,
  retryPublish,
} from '../api.js';

export function PublishDetail() {
  const { publishId } = useParams<{ publishId: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['publish', publishId],
    queryFn: () => getPublish(publishId!),
    enabled: !!publishId,
  });
  const bundle = useQuery({
    queryKey: ['publish-bundle', publishId],
    queryFn: () => getPublishFiles(publishId!),
    enabled: !!publishId,
    retry: false,
  });
  const retry = useMutation({
    mutationFn: (id: string) => retryPublish(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['publish', publishId] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelPublish(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['publish', publishId] });
    },
  });
  if (!q.data) return <p>Loading…</p>;
  const p = q.data;
  return (
    <section>
      <h1>Publish {p.id}</h1>
      <p>
        Status: {p.status} (attempts: {p.attempts})
      </p>
      {p.externalUrl && (
        <p>
          External:{' '}
          <a href={p.externalUrl} target="_blank" rel="noreferrer">
            {p.externalUrl}
          </a>
        </p>
      )}
      {p.lastError && (
        <p>
          Last error: <code>{p.lastError}</code>
        </p>
      )}
      <pre>{JSON.stringify(p.response, null, 2)}</pre>
      <p>
        <button onClick={() => retry.mutate(p.id)} disabled={retry.isPending}>
          Retry
        </button>{' '}
        <button onClick={() => cancel.mutate(p.id)} disabled={cancel.isPending}>
          Cancel
        </button>
      </p>
      {p.status === 'completed' && bundle.data && (
        <p>
          <Link to={`/publishes/${p.id}/bundle`}>View bundle</Link>{' '}
          <a href={`/api/publishes/${p.id}/bundle`} download>
            Download zip
          </a>
        </p>
      )}
    </section>
  );
}
