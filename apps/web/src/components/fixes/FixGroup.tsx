import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Suggestion } from '../../api.js';
import { FixCard } from './FixCard.js';
import type { FindingLike } from './FixCard.js';

export type FixGroupData = {
  // Stable identifier (category::rule) so React keys don't shift on re-render.
  key: string;
  rule: string;
  category: string;
  severity: string;
  message: string;
  findings: FindingLike[];
};

type Props = {
  group: FixGroupData;
  suggestions: Record<string, Suggestion>;
  onGenerate: (findingId: string) => void;
  onAccept: (suggestionId: string) => void;
  onReject: (suggestionId: string) => void;
  onRegenerate: (suggestionId: string) => void;
  // Drill-down callback when the user clicks a page in the list.
  onOpen: (findingId: string) => void;
};

const PAGE_COLLAPSE_THRESHOLD = 8;

export function FixGroup({
  group,
  suggestions,
  onGenerate,
  onAccept,
  onReject,
  onRegenerate,
  onOpen,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // Findings with an existing suggestion (most recent by createdAt).
  const withSuggestion = group.findings.filter((f) => suggestions[f.id]);
  const withoutSuggestion = group.findings.filter((f) => !suggestions[f.id]);
  const counts = countByStatus(group.findings, suggestions);

  // Surface the freshest suggestion in-place so the user sees the diff next
  // to the rule summary rather than buried at the bottom of a 14-row list.
  const headSuggestion = withSuggestion
    .map((f) => suggestions[f.id]!)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  const headFinding = headSuggestion
    ? (group.findings.find((f) => f.id === headSuggestion.findingId) ?? null)
    : null;

  const showAll = expanded || group.findings.length <= PAGE_COLLAPSE_THRESHOLD;
  const visiblePages = showAll ? group.findings : group.findings.slice(0, PAGE_COLLAPSE_THRESHOLD);

  return (
    <article className="fixgroup" data-severity={group.severity}>
      <header className="fixgroup__head">
        <div className="fixgroup__head-main">
          <h3 className="fixgroup__title">{group.message}</h3>
          <div className="fixgroup__meta">
            <span className={`badge badge--cat-${group.category}`}>{group.category}</span>
            <span className={`badge badge--sev-${group.severity}`}>{group.severity}</span>
            <code className="mono muted">{group.rule}</code>
          </div>
        </div>
        <div
          className="fixgroup__counts"
          aria-label={t('fixes.group.count', { count: group.findings.length })}
        >
          <span className="fixgroup__count-num">{group.findings.length}</span>
          <span className="muted">{t('fixes.group.count', { count: group.findings.length })}</span>
        </div>
      </header>

      {(counts.pending > 0 || counts.accepted > 0 || counts.rejected > 0) && (
        <ul className="fixgroup__status-row" aria-label={t('fixes.stats.label')}>
          {counts.accepted > 0 && (
            <li>
              <span className="fixgroup__status-dot fixgroup__status-dot--accepted" />
              {counts.accepted} {t('fixes.status.accepted')}
            </li>
          )}
          {counts.pending > 0 && (
            <li>
              <span className="fixgroup__status-dot fixgroup__status-dot--pending" />
              {counts.pending} {t('fixes.status.pending')}
            </li>
          )}
          {counts.rejected > 0 && (
            <li>
              <span className="fixgroup__status-dot fixgroup__status-dot--rejected" />
              {counts.rejected} {t('fixes.status.rejected')}
            </li>
          )}
          {withoutSuggestion.length > 0 && (
            <li>
              <span className="fixgroup__status-dot fixgroup__status-dot--none" />
              {withoutSuggestion.length} {t('fixes.group.withoutSuggestion')}
            </li>
          )}
        </ul>
      )}

      {headFinding && headSuggestion && (
        <div className="fixgroup__head-suggestion">
          <FixCard
            finding={headFinding}
            suggestion={headSuggestion}
            onGenerate={onGenerate}
            onAccept={onAccept}
            onReject={onReject}
            onRegenerate={onRegenerate}
          />
        </div>
      )}

      <ul className="fixgroup__pages">
        {visiblePages.map((f) => {
          const s = suggestions[f.id];
          return (
            <li key={f.id} className="fixgroup__page" data-status={s?.status ?? 'none'}>
              <a
                className="fixgroup__page-url mono"
                href={f.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={f.url}
              >
                {shortenUrl(f.url)}
              </a>
              {s ? (
                <span className={`fixgroup__page-status fixgroup__page-status--${s.status}`}>
                  {t(`fixes.status.${s.status}`)}
                </span>
              ) : (
                <button
                  className="btn btn--sm btn--primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate(f.id);
                  }}
                >
                  {t('fixes.action.generate')}
                </button>
              )}
              <button
                className="btn btn--sm btn--link fixgroup__page-open"
                onClick={() => onOpen(f.id)}
                title={t('fixes.group.openFinding')}
              >
                {t('fixes.group.openFinding')} →
              </button>
            </li>
          );
        })}
      </ul>

      {group.findings.length > PAGE_COLLAPSE_THRESHOLD && (
        <button
          className="btn btn--sm btn--link fixgroup__expand"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded
            ? t('fixes.group.collapse')
            : t('fixes.group.expand', { count: group.findings.length - PAGE_COLLAPSE_THRESHOLD })}
        </button>
      )}
    </article>
  );
}

function countByStatus(
  findings: FindingLike[],
  suggestions: Record<string, Suggestion>,
): { pending: number; accepted: number; rejected: number } {
  let pending = 0;
  let accepted = 0;
  let rejected = 0;
  for (const f of findings) {
    const s = suggestions[f.id];
    if (!s) continue;
    if (s.status === 'pending') pending += 1;
    else if (s.status === 'accepted') accepted += 1;
    else if (s.status === 'rejected') rejected += 1;
  }
  return { pending, accepted, rejected };
}

function shortenUrl(url: string): string {
  // Strip protocol + trailing slash to keep the chip width bounded.
  const noProto = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (noProto.length <= 60) return noProto;
  return noProto.slice(0, 28) + '…' + noProto.slice(-28);
}
