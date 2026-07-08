import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

describe('prisma schema shape — F7 Suggestion', () => {
  it('Suggestion model exists with required fields', () => {
    // Use Prisma.dmmf to introspect the generated client
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Suggestion');
    expect(model, 'Suggestion model must be in schema').toBeTruthy();
    const fieldNames = model!.fields.map((f) => f.name).sort();
    expect(fieldNames).toEqual(
      expect.arrayContaining([
        'id', 'findingId', 'kind', 'category', 'before', 'after',
        'confidence', 'rationale', 'locale', 'status', 'model',
        'createdAt', 'updatedAt', 'decidedAt',
      ]),
    );
  });

  it('Suggestion has @@unique([findingId, status])', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Suggestion')!;
    const unique = model.uniqueFields.map((uf) => uf.join(',')).sort();
    expect(unique).toContain('findingId,status');
  });

  it('Finding has suggestions back-relation', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Finding')!;
    const rel = model.fields.find((f) => f.name === 'suggestions');
    expect(rel, 'Finding.suggestions must exist').toBeTruthy();
    expect(rel!.kind).toBe('object');
    expect((rel! as any).type).toBe('Suggestion');
  });
});