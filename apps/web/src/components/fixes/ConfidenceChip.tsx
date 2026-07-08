import { useTranslation } from 'react-i18next';
import type { SuggestionConfidence } from '../../api.js';

type Props = { confidence: SuggestionConfidence };

export function ConfidenceChip({ confidence }: Props) {
  const { t } = useTranslation();
  const label = t(`fixes.confidence.${confidence}`);
  return (
    <span className={`confidence-chip confidence-chip--${confidence}`} title={label}>
      {label}
    </span>
  );
}
