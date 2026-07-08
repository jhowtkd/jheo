import { describe, it, expect } from 'vitest';
import en from './en.json';
import ptBR from './pt-BR.json';

function leafKeys(obj: any, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}

describe('catalog parity', () => {
  it('en and pt-BR have the same leaf keys', () => {
    const enKeys = new Set(leafKeys(en).sort());
    const ptKeys = new Set(leafKeys(ptBR).sort());
    const missing = [...enKeys].filter((k) => !ptKeys.has(k));
    const extra = [...ptKeys].filter((k) => !enKeys.has(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('no en value is empty', () => {
    const empties = leafKeys(en).filter((k) => {
      const v = k.split('.').reduce<any>((o, p) => o?.[p], en as any);
      return typeof v === 'string' && v.trim().length === 0;
    });
    expect(empties).toEqual([]);
  });

  it('no pt-BR value is empty', () => {
    const empties = leafKeys(ptBR).filter((k) => {
      const v = k.split('.').reduce<any>((o, p) => o?.[p], ptBR as any);
      return typeof v === 'string' && v.trim().length === 0;
    });
    expect(empties).toEqual([]);
  });
});
