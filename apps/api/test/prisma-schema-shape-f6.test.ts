import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(
  resolve(__dirname, '../prisma/schema.prisma'),
  'utf8',
);

describe('prisma schema — F6 i18n', () => {
  it('declares TranslationCache with unique cacheKey', () => {
    expect(schema).toMatch(/model\s+TranslationCache\s*\{/);
    expect(schema).toMatch(/cacheKey\s+String\s+@unique/);
  });

  it('declares TranslationCache with required text, targetLocale, context, translated, provider, model', () => {
    const block = schema.match(/model\s+TranslationCache\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(block).toMatch(/text\s+String/);
    expect(block).toMatch(/targetLocale\s+String/);
    expect(block).toMatch(/context\s+String/);
    expect(block).toMatch(/translated\s+String/);
    expect(block).toMatch(/provider\s+String/);
    expect(block).toMatch(/model\s+String/);
    expect(block).toMatch(/@@index\(\[targetLocale,\s*context\]\)/);
  });

  it('adds locale and translatedTo to Generation', () => {
    const block = schema.match(/model\s+Generation\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(block).toMatch(/locale\s+String\s+@default\("en"\)/);
    expect(block).toMatch(/translatedTo\s+String\?/);
  });
});
