import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Finding, FindingDiff } from '../api.js';
import { useDataTranslations } from '../i18n/useDataTranslations';

const SEV_CLASS: Record<Finding['severity'], string> = {
  info: 'sev--info',
  warning: 'sev--warning',
  error: 'sev--error',
};

type FindingWithOptionalDiff = Finding & { diff?: FindingDiff };

type FixedItem = {
  id: string;
  category: string;
  severity: string;
  rule: string;
  message: string;
  url: string;
};

type TranslationError = 'no_llm_provider' | 'rate_limited' | null;

/**
 * Build a translation key for the given error code, or empty if none.
 * The parity test guarantees `errors.no_llm_provider` and `errors.rate_limited`
 * exist in both catalogs, so callers can render `t(errorLabel(error))` directly.
 */
function errorKey(error: TranslationError): string {
  if (!error) return '';
  return `errors.${error}`;
}

export type FindingListItem = FindingWithOptionalDiff;

interface Props {
  findings: FindingListItem[];
  byCategory?: Record<string, FindingListItem[]>;
  fixed?: FixedItem[];
}

export function FindingList({ findings, byCategory, fixed }: Props) {
  const { t } = useTranslation();
  const messageTexts = useMemo(() => findings.map((f) => f.message), [findings]);
  const { translated, error } = useDataTranslations({
    texts: messageTexts,
    sourceLocale: 'en',
    context: 'finding',
  });
  return (
    <div>
      {fixed && fixed.length > 0 && (
        <section
          className="card"
          style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}
        >
          <h3 style={{ margin: 0, marginBottom: 'var(--space-3)', fontSize: 'var(--fs-md)' }}>
            {t('findings.list.fixedTitle')} ({fixed.length})
          </h3>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {fixed.map((f) => (
              <li key={f.id}>
                <span className={`tag tag--${f.severity}`}>{f.severity}</span>{' '}
                <strong>{f.rule}</strong>: {f.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {findings.length === 0 ? (
        <div className="empty">
          <div className="empty__art">
            <svg viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="20" />
              <path d="M18 28l8 8 14-16" />
            </svg>
          </div>
          <p className="empty__title">{t('findings.list.noFindings.title')}</p>
          <p className="empty__hint">{t('findings.list.noFindings.hint')}</p>
        </div>
      ) : byCategory ? (
        <div className="col" style={{ gap: 'var(--space-6)' }}>
          {Object.entries(byCategory).map(([category, items]) => (
            <section key={category}>
              <h3
                style={{
                  fontSize: 'var(--fs-md)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  margin: 0,
                  marginBottom: 'var(--space-3)',
                }}
              >
                {category} <span className="tabular muted" style={{ marginLeft: 4 }}>· {items.length}</span>
              </h3>
              <div className="finding-list">
                {items.map((f) => (
                  <FindingCard
                    key={f.id}
                    finding={f}
                    translated={translated}
                    error={error}
                    translationUnavailableLabel={t('topbar.translationUnavailable')}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="finding-list">
          {findings.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              translated={translated}
              error={error}
              translationUnavailableLabel={t('topbar.translationUnavailable')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  translated,
  error,
  translationUnavailableLabel,
}: {
  finding: FindingListItem;
  translated: Map<string, string>;
  error: 'no_llm_provider' | 'rate_limited' | null;
  translationUnavailableLabel: string;
}) {
  const { t } = useTranslation();
  const url = (() => {
    try {
      return (
        new URL(finding.url).hostname +
        (finding.selector ? ' › ' + finding.selector : '')
      );
    } catch {
      return finding.url;
    }
  })();
  const messageText = translated.get(finding.message) ?? finding.message;
  const errorText = error ? (t(errorKey(error), { defaultValue: translationUnavailableLabel })) : '';
  const navigate = useNavigate();
  return (
    <article className="finding">
      <div className={'finding__sev ' + SEV_CLASS[finding.severity]}>
        {finding.severity}
        {finding.diff && (
          <span className={`diff-badge diff-badge--${finding.diff.toLowerCase()}`}>
            {finding.diff}
          </span>
        )}
      </div>
      <div>
        <div className="finding__rule">{finding.rule}</div>
        <div className="finding__msg">
          {messageText}
          {error && (
            <span className="translation-unavailable" aria-label={errorText} title={errorText}> ↻</span>
          )}
        </div>
      </div>
      <div className="finding__meta">
        <div>{finding.category}</div>
        <a href={finding.url} target="_blank" rel="noreferrer" title={finding.url}>
          {url.length > 38 ? url.slice(0, 38) + '…' : url} ↗
        </a>
        <button
          className="btn btn--sm btn--link"
          onClick={() => navigate(`/fixes?findingId=${finding.id}`)}
        >
          {t('fixes.action.generate')}
        </button>
      </div>
    </article>
  );
}