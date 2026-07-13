import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { setLocale, type SupportedLocale } from '../i18n';
import { LOCALE_NAMES } from '../i18n/locale';
import { activeLocale, siblingPath } from '../i18n/localePath';

const LOCALES: SupportedLocale[] = ['en', 'pt-BR'];

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

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

  function pickLocale(loc: SupportedLocale) {
    if (loc === activeLocale()) {
      setOpen(false);
      return;
    }
    const target = siblingPath(activeLocale(), loc, location.pathname);
    setLocale(loc);
    // replace so the locale toggle doesn't pollute history
    navigate(target + (location.search ?? '') + (location.hash ?? ''), { replace: true });
    setOpen(false);
  }

  return (
    <div className="lang-toggle" ref={ref}>
      <button
        type="button"
        className="lang-toggle__btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('topbar.language')}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>{LOCALE_NAMES[(i18n.language as SupportedLocale) ?? 'en']}</span>
      </button>
      {open && (
        <div className="lang-toggle__menu" role="radiogroup" aria-label={t('topbar.language')}>
          {LOCALES.map((loc) => (
            <label key={loc} className="lang-toggle__option">
              <input
                type="radio"
                name="lang"
                value={loc}
                checked={i18n.language === loc}
                onChange={() => pickLocale(loc)}
              />
              <span>{LOCALE_NAMES[loc]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
