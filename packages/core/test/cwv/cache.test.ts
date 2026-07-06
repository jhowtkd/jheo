import { describe, expect, it } from 'vitest';
import { checkCache, CacheCtxKey } from '../../src/audit/cwv/cache.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/cwv/cache', () => {
  it('flags many missing cache headers', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[CacheCtxKey] = { total: 10, missingCacheControl: 8 };
    const f = await checkCache(ctx);
    expect(f.some((x) => x.rule === 'cwv.cache.many-missing')).toBe(true);
  });
});