import { describe, expect, it } from 'vitest';
import { checkReadability } from '../../src/audit/content/readability.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/content/readability', () => {
  it('emits no finding on simple text', async () => {
    const body = 'The cat sat on the mat. The dog ran. The bird flew home.';
    const { ctx } = makeAuditHarness({ html: `<p>${body}</p>`, url: 'https://x/' });
    expect(await checkReadability(ctx)).toEqual([]);
  });
  it('flags low Flesch on long sentences', async () => {
    const sentence =
      'Notwithstanding the considerable complexity of contemporary inter-disciplinary methodologies, the heuristic apparatus remains insufficiently calibrated.';
    const long = `<p>${sentence} ${sentence} ${sentence}</p>`;
    const { ctx } = makeAuditHarness({ html: long, url: 'https://x/' });
    const f = await checkReadability(ctx);
    expect(f.some((x) => x.rule === 'content.readability.low')).toBe(true);
  });
});
