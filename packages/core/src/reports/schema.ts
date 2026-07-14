import { z } from 'zod';

export const SeverityCountsSchema = z.object({
  error: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  info: z.number().int().nonnegative(),
});

export const TopRuleSummarySchema = z.object({
  rule: z.string(),
  affectedPages: z.number().int().nonnegative(),
  maxSeverity: z.enum(['error', 'warning', 'info']),
  sampleMessage: z.string(),
  sortScore: z.number(),
});

export const GscReportSummarySchema = z.object({
  clicks: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  ctr: z.number().min(0).max(1),
  lowCtrQueryCount: z.number().int().nonnegative(),
  periodDays: z.number().int().positive(),
});

export const AuditSummarySchema = z.object({
  projectName: z.string(),
  rootUrl: z.string(),
  auditId: z.string(),
  finishedAt: z.string().nullable(),
  overall: z.number().int().min(0).max(100),
  byCategory: z.record(z.number().int().min(0).max(100).nullable()),
  pagesAudited: z.number().int().nonnegative(),
  pagesTotal: z.number().int().nonnegative(),
  pagesFailed: z.number().int().nonnegative(),
  severityCounts: SeverityCountsSchema,
  topRules: z.array(TopRuleSummarySchema).max(15),
  gsc: GscReportSummarySchema.optional(),
});

/** MiniMax (and similar) often emit page URL lists; schema wants a count. */
const AffectedPagesCountSchema = z.preprocess(
  (val) => (Array.isArray(val) ? val.length : val),
  z.number().int().nonnegative(),
);

export const ExecutiveNarrativeSchema = z.object({
  executiveSummary: z.string().min(50).max(2000),
  topIssues: z
    .array(
      z.object({
        rule: z.string(),
        title: z.string(),
        businessImpact: z.string(),
        impactLevel: z.enum(['high', 'medium', 'low']),
        affectedPages: AffectedPagesCountSchema,
      }),
    )
    .min(1)
    .max(15),
  scenarios: z
    .array(
      z.object({
        label: z.string(),
        estimatedScoreFrom: z.number().int().min(0).max(100),
        estimatedScoreTo: z.number().int().min(0).max(100),
        rationale: z.string(),
      }),
    )
    .min(1)
    .max(5),
  recommendations: z.array(z.string()).min(1).max(8),
});

export type TopRuleSummary = z.infer<typeof TopRuleSummarySchema>;
export type GscReportSummary = z.infer<typeof GscReportSummarySchema>;
export type AuditSummary = z.infer<typeof AuditSummarySchema>;
export type ExecutiveNarrative = z.infer<typeof ExecutiveNarrativeSchema>;
export type ExecutiveReportRecord = {
  status: 'generating' | 'ready' | 'failed';
  locale: 'en' | 'pt-BR';
  generatedAt: string | null;
  generatingStartedAt: string | null;
  model: string | null;
  errorMessage: string | null;
  aggregates: AuditSummary;
  narrative: ExecutiveNarrative | null;
};
