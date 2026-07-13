import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createProject, humanError, listProjects } from '../api.js';
import { EmptyState, ErrorState } from '../components/states/index.js';
import { localePath } from '../i18n/localePath.js';
import { isValidProjectUrlInput, normalizeProjectUrl } from '../lib/projectUrl.js';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

function LoadingSkeleton() {
  return (
    <div className="col" style={{ gap: 'var(--space-3)' }}>
      <div className="skeleton skeleton--card" />
      <div className="skeleton skeleton--card" />
    </div>
  );
}

export function ProjectsList() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects });
  const [name, setName] = useState('');
  const [rootUrl, setRootUrl] = useState('https://');
  const [urlError, setUrlError] = useState(false);
  const create = useMutation({
    mutationFn: (input: { name: string; rootUrl: string }) =>
      createProject({ domain: normalizeProjectUrl(input.rootUrl) }).then((p) => ({ ...p, name: input.name })),
    onSuccess: async (p) => {
      await qc.invalidateQueries({ queryKey: ['projects'] });
      // Clear the inputs only on success. Clearing on submit would wipe
      // `name` before the error-state retry closure captures it, so a
      // failed create would retry with an empty payload.
      setName('');
      navigate(localePath('projectDashboard', { projectId: p.id }));
    },
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('projects.title')}</h1>
          <p className="page__subtitle">{t('projects.subtitle')}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card__title">{t('projects.create.label')}</div>
        <p className="tiny" style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-4)' }}>
          {t('projects.create.hint')}
        </p>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidProjectUrlInput(rootUrl)) {
              setUrlError(true);
              return;
            }
            setUrlError(false);
            create.mutate({ name, rootUrl });
          }}
        >
          <input
            id="new-project-name"
            className="input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('projects.create.namePlaceholder')}
          />
          <input
            className="input"
            required
            value={rootUrl}
            onChange={(e) => {
              setRootUrl(e.target.value);
              if (urlError) setUrlError(false);
            }}
            placeholder={t('projects.create.urlPlaceholder')}
          />
          <button className="btn btn--primary" type="submit" disabled={create.isPending}>
            {create.isPending ? t('projects.create.creating') : t('projects.create.submit')}
          </button>
        </form>
        {urlError && (
          <p className="tiny" role="alert" style={{ color: 'var(--danger)', marginTop: 'var(--space-2)' }}>
            {t('projects.create.urlInvalid')}
          </p>
        )}
        {create.isError &&
          (() => {
            const e = humanError(create.error);
            return (
              <ErrorState
                titleKey={e.key}
                {...(e.params ? { params: e.params } : {})}
                {...(e.retry ? { retry: e.retry } : {})}
                onRetry={() => create.mutate({ name, rootUrl })}
                className="tiny"
              />
            );
          })()}
      </div>

      {projects.isLoading && <LoadingSkeleton />}

      {projects.isError &&
        (() => {
          const e = humanError(projects.error);
          return (
            <ErrorState
              titleKey={e.key}
              {...(e.params ? { params: e.params } : {})}
              {...(e.retry ? { retry: e.retry } : {})}
              onRetry={() => void projects.refetch()}
            />
          );
        })()}

      {projects.data && projects.data.length === 0 && !projects.isLoading && (
        <EmptyState
          titleKey="projects.empty.title"
          hintKey="projects.empty.hint"
          cta={{ to: '/projects#new-project-name', labelKey: 'projects.empty.action' }}
        >
          <svg viewBox="0 0 56 56">
            <rect x="8" y="14" width="40" height="32" rx="3" />
            <path d="M8 22h40" />
            <path d="M14 14V8" />
            <path d="M42 14V8" />
            <circle cx="20" cy="32" r="2" />
            <path d="M28 32h12" />
            <path d="M28 38h8" />
          </svg>
        </EmptyState>
      )}

      {projects.data && projects.data.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>{t('projects.table.name')}</th>
                <th>{t('projects.table.rootUrl')}</th>
                <th style={{ width: 120, textAlign: 'right' }}>{t('projects.table.created')}</th>
              </tr>
            </thead>
            <tbody>
              {projects.data.map((p) => (
                <tr
                  key={p.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(localePath('projectDashboard', { projectId: p.id }))}
                >
                  <td>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                  </td>
                  <td className="mono tiny">{p.rootUrl}</td>
                  <td className="tiny tabular" style={{ textAlign: 'right' }}>
                    {formatDate(p.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}