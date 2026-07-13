import type { Audit } from '../api.js';

export interface ScoreHistory {
  history: number[];
  previousOverall: number | null;
}

const MAX_HISTORY = 5;

/**
 * Build a sparkline series (oldest → newest) of the last ≤5 completed
 * audit overalls. Also pick the previous overall for the most recent
 * audit (the one immediately before the latest). Used by ScoreCard on
 * both the Project Dashboard and the Audit Results page.
 */
export function scoreHistoryFromAudits(audits: Audit[]): ScoreHistory {
  const completed = audits
    .filter((a) => a.status === 'completed' && a.score && typeof a.score.overall === 'number')
    .sort((a, b) => {
      const ta = a.finishedAt ? Date.parse(a.finishedAt) : 0;
      const tb = b.finishedAt ? Date.parse(b.finishedAt) : 0;
      return ta - tb;
    });
  const history = completed
    .slice(-MAX_HISTORY)
    .map((a) => a.score!.overall as number);
  const previousOverall =
    completed.length >= 2 ? (completed[completed.length - 2]!.score!.overall as number) : null;
  return { history, previousOverall };
}