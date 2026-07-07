import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createMaterial, deleteMaterial, listMaterials, type Material } from '../api.js';

const TYPES: { value: 'url' | 'note' | 'file'; label: string; hint: string }[] = [
  { value: 'note', label: 'Note', hint: 'Inline text the generator uses as a source' },
  { value: 'url', label: 'URL', hint: 'Fetch and embed a webpage' },
  { value: 'file', label: 'File', hint: 'Upload a document (PDF / markdown)' },
];

export function MaterialsList() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const materials = useQuery({
    queryKey: ['materials', projectId],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
  });
  const [type, setType] = useState<'note' | 'url' | 'file'>('note');
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

  const placeholder = type === 'note'
    ? 'Apples are red and crisp. The scientific name is Malus domestica.'
    : type === 'url'
    ? 'https://example.com/blog/apples'
    : 'filename.pdf';

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to="/projects" className="muted tiny">Projects</Link>
            <span className="muted tiny">/</span>
            <Link to={`/projects/${projectId}`} className="muted tiny">{projectId?.slice(0, 8)}</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">materials</span>
          </div>
          <h1 className="page__title">Materials</h1>
          <p className="page__subtitle">
            Sources the generator uses for context. They get embedded on the fly and retrieved by
            similarity when composing a new generation.
          </p>
        </div>
        <Link to={`/projects/${projectId}/compose`} className="btn btn--primary">
          Generate from materials
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card__title">Add material</div>

        <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={'btn btn--sm ' + (type === t.value ? 'btn--primary' : 'btn--secondary')}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          ))}
          <span className="tiny muted" style={{ marginLeft: 'var(--space-2)' }}>
            {TYPES.find((t) => t.value === type)?.hint}
          </span>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          className="col"
          style={{ gap: 'var(--space-3)' }}
        >
          <div className="field">
            <label className="field__label">Title</label>
            <input
              className="input"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Apple facts"
            />
          </div>
          <div className="field">
            <label className="field__label">{type === 'file' ? 'Filename' : type === 'url' ? 'URL' : 'Source'}</label>
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
              {create.isPending ? 'Adding…' : 'Add material'}
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

      {materials.data && materials.data.length === 0 && !materials.isLoading && (
        <div className="empty">
          <div className="empty__art">
            <svg viewBox="0 0 56 56">
              <rect x="10" y="10" width="36" height="36" rx="3" />
              <path d="M10 18h36" />
              <path d="M18 26h20" />
              <path d="M18 32h14" />
            </svg>
          </div>
          <p className="empty__title">No materials yet</p>
          <p className="empty__hint">
            Add at least one source above before composing a generation. The generator retrieves
            the most semantically similar ones per prompt.
          </p>
        </div>
      )}

      {materials.data && materials.data.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Title</th>
                <th>Type</th>
                <th style={{ width: 100, textAlign: 'right' }}>Size</th>
                <th style={{ width: 130 }}>Embedding</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {materials.data.map((m) => (
                <MaterialRow
                  key={m.id}
                  material={m}
                  onRemove={() => {
                    if (confirm(`Delete material "${m.title}"?`)) remove.mutate(m.id);
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
        {material.charCount.toLocaleString()} chars
      </td>
      <td>
        <span className={`badge badge--${material.embeddingStatus === 'ready' ? 'completed' : 'queued'}`}>
          {material.embeddingStatus}
        </span>
      </td>
      <td style={{ textAlign: 'right' }}>
        <button className="btn btn--ghost btn--sm" onClick={onRemove} title="Delete">
          ×
        </button>
      </td>
    </tr>
  );
}