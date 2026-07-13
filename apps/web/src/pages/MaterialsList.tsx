import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { createMaterial, deleteMaterial, humanError, listMaterials, type Material } from '../api.js';
import { EmptyState, ErrorState } from '../components/states/index.js';
import { localePath } from '../i18n/localePath.js';

type MaterialType = 'url' | 'note' | 'file';

export function MaterialsList() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const materials = useQuery({
    queryKey: ['materials', projectId],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
  });
  const [type, setType] = useState<MaterialType>('note');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const create = useMutation({
    mutationFn: () => createMaterial(projectId!, { type, title, source }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['materials', projectId] });
      setTitle('');
      setSource('');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteMaterial(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['materials', projectId] }),
  });

  const TYPES: { value: MaterialType; label: string; hint: string }[] = [
    { value: 'note', label: t('materials.types.note.label'), hint: t('materials.types.note.hint') },
    { value: 'url', label: t('materials.types.url.label'), hint: t('materials.types.url.hint') },
    { value: 'file', label: t('materials.types.file.label'), hint: t('materials.types.file.hint') },
  ];

  const placeholder =
    type === 'note'
      ? t('materials.fields.notePlaceholder')
      : type === 'url'
        ? t('materials.fields.urlPlaceholder')
        : t('materials.fields.filePlaceholder');

  const sourceLabel =
    type === 'file'
      ? t('materials.fields.filename')
      : type === 'url'
        ? t('materials.fields.url')
        : t('materials.fields.source');

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to={localePath('projects')} className="muted tiny">{t('nav.projects')}</Link>
            <span className="muted tiny">/</span>
            <Link to={localePath('projectDashboard', { projectId: projectId! })} className="muted tiny">{projectId?.slice(0, 8)}</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{t('materials.breadcrumb')}</span>
          </div>
          <h1 className="page__title">{t('materials.title')}</h1>
          <p className="page__subtitle">{t('materials.subtitle')}</p>
        </div>
        <Link to={localePath('compose', { projectId: projectId! })} className="btn btn--primary">
          {t('materials.generate')}
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card__title">{t('materials.add')}</div>

        <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          {TYPES.map((tt) => (
            <button
              key={tt.value}
              type="button"
              className={'btn btn--sm ' + (type === tt.value ? 'btn--primary' : 'btn--secondary')}
              onClick={() => setType(tt.value)}
            >
              {tt.label}
            </button>
          ))}
          <span className="tiny muted" style={{ marginLeft: 'var(--space-2)' }}>
            {TYPES.find((tt) => tt.value === type)?.hint}
          </span>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          className="col"
          style={{ gap: 'var(--space-3)' }}
        >
          <div className="field">
            <label className="field__label">{t('materials.fields.title')}</label>
            <input
              className="input"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('materials.fields.titlePlaceholder')}
            />
          </div>
          <div className="field">
            <label className="field__label">{sourceLabel}</label>
            {type === 'note' ? (
              <textarea
                className="textarea"
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={placeholder}
                rows={5}
              />
            ) : (
              <input
                className="input"
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={placeholder}
              />
            )}
          </div>
          <div>
            <button className="btn btn--primary" type="submit" disabled={create.isPending}>
              {create.isPending ? t('materials.adding') : t('materials.add')}
            </button>
          </div>
        </form>
      </div>

      {materials.isLoading && (
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          <div className="skeleton skeleton--row" />
          <div className="skeleton skeleton--row" />
          <div className="skeleton skeleton--row" />
        </div>
      )}

      {materials.isError &&
        (() => {
          const e = humanError(materials.error);
          return (
            <ErrorState
              titleKey={e.key}
              {...(e.params ? { params: e.params } : {})}
              {...(e.retry ? { retry: e.retry } : {})}
              onRetry={() => void materials.refetch()}
            />
          );
        })()}

      {materials.data && materials.data.length === 0 && !materials.isLoading && (
        <EmptyState
          titleKey="materials.empty.title"
          hintKey="materials.empty.hint"
        >
          <svg viewBox="0 0 56 56">
            <rect x="10" y="10" width="36" height="36" rx="3" />
            <path d="M10 18h36" />
            <path d="M18 26h20" />
            <path d="M18 32h14" />
          </svg>
        </EmptyState>
      )}

      {materials.data && materials.data.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>{t('materials.table.title')}</th>
                <th>{t('materials.table.type')}</th>
                <th style={{ width: 100, textAlign: 'right' }}>{t('materials.table.size')}</th>
                <th style={{ width: 130 }}>{t('materials.table.embedding')}</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {materials.data.map((m) => (
                <MaterialRow
                  key={m.id}
                  material={m}
                  onRemove={() => {
                    if (confirm(t('materials.deleteConfirm', { title: m.title }))) remove.mutate(m.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MaterialRow({ material, onRemove }: { material: Material; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 500 }}>{material.title}</div>
        <div className="tiny mono muted">{material.id.slice(0, 12)}…</div>
      </td>
      <td className="tiny">
        <span className="badge badge--neutral">{material.type}</span>
      </td>
      <td className="tiny tabular muted" style={{ textAlign: 'right' }}>
        {material.charCount.toLocaleString()} {t('materials.table.chars')}
      </td>
      <td>
        <span className={`badge badge--${material.embeddingStatus === 'ready' ? 'completed' : 'queued'}`}>
          {material.embeddingStatus}
        </span>
      </td>
      <td style={{ textAlign: 'right' }}>
        <button className="btn btn--ghost btn--sm" onClick={onRemove} title={t('materials.deleteTitle')}>
          ×
        </button>
      </td>
    </tr>
  );
}