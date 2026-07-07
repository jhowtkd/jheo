interface Props {
  label: string;
  value: number | null;
  hero?: boolean;
}

/** Map a 0..100 score to a status color. */
function severity(value: number | null): 'good' | 'warn' | 'bad' {
  if (value === null) return 'warn';
  if (value >= 80) return 'good';
  if (value >= 60) return 'warn';
  return 'bad';
}

export function ScoreCard({ label, value, hero = false }: Props) {
  const display = value === null ? '—' : Math.round(value);
  const sev = severity(value);
  const fillClass = sev === 'good' ? '' : sev === 'warn' ? ' score__bar-fill--warn' : ' score__bar-fill--bad';
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={'score' + (hero ? ' score--hero' : '')}>
      <div className="score__label">{label}</div>
      <div className="score__value">{display}</div>
      {value !== null && (
        <div className="score__bar" aria-label={`${display} of 100`}>
          <div
            className={'score__bar-fill' + fillClass}
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
      )}
    </div>
  );
}