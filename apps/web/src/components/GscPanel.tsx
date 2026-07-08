import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteGscConnection,
  getGscConnection,
  getGscOverview,
  getGscPages,
  getGscQueries,
  putGscConnection,
  syncGsc,
  type GscConnection,
} from '../api.js';

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNum(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function syncBadgeClass(status: string): string {
  if (status === 'ok') return 'badge--completed';
  if (status === 'syncing') return 'badge--running';
  if (status === 'failed' || status === 'decrypt_error') return 'badge--failed';
  return 'badge--neutral';
}

export function GscPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [siteUrl, setSiteUrl] = useState('');
  const [saJson, setSaJson] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const connection = useQuery({
    queryKey: ['gsc-connection', projectId],
    queryFn: () => getGscConnection(projectId),
    refetchInterval: (q) => (q.state.data?.syncStatus === 'syncing' ? 3000 : false),
  });

  const overview = useQuery({
    queryKey: ['gsc-overview', projectId],
    queryFn: () => getGscOverview(projectId),
    enabled: !!connection.data && connection.data.syncStatus !== 'decrypt_error',
    refetchInterval: connection.data?.syncStatus === 'syncing' ? 5000 : false,
  });

  const queries = useQuery({
    queryKey: ['gsc-queries', projectId],
    queryFn: () => getGscQueries(projectId, 28, 10),
    enabled: !!connection.data && connection.data.syncStatus !== 'decrypt_error',
    refetchInterval: connection.data?.syncStatus === 'syncing' ? 5000 : false,
  });

  const pages = useQuery({
    queryKey: ['gsc-pages', projectId],
    queryFn: () => getGscPages(projectId, 28, 10),
    enabled: !!connection.data && connection.data.syncStatus !== 'decrypt_error',
    refetchInterval: connection.data?.syncStatus === 'syncing' ? 5000 : false,
  });

  const save = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(saJson);
      } catch {
        throw new Error(t('gsc.errors.invalidJson'));
      }
      if (!siteUrl.trim()) throw new Error(t('gsc.errors.siteUrlRequired'));
      return putGscConnection(projectId, { siteUrl: siteUrl.trim(), serviceAccountJson: parsed });
    },
    onSuccess: async () => {
      setFormError(null);
      setSaJson('');
      await qc.invalidateQueries({ queryKey: ['gsc-connection', projectId] });
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteGscConnection(projectId),
    onSuccess: async () => {
      setSiteUrl('');
      await qc.invalidateQueries({ queryKey: ['gsc-connection', projectId] });
      await qc.invalidateQueries({ queryKey: ['gsc-overview', projectId] });
    },
  });

  const sync = useMutation({
    mutationFn: () => syncGsc(projectId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['gsc-connection', projectId] }),
        qc.invalidateQueries({ queryKey: ['gsc-overview', projectId] }),
        qc.invalidateQueries({ queryKey: ['gsc-queries', projectId] }),
        qc.invalidateQueries({ queryKey: ['gsc-pages', projectId] }),
      ]);
    },
  });

  if (connection.isLoading) {
    return (
      <section style={{ marginBottom: 'var(--space-8)' }}>
        <div className="skeleton skeleton--card" />
      </section>
    );
  }

  if (!connection.data) {
    return (
      <section style={{ marginBottom: 'var(--space-8)' }}>
        <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, marginBottom: 'var(--space-3)' }}>
          {t('gsc.title')}
        </h2>
        <div className="card col" style={{ gap: 'var(--space-3)' }}>
          <p className="tiny muted" style={{ margin: 0 }}>
            {t('gsc.emptyHint')}
          </p>
          <label className="col" style={{ gap: 'var(--space-1)' }}>
            <span className="tiny" style={{ fontWeight: 600 }}>{t('gsc.siteUrlLabel')}</span>
            <input
              className="input"
              placeholder={t('gsc.siteUrlPlaceholder')}
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
            />
          </label>
          <label className="col" style={{ gap: 'var(--space-1)' }}>
            <span className="tiny" style={{ fontWeight: 600 }}>{t('gsc.serviceAccountLabel')}</span>
            <textarea
              className="input"
              rows={6}
              placeholder={t('gsc.serviceAccountPlaceholder')}
              value={saJson}
              onChange={(e) => setSaJson(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }}
            />
          </label>
          {formError && <p className="tiny" style={{ color: 'var(--danger)', margin: 0 }}>{formError}</p>}
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn btn--primary"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? t('gsc.connecting') : t('gsc.connect')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const conn: GscConnection = connection.data;
  const freshness = overview.data?.freshness;

  return (
    <section style={{ marginBottom: 'var(--space-8)' }}>
      <div className="spread" style={{ marginBottom: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>{t('gsc.title')}</h2>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={sync.isPending || conn.syncStatus === 'syncing'}
            onClick={() => sync.mutate()}
          >
            {conn.syncStatus === 'syncing' ? t('gsc.syncing') : t('gsc.syncNow')}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {t('gsc.disconnect')}
          </button>
        </div>
      </div>

      <div className="card col" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
        <div className="spread">
          <div className="col" style={{ gap: 'var(--space-1)' }}>
            <span className="mono tiny">{conn.siteUrl}</span>
            {conn.clientEmail && (
              <span className="tiny muted">{t('gsc.serviceAccountEmail', { email: conn.clientEmail })}</span>
            )}
          </div>
          <span className={`badge ${syncBadgeClass(conn.syncStatus)}`}>{conn.syncStatus}</span>
        </div>
        {conn.syncError && (
          <p className="tiny" style={{ color: 'var(--danger)', margin: 0 }}>{conn.syncError}</p>
        )}
        {freshness && (
          <p className="tiny muted" style={{ margin: 0 }}>
            {t('gsc.dataThrough', { date: freshness.dataThrough })}
            {freshness.lastSyncedAt && (
              <> · {t('gsc.lastSync', { date: new Date(freshness.lastSyncedAt).toLocaleString() })}</>
            )}
          </p>
        )}
      </div>

      {overview.data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <MetricTile label={t('gsc.metrics.clicks')} value={formatNum(overview.data.clicks)} />
          <MetricTile label={t('gsc.metrics.impressions')} value={formatNum(overview.data.impressions)} />
          <MetricTile label={t('gsc.metrics.ctr')} value={formatPct(overview.data.ctr)} />
          <MetricTile label={t('gsc.metrics.avgPosition')} value={formatNum(overview.data.position)} />
        </div>
      )}

      {(queries.data?.rows.length ?? 0) > 0 && (
        <GscTable
          title={t('gsc.tables.topQueries')}
          columns={[
            { key: 'query', label: t('gsc.tables.columns.query') },
            { key: 'clicks', label: t('gsc.tables.columns.clicks'), align: 'right' },
            { key: 'impressions', label: t('gsc.tables.columns.impressions'), align: 'right' },
            { key: 'ctr', label: t('gsc.tables.columns.ctr'), align: 'right', format: formatPct },
            { key: 'position', label: t('gsc.tables.columns.pos'), align: 'right', format: formatNum },
          ]}
          rows={queries.data!.rows.map((r) => ({ ...r, query: r.query ?? '—' }))}
        />
      )}

      {(pages.data?.rows.length ?? 0) > 0 && (
        <GscTable
          title={t('gsc.tables.topPages')}
          columns={[
            { key: 'page', label: t('gsc.tables.columns.page') },
            { key: 'clicks', label: t('gsc.tables.columns.clicks'), align: 'right' },
            { key: 'impressions', label: t('gsc.tables.columns.impressions'), align: 'right' },
            { key: 'ctr', label: t('gsc.tables.columns.ctr'), align: 'right', format: formatPct },
            { key: 'position', label: t('gsc.tables.columns.pos'), align: 'right', format: formatNum },
          ]}
          rows={pages.data!.rows.map((r) => ({ ...r, page: r.page ?? '—' }))}
        />
      )}
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 'var(--space-3) var(--space-4)' }}>
      <span className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <div className="tabular" style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function GscTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: Array<{
    key: string;
    label: string;
    align?: 'left' | 'right';
    format?: (v: number) => string;
  }>;
  rows: Array<Record<string, string | number>>;
}) {
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <h3 style={{ fontSize: 'var(--fs-md)', margin: '0 0 var(--space-2)' }}>{title}</h3>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={String(row.query ?? row.page ?? i)}>
                {columns.map((col) => {
                  const raw = row[col.key];
                  const display = typeof raw === 'number' && col.format ? col.format(raw) : String(raw ?? '—');
                  return (
                    <td
                      key={col.key}
                      className={col.key === 'page' || col.key === 'query' ? 'tiny mono' : 'tabular tiny'}
                      style={col.align === 'right' ? { textAlign: 'right' } : undefined}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}