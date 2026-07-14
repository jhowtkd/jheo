import type { AuditSummary, TopRuleSummary } from './schema.js';

type FindingInput = {
  rule: string;
  category: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  url: string;
};

const SEV_SORT = { error: 3, warning: 2, info: 1 } as const;

export function buildAuditSummary(input: {
  projectName: string;
  rootUrl: string;
  auditId: string;
  finishedAt: string | null;
  score: {
    overall: number;
    byCategory: Record<string, number | null>;
    pagesAudited?: number;
    pagesTotal?: number;
  };
  pagesFailed: number;
  findings: FindingInput[];
  gsc?: AuditSummary['gsc'];
}): AuditSummary {
  const severityCounts = { error: 0, warning: 0, info: 0 };
  const byRule = new Map<
    string,
    { urls: Set<string>; maxSeverity: FindingInput['severity']; sampleMessage: string }
  >();
  const seen = new Set<string>();

  for (const f of input.findings) {
    const key = `${f.rule}\u0000${f.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      severityCounts[f.severity]++;
    }
    const entry = byRule.get(f.rule) ?? {
      urls: new Set(),
      maxSeverity: f.severity,
      sampleMessage: f.message,
    };
    entry.urls.add(f.url);
    if (SEV_SORT[f.severity] > SEV_SORT[entry.maxSeverity]) entry.maxSeverity = f.severity;
    byRule.set(f.rule, entry);
  }

  const topRules: TopRuleSummary[] = [...byRule.entries()]
    .map(([rule, v]) => ({
      rule,
      affectedPages: v.urls.size,
      maxSeverity: v.maxSeverity,
      sampleMessage: v.sampleMessage.slice(0, 120),
      sortScore: SEV_SORT[v.maxSeverity] * v.urls.size,
    }))
    .sort((a, b) => b.sortScore - a.sortScore)
    .slice(0, 15);

  return {
    projectName: input.projectName,
    rootUrl: input.rootUrl,
    auditId: input.auditId,
    finishedAt: input.finishedAt,
    overall: input.score.overall,
    byCategory: input.score.byCategory,
    pagesAudited: input.score.pagesAudited ?? 0,
    pagesTotal: input.score.pagesTotal ?? 0,
    pagesFailed: input.pagesFailed,
    severityCounts,
    topRules,
    ...(input.gsc ? { gsc: input.gsc } : {}),
  };
}
