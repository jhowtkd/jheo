import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  cancelPublish,
  createPublishes,
  listChannels,
  listPublishes,
  retryPublish,
  type Channel,
  type Publish,
} from '../api.js';

interface Props {
  generationId: string;
  projectId: string;
  reviewState: string;
}

export function PublishActions({ generationId, projectId, reviewState }: Props) {
  const qc = useQueryClient();
  const channels = useQuery({ queryKey: ['channels', projectId], queryFn: () => listChannels(projectId) });
  const publishes = useQuery({
    queryKey: ['publishes', generationId],
    queryFn: () => listPublishes(generationId),
    enabled: !!generationId,
    refetchInterval: 2000,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const publish = useMutation({
    mutationFn: () => createPublishes(generationId, selected),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['publishes', generationId] });
      setSelected([]);
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelPublish(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['publishes', generationId] }),
  });
  const retry = useMutation({
    mutationFn: (id: string) => retryPublish(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['publishes', generationId] }),
  });

  const activeChannels = channels.data?.filter((c: Channel) => c.isActive) ?? [];

  return (
    <section>
      <h3>Publish</h3>
      {reviewState === 'approved' && (
        <>
          <p>Select channels:</p>
          <ul>
            {activeChannels.map((c: Channel) => (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                      )
                    }
                  />
                  {c.name} ({c.type})
                </label>
              </li>
            ))}
          </ul>
          <button onClick={() => publish.mutate()} disabled={selected.length === 0}>
            Publish to {selected.length} channel(s)
          </button>
        </>
      )}
      <table>
        <thead>
          <tr><th>Channel</th><th>Status</th><th>External</th><th>Action</th></tr>
        </thead>
        <tbody>
          {publishes.data?.map((p: Publish) => {
            const ch = channels.data?.find((c: Channel) => c.id === p.channelId);
            return (
              <tr key={p.id}>
                <td>{ch?.name ?? p.channelId}</td>
                <td>{p.status}{p.status === 'queued' && p.attempts > 0 ? ` (retry ${p.attempts})` : ''}</td>
                <td>
                  {p.externalUrl ? (
                    <a href={p.externalUrl} target="_blank" rel="noreferrer">link</a>
                  ) : (
                    p.lastError ? <code>{p.lastError}</code> : '—'
                  )}
                  {p.channelId && <Link to={`/publishes/${p.id}`}> detail</Link>}
                </td>
                <td>
                  {(p.status === 'queued' || p.status === 'running') && (
                    <button onClick={() => cancel.mutate(p.id)}>Cancel</button>
                  )}
                  {(p.status === 'failed' || p.status === 'cancelled') && (
                    <button onClick={() => retry.mutate(p.id)}>Retry</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}