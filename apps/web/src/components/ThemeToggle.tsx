import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { applyTheme, type Theme } from '../theme/theme.js';

const THEMES: Theme[] = ['light', 'dark'];

function themeLabelKey(theme: Theme): string {
  return theme === 'light' ? 'topbar.themeLight' : 'topbar.themeDark';
}

export function ThemeToggle() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.getAttribute('data-theme') as Theme | null) ?? 'light',
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="lang-toggle" ref={ref}>
      <button
        type="button"
        className="lang-toggle__btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('topbar.theme')}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        <span>{t(themeLabelKey(theme))}</span>
      </button>
      {open && (
        <div className="lang-toggle__menu" role="radiogroup" aria-label={t('topbar.theme')}>
          {THEMES.map((th) => (
            <label key={th} className="lang-toggle__option">
              <input
                type="radio"
                name="theme"
                value={th}
                checked={theme === th}
                onChange={() => {
                  applyTheme(th);
                  setTheme(th);
                  setOpen(false);
                }}
              />
              <span>{t(themeLabelKey(th))}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
