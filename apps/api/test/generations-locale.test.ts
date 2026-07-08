import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const generations = readFileSync(
  resolve(__dirname, '../src/routes/generations.ts'),
  'utf8',
);
const generateJob = readFileSync(
  resolve(__dirname, '../src/jobs/generate-job.ts'),
  'utf8',
);

describe('generations route — F6 locale', () => {
  it('reads req.locale when creating a Generation', () => {
    expect(generations).toMatch(/req\.locale/);
  });

  it('accepts optional targetLocale body field', () => {
    expect(generations).toMatch(/targetLocale/);
  });

  it('sets translatedTo when targetLocale differs from req.locale', () => {
    expect(generations).toMatch(/translatedTo/);
  });
});

describe('generate-job — F6 locale', () => {
  it('passes locale to the system prompt', () => {
    expect(generateJob).toMatch(/locale/);
    expect(generateJob).toMatch(/localeName|LOCALE_NAMES/);
  });
});
