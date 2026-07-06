import type { AuditContext, Finding } from '../../types.js';

export async function checkReadability(ctx: AuditContext): Promise<Finding[]> {
  const text = ctx.html.replace(/<[^>]+>/g, ' ').trim();
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  if (sentences.length === 0 || words.length === 0) return [];
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = syllables / words.length;
  const flesch = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  if (flesch < 30) {
    return [
      {
        category: 'content',
        severity: 'info',
        rule: 'content.readability.low',
        message: `Flesch Reading Ease is ${flesch.toFixed(1)}; consider simpler prose.`,
        url: ctx.url,
        evidence: { flesch },
      },
    ];
  }
  return [];
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-zà-ÿ]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouyáéíóúâêîôûãõç]es|ed|[^laeiouyáéíóúâêîôûãõç]e)$/, '');
  const matches = trimmed.match(/[aeiouyáéíóúâêîôûãõ]+/g);
  return matches ? Math.max(1, matches.length) : 1;
}
