import { useTranslation } from 'react-i18next';
import { renderCategoryBarsSvg } from '@jheo/core/reports/charts';

interface Props {
  byCategory: Record<string, number | null>;
}

export function CategoryBarChart({ byCategory }: Props) {
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    seo: t('audit.categories.seo'),
    cwv: t('audit.categories.cwv'),
    geo: t('audit.categories.geo'),
    a11y: t('audit.categories.a11y'),
    content: t('audit.categories.content'),
  };
  return (
    <div
      dangerouslySetInnerHTML={{ __html: renderCategoryBarsSvg(byCategory, labels) }}
      aria-label={t('audit.executive.sections.scores')}
    />
  );
}
