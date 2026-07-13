import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const qc = useQueryClient();
  const channels = useQuery({ queryKey: ['channels', projectId], queryFn: () => listChannels(projectId) });
  const publishes = useQuery({
    queryKey: ['publishes', generationId],
    queryFn: () => listPublishes(generationId),
    enabled: !!generationId,
    refetchInterval: 2000,
  });
  // Set for O(1) membership in the checkbox. Converting back to an array
  // only at submit time keeps the mutation contract unchanged.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const publish = useMutation({
    mutationFn: () => createPublishes(generationId, [...selected]),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['publishes', generationId] });
      setSelected(new Set());
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

  // Memoise the derived data so the 2s polling refetch doesn't churn the
  // identity of activeChannels / channelById every tick — that re-renders
  // every row in the table for no reason.
  const { activeChannels, channelById } = useMemo(() => {
    const list = channels.data?.filter((c: Channel) => c.isActive) ?? [];
    const byId = new Map<string, Channel>();
    for (const c of channels.data ?? []) byId.set(c.id, c);
    return { activeChannels: list, channelById: byId };
  }, [channels.data]);

  return (
    <section>
      <h3>{t('publish.actionsPanel.title')}</h3>
      {reviewState !== 'approved' && (
        <p className="tiny muted" role="status">
          {t('publish.actionsPanel.needsApproval')}
        </p>
      )}
      {reviewState === 'approved' && (
        <>
          <p>{t('publish.actionsPanel.selectChannels')}</p>
          {activeChannels.length === 0 ? (
            <p className="tiny muted">
              {t('publish.actionsPanel.noChannels')}{' '}
              <Link to={`/projects/${projectId}/channels`}>{t('publish.actionsPanel.createChannel')}</Link>
            </p>
          ) : (
            <>
              <ul>
                {activeChannels.map((c) => (
                  <li key={c.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={(e) => toggle(c.id, e.target.checked)}
                      />
                      {c.name} ({c.type})
                    </label>
                  </li>
                ))}
              </ul>
              <button onClick={() => publish.mutate()} disabled={selected.size === 0}>
                {t('publish.actionsPanel.publishTo', { count: selected.size })}
              </button>
            </>
          )}
        </>
      )}
      <table>
        <thead>
          <tr>
            <th>{t('publish.actionsPanel.tableChannel')}</th>
            <th>{t('publish.actionsPanel.tableStatus')}</th>
            <th>{t('publish.actionsPanel.tableExternal')}</th>
            <th>{t('publish.actionsPanel.tableAction')}</th>
          </tr>
        </thead>
        <tbody>
          {publishes.data?.map((p: Publish) => {
            // O(1) lookup; the previous implementation did a linear find
            // inside the map, making each render O(N×M) — quadratic with
            // channels × publishes.
            const ch = channelById.get(p.channelId);
            return (
              <tr key={p.id}>
                <td>{ch?.name ?? p.channelId}</td>
                <td>
                  {p.status}
                  {p.status === 'queued' && p.attempts > 0
                    ? t('publish.actionsPanel.retrySuffix', { count: p.attempts })
                    : ''}
                </td>
                <td>
                  {p.externalUrl ? (
                    <a href={p.externalUrl} target="_blank" rel="noreferrer">{t('publish.actionsPanel.link')}</a>
                  ) : (
                    p.lastError ? <code>{p.lastError}</code> : '—'
                  )}
                  {p.channelId && <Link to={`/publishes/${p.id}`}> {t('publish.actionsPanel.detail')}</Link>}
                </td>
                <td>
                  {(p.status === 'queued' || p.status === 'running') && (
                    <button onClick={() => cancel.mutate(p.id)}>{t('publish.actionsPanel.cancel')}</button>
                  )}
                  {(p.status === 'failed' || p.status === 'cancelled') && (
                    <button onClick={() => retry.mutate(p.id)}>{t('publish.actionsPanel.retry')}</button>
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