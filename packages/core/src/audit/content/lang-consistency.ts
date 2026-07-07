import type { AuditContext, Finding } from '../../types.js';
import { plainTextWords } from '../derived.js';

const STOPWORDS = {
  en: new Set(['the', 'and', 'with', 'this', 'that', 'are', 'from', 'for']),
  pt: new Set(['que', 'com', 'para', 'uma', 'são', 'este', 'este', 'aos', 'dos']),
};

export async function checkLangConsistency(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const declared = /<html\s+[^>]*\blang=["']([a-zA-Z-]+)["']/i.exec(ctx.html);
  const declaredLang = declared?.[1]?.toLowerCase().slice(0, 2);
  if (!declaredLang) return out;
  const tokens = plainTextWords(ctx).map((w) => w.toLowerCase()).slice(0, 1000);
  let en = 0;
  let pt = 0;
  for (const tok of tokens) {
    if (STOPWORDS.en.has(tok)) en++;
    if (STOPWORDS.pt.has(tok)) pt++;
  }
  const englishRatio = en / Math.max(1, tokens.length);
  const portugueseRatio = pt / Math.max(1, tokens.length);
  if (declaredLang === 'pt' && englishRatio > 0.05 && englishRatio > portugueseRatio) {
    out.push({
      category: 'content',
      severity: 'warning',
      rule: 'content.lang.mismatch',
      message: 'Declared lang is pt but content reads as English.',
      url: ctx.url,
      evidence: { declared: declaredLang, ratio: { en: englishRatio, pt: portugueseRatio } },
    });
  } else if (declaredLang === 'en' && portugueseRatio > 0.05 && portugueseRatio > englishRatio) {
    out.push({
      category: 'content',
      severity: 'warning',
      rule: 'content.lang.mismatch',
      message: 'Declared lang is en but content reads as Portuguese.',
      url: ctx.url,
      evidence: { declared: declaredLang, ratio: { en: englishRatio, pt: portugueseRatio } },
    });
  }
  return out;
}
