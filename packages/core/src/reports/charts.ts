type SeverityCounts = { error: number; warning: number; info: number };

const CAT_ORDER = ['seo', 'cwv', 'geo', 'a11y', 'content'] as const;
const BAR_WIDTH = 400;
const BAR_MAX = 260;
const BAR_HEIGHT = 18;
const ROW_HEIGHT = 32;
const LABEL_WIDTH = 110;
const PADDING = 10;

function scoreColor(score: number): string {
  if (score >= 90) return '#16a34a';
  if (score >= 50) return '#f59e0b';
  return '#dc2626';
}

export function renderCategoryBarsSvg(
  byCategory: Record<string, number | null>,
  labels?: Record<string, string>,
): string {
  const entries = CAT_ORDER.filter((k) => k in byCategory).map((k) => [k, byCategory[k] ?? null] as const);

  const rows = entries
    .map(([key, score], i) => {
      const y = PADDING + i * ROW_HEIGHT;
      const label = labels?.[key] ?? key;
      const isNa = score === null;
      const barLen = isNa ? 0 : Math.round((Math.max(0, Math.min(100, score)) / 100) * BAR_MAX);
      const color = isNa ? '#9ca3af' : scoreColor(score);
      const scoreText = isNa ? 'N/A' : String(score);
      return [
        `<text x="${PADDING}" y="${y + BAR_HEIGHT - 4}" font-size="12" font-family="sans-serif" fill="#374151">${label}</text>`,
        `<rect x="${LABEL_WIDTH}" y="${y}" width="${BAR_MAX}" height="${BAR_HEIGHT}" rx="3" fill="#f3f4f6"/>`,
        `<rect x="${LABEL_WIDTH}" y="${y}" width="${barLen}" height="${BAR_HEIGHT}" rx="3" fill="${color}"/>`,
        `<text x="${LABEL_WIDTH + BAR_MAX + 8}" y="${y + BAR_HEIGHT - 4}" font-size="12" font-family="sans-serif" font-weight="bold" fill="${color}">${scoreText}</text>`,
      ].join('');
    })
    .join('');

  const totalWidth = LABEL_WIDTH + BAR_MAX + 50;
  const totalHeight = PADDING * 2 + entries.length * ROW_HEIGHT;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_WIDTH}" viewBox="0 0 ${totalWidth} ${totalHeight}" role="img" aria-label="Category scores">${rows}</svg>`;
}

export function renderSeverityDonutSvg(counts: SeverityCounts): string {
  const total = counts.error + counts.warning + counts.info;
  const size = 160;
  const cx = 80;
  const cy = 80;
  const r = 56;
  const circumference = 2 * Math.PI * r;

  const segments: { value: number; color: string }[] = [
    { value: counts.error, color: '#dc2626' },
    { value: counts.warning, color: '#f59e0b' },
    { value: counts.info, color: '#3b82f6' },
  ];

  let offset = 0;
  const circles = total > 0
    ? segments
        .filter((s) => s.value > 0)
        .map((s) => {
          const len = (s.value / total) * circumference;
          const dash = `stroke-dasharray="${len.toFixed(2)} ${(circumference - len).toFixed(2)}"`;
          const dashOffset = `stroke-dashoffset="${(-offset).toFixed(2)}"`;
          const c = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="20" ${dash} ${dashOffset} transform="rotate(-90 ${cx} ${cy})"/>`;
          offset += len;
          return c;
        })
        .join('')
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="20"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Severity breakdown">${circles}<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="28" font-family="sans-serif" font-weight="bold" fill="#111827">${total}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#6b7280">issues</text></svg>`;
}
