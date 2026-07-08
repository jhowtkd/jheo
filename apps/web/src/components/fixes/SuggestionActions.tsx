import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
};

export function SuggestionActions({ onAccept, onReject, onRegenerate }: Props) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<null | 'accept' | 'reject'>(null);
  return (
    <div className="actions">
      <button
        className="btn btn--primary"
        disabled={pending !== null}
        onClick={() => { setPending('accept'); onAccept(); setPending(null); }}
      >
        {t('fixes.action.accept')}
      </button>
      <button
        className="btn btn--ghost"
        disabled={pending !== null}
        onClick={() => { setPending('reject'); onReject(); setPending(null); }}
      >
        {t('fixes.action.reject')}
      </button>
      <button
        className="btn btn--link"
        disabled={pending !== null}
        onClick={() => onRegenerate()}
      >
        {t('fixes.action.regenerate')}
      </button>
    </div>
  );
}