import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit/orchestrator.js';
import { makeAuditHarness } from '../src/audit/context.js';

describe('audit/orchestrator', () => {
  it('aggregates findings from all plugins', async () => {
    const html = `<html><head><title>ok</title><meta name="description" content="ok"></head><body><h1>t</h1></body></html>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://example.com/' });
    const result = await runAudit(ctx);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.score.overall).toBeGreaterThanOrEqual(0);
    expect(result.score.overall).toBeLessThanOrEqual(100);
  });
});