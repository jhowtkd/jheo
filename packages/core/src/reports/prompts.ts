import type { AuditSummary } from './schema.js';

export function buildExecutiveReportPrompt(
  summary: AuditSummary,
  locale: 'en' | 'pt-BR',
): { system: string; user: string } {
  const system =
    locale === 'pt-BR'
      ? [
          'Você é um analista sênior de auditoria SEO e técnica.',
          'Analise o resumo de auditoria fornecido e gere um relatório executivo acionável.',
          'Responda APENAS com JSON válido, sem texto adicional, markdown ou comentários.',
          'O JSON deve conter exatamente estes campos:',
          '- executiveSummary: parágrafo de resumo executivo (50–2000 caracteres)',
          '- topIssues: array (1–15) de { rule, title, businessImpact, impactLevel ("high"|"medium"|"low"), affectedPages (número inteiro = contagem de páginas; NÃO uma lista de URLs) }',
          '- scenarios: array (1–5) de { label, estimatedScoreFrom (0–100), estimatedScoreTo (0–100), rationale }',
          '- recommendations: array (1–8) de strings com recomendações priorizadas',
          'Escreva todo o conteúdo em português brasileiro.',
        ].join(' ')
      : [
          'You are a senior SEO and technical audit analyst.',
          'Analyze the provided audit summary and produce an actionable executive report.',
          'Respond with ONLY valid JSON — no extra text, no markdown, no commentary.',
          'The JSON must contain exactly these fields:',
          '- executiveSummary: executive summary paragraph (50–2000 characters)',
          '- topIssues: array (1–15) of { rule, title, businessImpact, impactLevel ("high"|"medium"|"low"), affectedPages (integer count of pages; NOT a list of URLs) }',
          '- scenarios: array (1–5) of { label, estimatedScoreFrom (0–100), estimatedScoreTo (0–100), rationale }',
          '- recommendations: array (1–8) of prioritized recommendation strings',
          'Write all content in English.',
        ].join(' ');

  return { system, user: JSON.stringify(summary, null, 2) };
}
