import { z } from 'zod';

export const SeveritySchema = z.enum(['info', 'warning', 'error']);
export type Severity = z.infer<typeof SeveritySchema>;

export const CategorySchema = z.enum(['seo', 'cwv', 'geo', 'a11y', 'content']);
export type Category = z.infer<typeof CategorySchema>;

export const FindingSchema = z.object({
  category: CategorySchema,
  severity: SeveritySchema,
  rule: z.string().min(1),
  message: z.string().min(1),
  url: z.string().url(),
  selector: z.string().optional(),
  evidence: z.record(z.unknown()).default({}),
});
export type Finding = z.infer<typeof FindingSchema>;

export type ReviewState = 'draft' | 'in_review' | 'approved' | 'publishing' | 'published';

export interface AuditContext {
  url: string;
  html: string;
  /**
   * Injected by the API/worker. Plugins must not import infra directly.
   * The shape extends with plugins the test can satisfy via mocks.
   */
  fetchText(
    url: string,
    init?: { headers?: Record<string, string> },
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    text: string;
  }>;
  log(rule: string, detail: Record<string, unknown>): void;
}
