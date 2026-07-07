import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createGeneration, listGenerations, listMaterials, listTemplates } from '../api.js';

export function GenerationComposer() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const materials = useQuery({
    queryKey: ['materials', projectId],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
  });
  const templates = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const generations = useQuery({
    queryKey: ['generations', projectId],
    queryFn: () => listGenerations(projectId!),
    enabled: !!projectId,
    refetchInterval: 4000,
  });

  const activeTemplate = templates.data?.find((t) => t.isActive);
  const [templateId, setTemplateId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'openrouter'>('openai');
  const [model, setModel] = useState('MiniMax-M3');
  const [temperature, setTemperature] = useState(0.7);

  const create = useMutation({
    mutationFn: () =>
      createGeneration(projectId!, {
        prompt,
        templateId: templateId || activeTemplate?.id || '',
        materialIds,
        llmConfig: { provider, model, temperature },
      }),
    onSuccess: async (g) => {
      await qc.invalidateQueries({ queryKey: ['generations', projectId] });
      navigate(`/generations/${g.id}`);
    },
  });

  const submitDisabled = !prompt || (!templateId && !activeTemplate) || create.isPending;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to="/projects" className="muted tiny">Projects</Link>
            <span className="muted tiny">/</span>
            <Link to={`/projects/${projectId}`} className="muted tiny">{projectId?.slice(0, 8)}</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">compose</span>
          </div>
          <h1 className="page__title">Compose generation</h1>
          <p className="page__subtitle">
            Pick a template + materials, write a prompt, choose the LLM. The worker retrieves the
            top-K most similar materials by embedding and feeds them to the model.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 340px',
          gap: 'var(--space-6)',
          alignItems: 'start',
        }}
      >
        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          className="col"
          style={{ gap: 'var(--space-4)' }}
        >
          <div className="card">
            <div className="card__title">Template</div>
            <div className="field" style={{ marginTop: 'var(--space-3)' }}>
              <select
                className="select"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">
                  {activeTemplate
                    ? `Active · ${activeTemplate.name} (v${activeTemplate.version})`
                    : 'Select a template'}
                </option>
                {templates.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (v{t.version}){t.isActive ? ' · active' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card">
            <div className="card__title">Prompt</div>
            <div className="field" style={{ marginTop: 'var(--space-3)' }}>
              <textarea
                className="textarea"
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Write a short blog post about apples"
                rows={3}
              />
            </div>
          </div>

          <div className="card">
            <div className="card__title">Materials</div>
            <p className="tiny muted" style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
              {materialIds.length === 0
                ? 'None selected — generator will rely on the prompt alone.'
                : `${materialIds.length} selected.`}
            </p>
            {materials.data && materials.data.length === 0 ? (
              <p className="tiny muted">
                No materials yet. <Link to={`/projects/${projectId}/materials`}>Add some →</Link>
              </p>
            ) : (
              <div className="col" style={{ gap: 'var(--space-2)', maxHeight: 240, overflowY: 'auto' }}>
                {materials.data?.map((m) => (
                  <label key={m.id} className="row" style={{ gap: 'var(--space-2)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={materialIds.includes(m.id)}
                      onChange={(e) => {
                        setMaterialIds((cur) =>
                          e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id),
                        );
                      }}
                    />
                    <span style={{ flex: 1 }}>{m.title}</span>
                    <span className="tiny tabular muted">{m.charCount} chars</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card__title">Model</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 120px',
                gap: 'var(--space-3)',
                marginTop: 'var(--space-3)',
              }}
            >
              <div className="field">
                <label className="field__label">Provider</label>
                <select className="select" value={provider} onChange={(e) => setProvider(e.target.value as 'openai' | 'anthropic' | 'openrouter')}>
                  <option value="openai">openai (OpenAI-compat)</option>
                  <option value="anthropic">anthropic</option>
                  <option value="openrouter">openrouter</option>
                </select>
              </div>
              <div className="field">
                <label className="field__label">Model</label>
                <input
                  className="input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="MiniMax-M3"
                />
              </div>
              <div className="field">
                <label className="field__label">Temperature</label>
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            {create.isError && (
              <span className="tiny" style={{ color: 'var(--danger)' }}>
                {(create.error as Error).message}
              </span>
            )}
            <button type="submit" className="btn btn--primary" disabled={submitDisabled}>
              {create.isPending ? 'Queueing…' : 'Compose generation'}
            </button>
          </div>
        </form>

        <aside className="card">
          <div className="card__title">Recent generations</div>
          {generations.isLoading && <p className="tiny muted">Loading…</p>}
          {generations.data && generations.data.length === 0 && (
            <p className="tiny muted">No generations yet.</p>
          )}
          {generations.data && generations.data.length > 0 && (
            <div className="col" style={{ gap: 0 }}>
              {generations.data.slice(0, 6).map((g, i) => (
                <Link
                  key={g.id}
                  to={`/generations/${g.id}`}
                  style={{
                    display: 'block',
                    padding: i > 0 ? 'var(--space-3) 0 0' : 0,
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div className="spread">
                    <span className="tiny mono muted">{g.id.slice(0, 10)}…</span>
                    <span className={`badge badge--${g.status}`}>{g.status}</span>
                  </div>
                  <p className="tiny" style={{ margin: '4px 0 0', color: 'var(--text-dim)' }}>
                    {g.prompt.length > 60 ? g.prompt.slice(0, 60) + '…' : g.prompt}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}