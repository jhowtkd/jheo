import type { ProjectHealth } from '../api.js';

interface Props {
  health: ProjectHealth | null | undefined;
}

const CATEGORIES = ['seo', 'cwv', 'geo', 'a11y', 'content'] as const;

export function ScoreCard({ health }: Props) {
  if (!health) {
    return (
      <div className="card">
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>No health data yet.</p>
      </div>
    );
  }
  return (
    <div className="card col" style={{ gap: 'var(--space-3)' }}>
      <div>
        <h2 style={{ margin: 0 }}>Overall</h2>
        <p style={{ fontSize: 'var(--fs-2xl)', margin: 0 }}>{health.overall ?? '—'}</p>
      </div>
      <div className="col" style={{ gap: 'var(--space-2)' }}>
        {CATEGORIES.map((cat) => {
          const value = health.byCategory[cat];
          return (
            <div key={cat} className="row" style={{ gap: 'var(--space-2)' }}>
              <span style={{ width: '5rem', textTransform: 'uppercase', fontSize: 'var(--fs-sm)' }}>
                {cat}
              </span>
              <div
                style={{
                  flex: 1,
                  height: '8px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-pill)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${value ?? 0}%`,
                    height: '100%',
                    background: value == null ? 'var(--border)' : 'var(--accent)',
                  }}
                />
              </div>
              <span className="mono" style={{ width: '3rem', textAlign: 'right' }}>
                {value ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
