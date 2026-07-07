import type { Finding } from '../api.js';

const SEV_CLASS: Record<Finding['severity'], string> = {
  info: 'sev--info',
  warning: 'sev--warning',
  error: 'sev--error',
};

interface Props {
  findings: Finding[];
  byCategory?: Record<string, Finding[]>;
}

export function FindingList({ findings, byCategory }: Props) {
  if (findings.length === 0) {
    return (
      <div className="empty">
        <div className="empty__art">
          <svg viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="20" />
            <path d="M18 28l8 8 14-16" />
          </svg>
        </div>
        <p className="empty__title">No findings</p>
        <p className="empty__hint">The audit ran clean — nothing to fix here.</p>
      </div>
    );
  }

  if (byCategory) {
    return (
      <div className="col" style={{ gap: 'var(--space-6)' }}>
        {Object.entries(byCategory).map(([category, items]) => (
          <section key={category}>
            <h3
              style={{
                fontSize: 'var(--fs-md)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
                margin: 0,
                marginBottom: 'var(--space-3)',
              }}
            >
              {category} <span className="tabular muted" style={{ marginLeft: 4 }}>· {items.length}</span>
            </h3>
            <div className="finding-list">
              {items.map((f) => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="finding-list">
      {findings.map((f) => (
        <FindingCard key={f.id} finding={f} />
      ))}
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const url = (() => {
    try { return new URL(finding.url).hostname + (finding.selector ? ' › ' + finding.selector : ''); }
    catch { return finding.url; }
  })();
  return (
    <article className="finding">
      <div className={'finding__sev ' + SEV_CLASS[finding.severity]}>{finding.severity}</div>
      <div>
        <div className="finding__rule">{finding.rule}</div>
        <div className="finding__msg">{finding.message}</div>
      </div>
      <div className="finding__meta">
        <div>{finding.category}</div>
        <a href={finding.url} target="_blank" rel="noreferrer" title={finding.url}>
          {url.length > 38 ? url.slice(0, 38) + '…' : url} ↗
        </a>
      </div>
    </article>
  );
}