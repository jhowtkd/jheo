import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ScoreCard } from '../components/ScoreCard.js';
import { getProject, listMaterials, listChannels, listGenerations } from '../api.js';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
    refetchInterval: 5000,
  });
  const materials = useQuery({
    queryKey: ['materials', projectId],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
    refetchInterval: 8000,
  });
  const channels = useQuery({
    queryKey: ['channels', projectId],
    queryFn: () => listChannels(projectId!),
    enabled: !!projectId,
    refetchInterval: 10000,
  });
  const generations = useQuery({
    queryKey: ['generations', projectId],
    queryFn: () => listGenerations(projectId!),
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  if (!project.data) {
    return (
      <div className="page">
        <div className="skeleton skeleton--title" style={{ marginBottom: 'var(--space-3)' }} />
        <div className="skeleton skeleton--text" style={{ width: '30%', marginBottom: 'var(--space-8)' }} />
        <div className="skeleton skeleton--card" />
      </div>
    );
  }

  const p = project.data;
  const latest = p.audits[0];

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to="/projects" className="muted tiny">Projects</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{p.name}</span>
          </div>
          <h1 className="page__title">{p.name}</h1>
          <p className="page__subtitle mono">{p.rootUrl}</p>
        </div>
        <Link to={`/projects/${projectId}/audit`} className="btn btn--primary">
          Run audit
        </Link>
      </div>

      {/* Stat tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-8)',
        }}
      >
        <StatTile
          label="Audits"
          value={p.audits.length}
          {...(latest?.status === 'completed' ? { accent: 'success' as const } : {})}
        />
        <StatTile label="Materials" value={materials.data?.length ?? '—'} />
        <StatTile label="Generations" value={generations.data?.length ?? '—'} />
        <StatTile label="Channels" value={channels.data?.length ?? '—'} />
      </div>

      {/* Latest audit score */}
      {latest?.score && (
        <section style={{ marginBottom: 'var(--space-8)' }}>
          <div className="spread" style={{ marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>Latest audit</h2>
            <Link to={`/audits/${latest.id}`} className="tiny">
              Open full report →
            </Link>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(200px, auto) 1fr',
              gap: 'var(--space-3)',
              alignItems: 'stretch',
            }}
          >
            <ScoreCard label="Overall" value={latest.score.overall} hero />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 'var(--space-3)',
              }}
            >
              {Object.entries(latest.score.byCategory).map(([k, v]) => (
                <ScoreCard key={k} label={k} value={v} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Audit history */}
      {p.audits.length > 0 && (
        <section style={{ marginBottom: 'var(--space-8)' }}>
          <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, marginBottom: 'var(--space-3)' }}>Audit history</h2>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Started</th>
                  <th style={{ textAlign: 'right' }}>Overall</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {p.audits.map((a) => (
                  <tr key={a.id}>
                    <td><span className={`badge badge--${a.status}`}>{a.status}</span></td>
                    <td className="tiny tabular muted">{a.startedAt ? formatDate(a.startedAt) : '—'}</td>
                    <td className="tabular" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {a.score?.overall ?? '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/audits/${a.id}`} className="tiny">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Quick links */}
      <section>
        <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, marginBottom: 'var(--space-3)' }}>Workspace</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <QuickLink
            to={`/projects/${projectId}/materials`}
            label="Materials"
            hint="Sources the generator uses for context (URLs, files, notes)"
            {...(materials.data ? { count: materials.data.length } : {})}
          />
          <QuickLink
            to={`/projects/${projectId}/compose`}
            label="Generate"
            hint="Compose a new generation from a template + materials"
            {...(generations.data ? { count: generations.data.length } : {})}
          />
          <QuickLink
            to={`/projects/${projectId}/channels`}
            label="Channels"
            hint="Where approved generations are published (WordPress, HTTP, agent)"
            {...(channels.data ? { count: channels.data.length } : {})}
          />
        </div>
      </section>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number | string; accent?: 'success' }) {
  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-4) var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      <span className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        {label}
      </span>
      <span
        className="tabular"
        style={{
          fontSize: 'var(--fs-2xl)',
          fontWeight: 700,
          letterSpacing: '-0.025em',
          color: accent === 'success' ? 'var(--accent-bright)' : 'var(--text)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function QuickLink({
  to,
  label,
  hint,
  count,
}: {
  to: string;
  label: string;
  hint: string;
  count?: number;
}) {
  return (
    <Link
      to={to}
      className="card card--interactive"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <div className="spread">
        <span style={{ fontWeight: 600 }}>{label}</span>
        {count !== undefined && (
          <span className="tabular tiny muted">{count}</span>
        )}
      </div>
      <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>{hint}</p>
    </Link>
  );
}