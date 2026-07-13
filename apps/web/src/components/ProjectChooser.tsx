import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getProject, humanError, type Project } from '../api.js';
import { ErrorState } from './states/index.js';
import { EmptyState } from './states/index.js';

export interface ProjectChooserProps {
  projects: Project[];
  loading: boolean;
  onPick: (projectId: string) => void;
  /** i18n key for the chooser title. */
  titleKey?: string;
  /** i18n key for the chooser hint. */
  hintKey?: string;
  /** Label for the pick button. */
  pickLabelKey?: string;
  /** True when a project context was resolved but had no data (e.g. no audits). */
  hasProjectContext?: boolean;
  /** Empty-state kind when no projects exist. */
  emptyKind?: 'no-projects' | 'no-audits';
}

/**
 * Shared project picker used by FixesPage and the project-scoped nav gates
 * (Materials/Generations/Channels). Picks a project, then calls onPick.
 */
export function ProjectChooser({
  projects,
  loading,
  onPick,
  titleKey = 'chooser.title',
  hintKey = 'chooser.hint',
  pickLabelKey = 'chooser.pick',
  hasProjectContext = false,
  emptyKind = 'no-projects',
}: ProjectChooserProps) {
  const { t } = useTranslation();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function handlePick(p: Project) {
    setError(null);
    setPendingId(p.id);
    try {
      await onPick(p.id);
    } catch (e) {
      setError(e);
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <p>…</p>;
  if (projects.length === 0) {
    return <EmptyState kind={emptyKind} />;
  }
  return (
    <div className="fixes-page__chooser">
      <h2 className="fixes-page__chooser-title">{t(titleKey)}</h2>
      <p className="muted">{t(hintKey)}</p>
      {error != null &&
        (() => {
          const e = humanError(error);
          return (
            <ErrorState
              titleKey={e.key}
              {...(e.params ? { params: e.params } : {})}
              {...(e.retry ? { retry: e.retry } : {})}
              onRetry={() => setError(null)}
            />
          );
        })()}
      <ul className="fixes-page__chooser-list">
        {projects.map((p) => (
          <li key={p.id} className="card">
            <div className="fixes-page__chooser-row">
              <div>
                <div className="fixes-page__chooser-name">{p.name}</div>
                <div className="muted mono">{p.rootUrl}</div>
              </div>
              <button
                className="btn btn--sm btn--primary"
                disabled={pendingId === p.id}
                onClick={() => handlePick(p)}
              >
                {pendingId === p.id ? t('common.loading') : t(pickLabelKey)}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
