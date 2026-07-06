import type { Finding } from '../api.js';

const SEV_COLOR: Record<Finding['severity'], string> = {
  info: '#1d4ed8',
  warning: '#b45309',
  error: '#b91c1c',
};

export function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return <p>No findings.</p>;
  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {findings.map((f) => (
        <li key={f.id} style={{ borderTop: '1px solid #eee', padding: '12px 0' }}>
          <div style={{ fontSize: 12, color: SEV_COLOR[f.severity], textTransform: 'uppercase' }}>{f.severity}</div>
          <div style={{ fontWeight: 600 }}>{f.rule}</div>
          <div>{f.message}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{f.url}{f.selector ? ` · ${f.selector}` : ''}</div>
        </li>
      ))}
    </ul>
  );
}
