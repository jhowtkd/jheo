import type { AuditContext, Finding } from '../../types.js';
import { plainTextWords } from '../derived.js';

export async function checkReadability(ctx: AuditContext): Promise<Finding[]> {
  const words = plainTextWords(ctx);
  // Sentence-end detection: derived helper gives tokens; we approximate
  // sentence count by counting tokens ending with sentence terminators.
  const sentences = words.filter((w) => /[.!?]$/.test(w));
  // When the worker pre-stripped, sentences array may be empty; fall back
  // to at-least-one for the Flesch calc.
  const sentenceCount =
    sentences.length > 0 ? sentences.length : Math.max(1, Math.floor(words.length / 15));
  if (words.length === 0) return [];
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const wordsPerSentence = words.length / sentenceCount;
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
