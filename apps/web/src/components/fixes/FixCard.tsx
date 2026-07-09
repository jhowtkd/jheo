import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Suggestion } from '../../api.js';
import { DiffView } from './DiffView.js';
import { ConfidenceChip } from './ConfidenceChip.js';
import { SuggestionActions } from './SuggestionActions.js';

export type FindingLike = {
  id: string;
  rule: string;
  category: string;
  severity: string;
  message: string;
  url: string;
};

type Props = {
  finding: FindingLike;
  suggestion: Suggestion | null;
  onGenerate: (findingId: string) => void;
  onAccept: (suggestionId: string) => void;
  onReject: (suggestionId: string) => void;
  onRegenerate: (suggestionId: string) => void;
};

export function FixCard({ finding, suggestion, onGenerate, onAccept, onReject, onRegenerate }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'inline' | 'sideBySide'>('inline');

  return (
    <article className="fixcard" data-status={suggestion?.status ?? 'none'}>
      <header className="fixcard__head">
        <h3 className="fixcard__title">{finding.message}</h3>
        <div className="fixcard__meta">
          <span className={`badge badge--cat-${finding.category}`}>{finding.category}</span>
          <span className={`badge badge--sev-${finding.severity}`}>{finding.severity}</span>
          <a className="fixcard__url" href={finding.url} target="_blank" rel="noreferrer">{finding.url}</a>
        </div>
      </header>

      {!suggestion && (
        <div className="fixcard__empty">
          <button className="btn btn--primary" onClick={() => onGenerate(finding.id)}>
            {t('fixes.action.generate')}
          </button>
        </div>
      )}

      {suggestion && (
        <>
          <div className="fixcard__diff">
            <div className="fixcard__diff-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={mode === 'sideBySide'}
                  onChange={(e) => setMode(e.target.checked ? 'sideBySide' : 'inline')}
                />
                {t('fixes.diff.sideBySide')}
              </label>
            </div>
            <DiffView before={suggestion.before} after={suggestion.after} mode={mode} />
          </div>
          <div className="fixcard__foot">
            <ConfidenceChip confidence={suggestion.confidence} />
            <p className="fixcard__rationale">{suggestion.rationale}</p>
            <p className="fixcard__model">
              {suggestion.model} · {suggestion.locale} ·{' '}
              {new Date(suggestion.createdAt).toLocaleString()}
            </p>
            {suggestion.status === 'pending' ? (
              <SuggestionActions
                onAccept={() => onAccept(suggestion.id)}
                onReject={() => onReject(suggestion.id)}
                onRegenerate={() => onRegenerate(suggestion.id)}
              />
            ) : (
              <span className={`fixcard__status fixcard__status--${suggestion.status}`}>
                {t(`fixes.status.${suggestion.status}`)}
              </span>
            )}
          </div>
        </>
      )}
    </article>
  );
}