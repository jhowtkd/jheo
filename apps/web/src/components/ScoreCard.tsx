import { useTranslation } from 'react-i18next';
import type { ProjectHealth } from '../api.js';

interface Props {
  health: ProjectHealth | null | undefined;
  previousOverall?: number | null;
  history?: number[];
  recomputed?: boolean;
}

const CATEGORIES = ['seo', 'cwv', 'geo', 'a11y', 'content'] as const;
type Category = (typeof CATEGORIES)[number];

export function ScoreCard({ health, previousOverall, history, recomputed }: Props) {
  const { t } = useTranslation();
  if (!health) {
    return (
      <div className="card">
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('findings.scoreCard.noHealth')}</p>
      </div>
    );
  }
  return (
    <div className="card scorecard col" style={{ gap: 'var(--space-3)' }}>
      <div
        className="row"
        style={{ alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}
      >
        <h2 style={{ margin: 0 }}>{t('findings.scoreCard.overall')}</h2>
        {typeof previousOverall === 'number' && health.overall !== null && (
          <DeltaBadge current={health.overall} previous={previousOverall} />
        )}
        {recomputed && (
          <span className="tag tag--info" title={t('findings.scoreCard.recomputedHint')}>
            {t('findings.scoreCard.recomputed')}
          </span>
        )}
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 'var(--space-4)' }}>
        <p className="scorecard__overall" style={{ margin: 0 }}>
          {health.overall ?? '—'}
        </p>
        {history && history.length >= 2 && <Sparkline values={history} />}
      </div>
      <div className="col" style={{ gap: 'var(--space-2)' }}>
        {CATEGORIES.map((cat) => (
          <CategoryRow key={cat} cat={cat} value={health.byCategory[cat]} />
        ))}
      </div>
    </div>
  );
}

function CategoryRow({ cat, value }: { cat: Category; value: number | null | undefined }) {
  const { t } = useTranslation();
  const label = t(`score.category.${cat}`);
  const hint = t(`score.category.${cat}Hint`);
  const empty = t('score.category.empty');
  return (
    <div className="row" style={{ gap: 'var(--space-2)' }}>
      <span
        className="scorecard__cat"
        title={hint}
        style={{
          width: '5rem',
          textTransform: 'uppercase',
          fontSize: 'var(--fs-sm)',
          color: 'var(--text-muted)',
        }}
      >
        {label}
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
      <span
        className="mono tabular"
        title={value == null ? empty : hint}
        style={{ width: '3rem', textAlign: 'right' }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const { t } = useTranslation();
  const delta = current - previous;
  const sign = delta > 0 ? '↑' : delta < 0 ? '↓' : '=';
  const tone = delta > 0 ? 'good' : delta < 0 ? 'bad' : 'neutral';
  const abs = Math.abs(delta);
  return (
    <span
      className={`tag tag--${tone}`}
      title={t('findings.scoreCard.deltaHint', { delta: delta })}
    >
      {sign} {abs}
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const W = 80;
  const H = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const stepX = values.length > 1 ? W / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="score history sparkline"
      style={{ display: 'block' }}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
