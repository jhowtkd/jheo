import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkMeta } from '../../src/audit/seo/meta.js';
import { makeAuditHarness } from '../../src/audit/context.js';

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, '../../src/audit/seo/fixtures', name), 'utf8');
}

describe('audit/seo/meta', () => {
  it('produces no findings on a meta-good page', async () => {
    const html = loadFixture('meta.good.html');
    const { ctx } = makeAuditHarness({ html, url: 'https://example.com/good' });
    const findings = await checkMeta(ctx);
    expect(findings).toEqual([]);
  });

  it('flags a missing meta description', async () => {
    const html = loadFixture('meta.missing-description.html');
    const { ctx } = makeAuditHarness({ html, url: 'https://example.com/missing' });
    const findings = await checkMeta(ctx);
    expect(findings).toEqual([
      expect.objectContaining({
        category: 'seo',
        severity: 'warning',
        rule: 'meta.missing-description',
        url: 'https://example.com/missing',
      }),
    ]);
  });

  it('also flags a missing title', async () => {
    const html = `<html><head></head><body></body></html>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://example.com/notitle' });
    const findings = await checkMeta(ctx);
    expect(findings.some((f) => f.rule === 'meta.missing-title')).toBe(true);
  });
});
