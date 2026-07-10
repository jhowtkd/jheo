import type { ExecutiveReportRecord } from '@jheo/core';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderExecutiveReportHtml(record: ExecutiveReportRecord): string {
  const n = record.narrative;
  return `<!DOCTYPE html>
<html lang="${esc(record.locale)}">
<head><meta charset="utf-8"><title>Executive Report</title></head>
<body>
<h1>Executive Audit Report</h1>
${n ? `<p>${esc(n.executiveSummary)}</p>` : '<p>Report not ready.</p>'}
</body>
</html>`;
}
