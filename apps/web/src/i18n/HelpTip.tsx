import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function HelpTip({ term }: { term: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const text = t(`help.${term}`, { defaultValue: '' });

  return (
    <span className="help-tip" ref={ref}>
      <button
        type="button"
        className="help-tip__btn"
        aria-label={`? ${t(`help.${term}`, { defaultValue: '' })}`}
        aria-describedby={open ? `help-${term}` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        ?
      </button>
      {open && text && (
        <span role="dialog" id={`help-${term}`} className="help-tip__popover">
          {text}
        </span>
      )}
    </span>
  );
}
