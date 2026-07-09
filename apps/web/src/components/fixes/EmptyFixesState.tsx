import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

type Kind = 'no-findings' | 'no-audits' | 'no-projects';

const COPY: Record<Kind, { key: string; cta?: { to: string; labelKey: string } }> = {
  'no-findings': { key: 'fixes.empty' },
  'no-audits': { key: 'fixes.chooseProject.noAudits' },
  'no-projects': {
    key: 'fixes.chooseProject.noProjects',
    cta: { to: '/projects', labelKey: 'fixes.chooseProject.goProjects' },
  },
};

export function EmptyFixesState({ kind = 'no-findings' }: { kind?: Kind }) {
  const { t } = useTranslation();
  const copy = COPY[kind];
  return (
    <div className="empty-state">
      <p>{t(copy.key)}</p>
      {copy.cta && (
        <Link to={copy.cta.to} className="btn btn--sm btn--primary" style={{ marginTop: 'var(--space-3)' }}>
          {t(copy.cta.labelKey)}
        </Link>
      )}
    </div>
  );
}
