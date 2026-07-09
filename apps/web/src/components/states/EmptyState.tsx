import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export interface EmptyStateProps {
  /** i18n key for the title. */
  titleKey: string;
  /** Optional i18n key for a hint shown below the title. */
  hintKey?: string;
  /** Optional CTA rendered as a Link. */
  cta?: { to: string; labelKey: string };
  /** Escape hatch for rich art (SVG) or custom content. */
  children?: ReactNode;
  /** Extra class names. */
  className?: string;
}

export function EmptyState({ titleKey, hintKey, cta, children, className }: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className={`empty${className ? ` ${className}` : ''}`}>
      {children && <div className="empty__art">{children}</div>}
      <p className="empty__title">{t(titleKey)}</p>
      {hintKey && <p className="empty__hint">{t(hintKey)}</p>}
      {cta && (
        <Link to={cta.to} className="btn btn--primary empty__action">
          {t(cta.labelKey)}
        </Link>
      )}
    </div>
  );
}
