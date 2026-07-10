import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

// Kind discriminant → COPY defaults. Lets callers render a known variant
// by name (like EmptyFixesState) instead of re-specifying all keys. This is
// the spec-frozen contract (S0 design doc lines ~58-65): the shared COPY
// holds the three EmptyFixesState entries keyed by their kind strings so
// S2's migration of EmptyFixesState → <EmptyState kind="..."/> is mechanical.
// Explicit titleKey/hintKey/cta props override the kind's defaults.
const COPY: Record<string, { titleKey: string; hintKey?: string; cta?: { to: string; labelKey: string } }> = {
  'no-findings': { titleKey: 'fixes.empty' },
  'no-audits': { titleKey: 'fixes.chooseProject.noAudits' },
  'no-projects': {
    titleKey: 'fixes.chooseProject.noProjects',
    cta: { to: '/projects', labelKey: 'fixes.chooseProject.goProjects' },
  },
};

export interface EmptyStateProps {
  /** Known variant from the COPY record. Explicit props below override the kind's defaults. */
  kind?: string;
  /** i18n key for the title (overrides kind default). Required when no kind given. */
  titleKey?: string;
  /** Optional i18n key for a hint shown below the title. */
  hintKey?: string;
  /** Optional CTA rendered as a Link. */
  cta?: { to: string; labelKey: string };
  /** Escape hatch for rich art (SVG) or custom content. */
  children?: ReactNode;
  /** Extra class names. */
  className?: string;
}

export function EmptyState({ kind, titleKey, hintKey, cta, children, className }: EmptyStateProps) {
  const { t } = useTranslation();
  const base = kind ? COPY[kind] : undefined;
  const resolvedTitle = titleKey ?? base?.titleKey;
  const resolvedHint = hintKey ?? base?.hintKey;
  const resolvedCta = cta ?? base?.cta;
  if (!resolvedTitle) {
    throw new Error('EmptyState requires either a known kind or an explicit titleKey');
  }
  return (
    <div className={`empty${className ? ` ${className}` : ''}`}>
      {children && <div className="empty__art">{children}</div>}
      <p className="empty__title">{t(resolvedTitle)}</p>
      {resolvedHint && <p className="empty__hint">{t(resolvedHint)}</p>}
      {resolvedCta && (
        <Link to={resolvedCta.to} className="btn btn--primary empty__action">
          {t(resolvedCta.labelKey)}
        </Link>
      )}
    </div>
  );
}
