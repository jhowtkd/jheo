import { useTranslation } from 'react-i18next';

export function EmptyFixesState() {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <p>{t('fixes.empty')}</p>
    </div>
  );
}