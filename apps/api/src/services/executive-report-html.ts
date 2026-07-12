import type { ExecutiveReportRecord } from '@jheo/core';
import { renderCategoryBarsSvg, renderSeverityDonutSvg } from '@jheo/core';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LABELS = {
  en: {
    title: 'Executive Audit Report',
    generated: 'Generated',
    overallScore: 'Overall Score',
    executiveSummary: 'Executive Summary',
    categoryScores: 'Category Scores',
    severityBreakdown: 'Severity Breakdown',
    pagesAudited: 'Pages Audited',
    pagesTotal: 'Total Pages',
    pagesFailed: 'Pages Failed',
    topIssues: 'Top Issues',
    issue: 'Issue',
    businessImpact: 'Business Impact',
    impact: 'Impact',
    affectedPages: 'Affected Pages',
    gscPerformance: 'Search Console Performance',
    clicks: 'Clicks',
    impressions: 'Impressions',
    ctr: 'Click-through Rate',
    lowCtrQueries: 'Low-CTR Queries',
    lastDays: (n: number) => `Last ${n} days`,
    scenarios: 'Improvement Scenarios',
    estimatedScore: 'Estimated Score',
    rationale: 'Rationale',
    recommendations: 'Recommendations',
    auditId: 'Audit ID',
    reportNotReady: 'Report is not ready.',
    impactLevel: { high: 'High', medium: 'Medium', low: 'Low' } as const,
  },
  'pt-BR': {
    title: 'Relatório Executivo de Auditoria',
    generated: 'Gerado em',
    overallScore: 'Pontuação Geral',
    executiveSummary: 'Resumo Executivo',
    categoryScores: 'Pontuação por Categoria',
    severityBreakdown: 'Distribuição por Severidade',
    pagesAudited: 'Páginas Auditadas',
    pagesTotal: 'Total de Páginas',
    pagesFailed: 'Páginas com Falha',
    topIssues: 'Principais Problemas',
    issue: 'Problema',
    businessImpact: 'Impacto no Negócio',
    impact: 'Impacto',
    affectedPages: 'Páginas Afetadas',
    gscPerformance: 'Desempenho no Search Console',
    clicks: 'Cliques',
    impressions: 'Impressões',
    ctr: 'Taxa de Cliques',
    lowCtrQueries: 'Consultas com Baixo CTR',
    lastDays: (n: number) => `Últimos ${n} dias`,
    scenarios: 'Cenários de Melhoria',
    estimatedScore: 'Pontuação Estimada',
    rationale: 'Justificativa',
    recommendations: 'Recomendações',
    auditId: 'ID da Auditoria',
    reportNotReady: 'Relatório não está pronto.',
    impactLevel: { high: 'Alto', medium: 'Médio', low: 'Baixo' } as const,
  },
} as const;

const CATEGORY_LABELS = {
  en: { seo: 'SEO', cwv: 'Core Web Vitals', geo: 'Generative SEO', a11y: 'Accessibility', content: 'Content' },
  'pt-BR': { seo: 'SEO', cwv: 'Core Web Vitals', geo: 'SEO Generativo', a11y: 'Acessibilidade', content: 'Conteúdo' },
} as const;

function impactColor(level: 'high' | 'medium' | 'low'): string {
  return level === 'high' ? '#dc2626' : level === 'medium' ? '#f59e0b' : '#3b82f6';
}

function scoreBadgeColor(score: number): string {
  if (score >= 90) return '#16a34a';
  if (score >= 50) return '#f59e0b';
  return '#dc2626';
}

function formatPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function renderExecutiveReportHtml(record: ExecutiveReportRecord): string {
  const t = LABELS[record.locale];
  const catLabels = CATEGORY_LABELS[record.locale];
  const a = record.aggregates;
  const n = record.narrative;
  const generatedDate = record.generatedAt
    ? new Date(record.generatedAt).toLocaleString(record.locale)
    : '—';

  const topIssuesRows = n
    ? n.topIssues
        .map(
          (issue) => `<tr>
        <td>${esc(issue.title)}<br><small><code>${esc(issue.rule)}</code></small></td>
        <td>${esc(issue.businessImpact)}</td>
        <td><span class="badge" style="background:${impactColor(issue.impactLevel)}">${esc(t.impactLevel[issue.impactLevel])}</span></td>
        <td>${issue.affectedPages}</td>
      </tr>`,
        )
        .join('')
    : '';

  const scenarioCards = n
    ? n.scenarios
        .map(
          (s) => `<div class="scenario-card">
        <div class="scenario-score">${s.estimatedScoreFrom}–${s.estimatedScoreTo}</div>
        <div class="scenario-body">
          <h3>${esc(s.label)}</h3>
          <p>${esc(s.rationale)}</p>
        </div>
      </div>`,
        )
        .join('')
    : '';

  const recommendationsList = n
    ? n.recommendations.map((r) => `<li>${esc(r)}</li>`).join('')
    : '';

  const gscSection = a.gsc
    ? `<section class="card">
        <h2>${esc(t.gscPerformance)}</h2>
        <p class="muted">${esc(t.lastDays(a.gsc.periodDays))}</p>
        <div class="gsc-grid">
          <div class="metric"><div class="metric-value">${a.gsc.clicks.toLocaleString(record.locale)}</div><div class="metric-label">${esc(t.clicks)}</div></div>
          <div class="metric"><div class="metric-value">${a.gsc.impressions.toLocaleString(record.locale)}</div><div class="metric-label">${esc(t.impressions)}</div></div>
          <div class="metric"><div class="metric-value">${formatPercent(a.gsc.ctr)}</div><div class="metric-label">${esc(t.ctr)}</div></div>
          <div class="metric"><div class="metric-value">${a.gsc.lowCtrQueryCount}</div><div class="metric-label">${esc(t.lowCtrQueries)}</div></div>
        </div>
      </section>`
    : '';

  const categorySvg = renderCategoryBarsSvg(a.byCategory, catLabels);
  const severitySvg = renderSeverityDonutSvg(a.severityCounts);
  const badgeColor = scoreBadgeColor(a.overall);

  return `<!DOCTYPE html>
<html lang="${esc(record.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)} — ${esc(a.projectName)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111827;background:#f9fafb;line-height:1.6;}
  .container{max-width:900px;margin:0 auto;padding:32px 24px;}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:20px;}
  h1{font-size:28px;margin:0 0 8px;}
  h2{font-size:20px;margin:0 0 16px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;}
  h3{font-size:16px;margin:0 0 8px;}
  p{margin:0 0 12px;}
  .muted{color:#6b7280;font-size:14px;}
  .header-meta{display:flex;flex-wrap:wrap;gap:8px 24px;font-size:14px;color:#4b5563;margin-bottom:16px;}
  .header-meta strong{color:#111827;}
  .score-badge{display:inline-flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;font-size:28px;font-weight:bold;color:#fff;}
  .score-row{display:flex;align-items:center;gap:20px;margin-bottom:20px;}
  .score-label{font-size:14px;color:#6b7280;}
  .score-value{font-size:14px;color:#111827;}
  .chart-wrap{display:flex;flex-wrap:wrap;gap:32px;align-items:center;justify-content:center;}
  table{width:100%;border-collapse:collapse;font-size:14px;}
  th{text-align:left;padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#374151;font-weight:600;}
  td{padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top;}
  small code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px;color:#6b7280;}
  .badge{display:inline-block;padding:2px 10px;border-radius:12px;color:#fff;font-size:12px;font-weight:600;}
  .gsc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;}
  .metric{text-align:center;padding:16px;background:#f9fafb;border-radius:8px;}
  .metric-value{font-size:24px;font-weight:bold;color:#111827;}
  .metric-label{font-size:13px;color:#6b7280;margin-top:4px;}
  .scenario-card{display:flex;gap:16px;padding:16px;background:#f9fafb;border-radius:8px;margin-bottom:12px;}
  .scenario-score{font-size:20px;font-weight:bold;color:#16a34a;min-width:80px;text-align:center;align-self:center;}
  .scenario-body{flex:1;}
  ol{padding-left:20px;}
  ol li{margin-bottom:8px;}
  .footer{text-align:center;color:#9ca3af;font-size:13px;padding:24px 0;border-top:1px solid #e5e7eb;margin-top:24px;}
  @media print{
    body{background:#fff;}
    .container{max-width:none;padding:0;}
    .card{break-inside:avoid;border:none;box-shadow:none;padding:12px 0;}
    h2{border-bottom:1px solid #ccc;}
  }
</style>
</head>
<body>
<div class="container">

<header class="card">
  <h1>${esc(t.title)}</h1>
  <div class="header-meta">
    <span><strong>${esc(a.projectName)}</strong></span>
    <span>${esc(a.rootUrl)}</span>
    <span>${esc(t.generated)}: ${esc(generatedDate)}</span>
  </div>
  <div class="score-row">
    <div class="score-badge" style="background:${badgeColor}">${a.overall}</div>
    <div>
      <div class="score-label">${esc(t.overallScore)}</div>
      <div class="score-label">${esc(t.pagesAudited)}: ${a.pagesAudited} / ${esc(t.pagesTotal)}: ${a.pagesTotal}${a.pagesFailed > 0 ? ` · ${esc(t.pagesFailed)}: ${a.pagesFailed}` : ''}</div>
    </div>
  </div>
</header>

${n ? `<section class="card">
  <h2>${esc(t.executiveSummary)}</h2>
  <p>${esc(n.executiveSummary)}</p>
</section>` : `<section class="card"><p>${esc(t.reportNotReady)}</p></section>`}

<section class="card">
  <h2>${esc(t.categoryScores)}</h2>
  <div class="chart-wrap">${categorySvg}</div>
</section>

<section class="card">
  <h2>${esc(t.severityBreakdown)}</h2>
  <div class="chart-wrap">${severitySvg}</div>
</section>

${n && n.topIssues.length > 0 ? `<section class="card">
  <h2>${esc(t.topIssues)}</h2>
  <table>
    <thead><tr><th>${esc(t.issue)}</th><th>${esc(t.businessImpact)}</th><th>${esc(t.impact)}</th><th>${esc(t.affectedPages)}</th></tr></thead>
    <tbody>${topIssuesRows}</tbody>
  </table>
</section>` : ''}

${gscSection}

${n && n.scenarios.length > 0 ? `<section class="card">
  <h2>${esc(t.scenarios)}</h2>
  ${scenarioCards}
</section>` : ''}

${n && n.recommendations.length > 0 ? `<section class="card">
  <h2>${esc(t.recommendations)}</h2>
  <ol>${recommendationsList}</ol>
</section>` : ''}

<div class="footer">
  ${esc(t.auditId)}: ${esc(a.auditId)} · ${esc(generatedDate)}
</div>

</div>
</body>
</html>`;
}
