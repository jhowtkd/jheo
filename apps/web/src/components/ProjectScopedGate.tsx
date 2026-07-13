import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listProjects } from '../api.js';
import { getLastProjectId, setLastProjectId } from '../lib/lastProject.js';
import { ProjectChooser } from './ProjectChooser.js';

interface ProjectScopedGateProps {
  /** Where to redirect after a project is picked, with :projectId substituted. */
  redirectTemplate: string;
  /** i18n key for the chooser title. */
  titleKey?: string;
  /** i18n key for the chooser hint. */
  hintKey?: string;
  /** Label for the pick button. */
  pickLabelKey?: string;
}

/**
 * Gate page for global nav entries that are project-scoped (Materials,
 * Generations, Channels). Resolves ?projectId= or lastProjectId from
 * localStorage; if neither exists, shows a ProjectChooser and redirects
 * to the project-scoped route on pick.
 */
export function ProjectScopedGate({
  redirectTemplate,
  titleKey = 'chooser.title',
  hintKey = 'chooser.hint',
  pickLabelKey = 'chooser.pick',
}: ProjectScopedGateProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const resolvedId = params.get('projectId') ?? getLastProjectId();

  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects });

  // If we have a resolved project id, redirect immediately.
  useEffect(() => {
    if (resolvedId) {
      setLastProjectId(resolvedId);
      navigate(redirectTemplate.replace(':projectId', resolvedId), { replace: true });
    }
  }, [resolvedId, redirectTemplate, navigate]);

  if (resolvedId) return null;

  return (
    <div className="page">
      <ProjectChooser
        projects={projects.data ?? []}
        loading={projects.isLoading}
        onPick={async (pid) => {
          setLastProjectId(pid);
          navigate(redirectTemplate.replace(':projectId', pid), { replace: true });
        }}
        titleKey={titleKey}
        hintKey={hintKey}
        pickLabelKey={pickLabelKey}
      />
    </div>
  );
}
