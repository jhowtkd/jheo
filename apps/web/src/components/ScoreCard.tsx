export function ScoreCard({ label, value }: { label: string; value: number | null }) {
  const display = value === null ? '—' : Math.round(value);
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, minWidth: 120 }}>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{display}</div>
    </div>
  );
}
