import { describe, it, expect, vi } from 'vitest';
import {
  runExecutiveReport,
  ExecutiveReportLlmError,
} from '@jheo/core';
import type { LLMProvider, AuditSummary } from '@jheo/core';

const SUMMARY: AuditSummary = {
  overall: 72,
  byCategory: { seo: 70, cwv: 75, a11y: 68, content: 78, geo: 80 },
  topRules: [
    { rule: 'img-alt', category: 'a11y', severity: 'error', affected: 4 },
    { rule: 'title-len', category: 'seo', severity: 'warning', affected: 2 },
  ],
  pagesAudited: 10,
  pagesTotal: 10,
};

const VALID_NARRATIVE_TEXT = JSON.stringify({
  executiveSummary:
    'The site has accessible-image and metadata gaps that, if fixed, would lift the overall score into the high 80s and improve search-engine click-through noticeably.',
  topIssues: [
    {
      rule: 'img-alt',
      title: 'Missing alt text on 4 images',
      businessImpact: 'A11y risk and lower image-search traffic',
      impactLevel: 'high',
      affectedPages: 4,
    },
  ],
  scenarios: [
    {
      label: 'Add alt attributes to all images',
      estimatedScoreFrom: 72,
      estimatedScoreTo: 86,
      rationale: 'Removes a11y errors and improves image search ranking',
    },
  ],
  recommendations: ['Add alt text to every <img> element across the site'],
});

function fakeProvider(text: string): LLMProvider {
  return {
    complete: vi.fn(async () => ({
      text,
      usage: { promptTokens: 10, completionTokens: 20 },
      provider: 'fake',
      model: 'fake-1',
    })),
  };
}

describe('runExecutiveReport — LLM output parser', () => {
  it('parses clean JSON output', async () => {
    const provider = fakeProvider(VALID_NARRATIVE_TEXT);
    const result = await runExecutiveReport(provider, SUMMARY, 'en');
    expect(result.executiveSummary.length).toBeGreaterThanOrEqual(60);
    expect(result.topIssues[0]?.rule).toBe('img-alt');
  });

  it('parses JSON wrapped in ```json code fences', async () => {
    const provider = fakeProvider('```json\n' + VALID_NARRATIVE_TEXT + '\n```');
    const result = await runExecutiveReport(provider, SUMMARY, 'en');
    expect(result.topIssues[0]?.rule).toBe('img-alt');
  });

  it('parses JSON wrapped in ``` ``` code fences (no language tag)', async () => {
    const provider = fakeProvider('```\n' + VALID_NARRATIVE_TEXT + '\n```');
    const result = await runExecutiveReport(provider, SUMMARY, 'en');
    expect(result.topIssues[0]?.rule).toBe('img-alt');
  });

  it('parses JSON preceded by a MiniMax-style <think>…</think> block', async () => {
    // The <think> block contains reasoning prose; the JSON follows after.
    const text = `<think>
The user wants an executive report for this audit. Let me build a
narrative that highlights the a11y + SEO gaps and frames a fix
scenario around adding alt attributes to every image.
</think>

` + VALID_NARRATIVE_TEXT;
    const provider = fakeProvider(text);
    const result = await runExecutiveReport(provider, SUMMARY, 'en');
    expect(result.topIssues[0]?.rule).toBe('img-alt');
  });

  it('parses JSON INSIDE a <think>…</think> block (MiniMax-M3 chain-of-thought contains the payload)', async () => {
    // This is the case that hit the user: the LLM emitted its reasoning
    // AND the JSON inside the same <think> block. stripLlmThinking on
    // its own would have thrown the JSON away with the think block; the
    // last-resort balanced-brace scan recovers it.
    const text = `<think>
The user wants me to analyze the audit summary provided and generate
an actionable executive report in JSON format. Let me analyze what
we have:
- Project: loopany.ai
- Root URL: https://loopany.ai
- Overall score: 72
- Top categories with issues: a11y, seo

I will produce a JSON object with executiveSummary, topIssues,
scenarios, and recommendations.
` + VALID_NARRATIVE_TEXT + `
</think>`;
    const provider = fakeProvider(text);
    const result = await runExecutiveReport(provider, SUMMARY, 'en');
    expect(result.topIssues[0]?.rule).toBe('img-alt');
  });

  it('parses JSON embedded in surrounding prose', async () => {
    // Some models emit a sentence, then the JSON, then a closing note.
    const text =
      'Here is the executive report you asked for:\n\n' +
      VALID_NARRATIVE_TEXT +
      '\n\nLet me know if you would like me to drill into any of the issues.';
    const provider = fakeProvider(text);
    const result = await runExecutiveReport(provider, SUMMARY, 'en');
    expect(result.topIssues[0]?.rule).toBe('img-alt');
  });

  it('throws ExecutiveReportLlmError when no JSON can be found', async () => {
    const provider = fakeProvider('<think>just thinking, no answer</think>');
    await expect(runExecutiveReport(provider, SUMMARY, 'en')).rejects.toThrow(
      ExecutiveReportLlmError,
    );
  });

  it('throws ExecutiveReportLlmError when extracted JSON does not match the schema', async () => {
    // Valid JSON, but missing required fields (executiveSummary, topIssues, …).
    const provider = fakeProvider(
      '<think>Here you go:</think>\n{"totally": "wrong shape"}',
    );
    await expect(runExecutiveReport(provider, SUMMARY, 'en')).rejects.toThrow(
      ExecutiveReportLlmError,
    );
  });
});
