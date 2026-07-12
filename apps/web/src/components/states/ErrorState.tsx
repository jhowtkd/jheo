import { useTranslation } from 'react-i18next';

export interface ErrorStateProps {
  /** i18n key for the title (humanError yields this). */
  titleKey: string;
  /** Interpolation params for the title. */
  params?: Record<string, string | number>;
  /** Optional i18n key for a hint shown below the title. */
  hintKey?: string;
  /** When true and onRetry is provided, renders a "try again" button. */
  retry?: boolean;
  /** Retry callback; the button renders only when retry && onRetry are both present. */
  onRetry?: () => void;
  /** ARIA role; defaults to 'alert' (matches FixesPage:359). */
  role?: 'alert';
  /** Extra class names for layout (e.g. 'tiny' for inline contexts). */
  className?: string;
}

export function ErrorState({
  titleKey,
  params,
  hintKey,
  retry,
  onRetry,
  role = 'alert',
  className,
}: ErrorStateProps) {
  const { t } = useTranslation();
  const showRetry = retry && onRetry;
  return (
    <div className={`error-state${className ? ` ${className}` : ''}`} role={role}>
      <p className="error-state__title">{t(titleKey, { ...params })}</p>
      {hintKey && <p className="error-state__hint">{t(hintKey)}</p>}
      {showRetry && (
        <button className="btn btn--sm btn--primary error-state__retry" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
