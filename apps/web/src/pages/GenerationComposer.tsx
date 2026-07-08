import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createGeneration, listGenerations, listMaterials, listTemplates } from '../api.js';

export function GenerationComposer() {
  const { t } = useTranslation();
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
    refetchInterval: (query) => {
      const rows = query.state.data;
      if (!rows) return false;
      return rows.some((g) => g.status === 'running' || g.status === 'queued') ? 4000 : false;
    },
  });

  const activeTemplate = templates.data?.find((tt) => tt.isActive);
  const [templateId, setTemplateId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const selectedMaterialIds = useMemo(() => new Set(materialIds), [materialIds]);
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
            <Link to="/projects" className="muted tiny">{t('nav.projects')}</Link>
            <span className="muted tiny">/</span>
            <Link to={`/projects/${projectId}`} className="muted tiny">{projectId?.slice(0, 8)}</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{t('generation.composer.breadcrumb')}</span>
          </div>
          <h1 className="page__title">{t('generation.composer.title')}</h1>
          <p className="page__subtitle">{t('generation.composer.subtitle')}</p>
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
            <div className="card__title">{t('generation.composer.templateCard')}</div>
            <div className="field" style={{ marginTop: 'var(--space-3)' }}>
              <select
                className="select"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">
                  {activeTemplate
                    ? t('generation.composer.activeOption', { name: activeTemplate.name, version: activeTemplate.version })
                    : t('generation.composer.selectTemplate')}
                </option>
                {templates.data?.map((tt) => (
                  <option key={tt.id} value={tt.id}>
                    {tt.name} (v{tt.version}){tt.isActive ? t('generation.composer.optionActive') : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card">
            <div className="card__title">{t('generation.composer.promptCard')}</div>
            <div className="field" style={{ marginTop: 'var(--space-3)' }}>
              <textarea
                className="textarea"
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('generation.composer.promptPlaceholder')}
                rows={3}
              />
            </div>
          </div>

          <div className="card">
            <div className="card__title">{t('generation.composer.materialsCard')}</div>
            <p className="tiny muted" style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
              {materialIds.length === 0
                ? t('generation.composer.noMaterials')
                : t('generation.composer.selectedCount', { count: materialIds.length })}
            </p>
            {materials.data && materials.data.length === 0 ? (
              <p className="tiny muted">
                {t('generation.composer.noMaterialsEmpty')}{' '}
                <Link to={`/projects/${projectId}/materials`}>{t('generation.composer.addMaterialsLink')}</Link>
              </p>
            ) : (
              <div className="col" style={{ gap: 'var(--space-2)', maxHeight: 240, overflowY: 'auto' }}>
                {materials.data?.map((m) => (
                  <label key={m.id} className="row" style={{ gap: 'var(--space-2)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedMaterialIds.has(m.id)}
                      onChange={(e) => {
                        setMaterialIds((cur) =>
                          e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id),
                        );
                      }}
                    />
                    <span style={{ flex: 1 }}>{m.title}</span>
                    <span className="tiny tabular muted">{m.charCount} {t('materials.table.chars')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card__title">{t('generation.composer.modelCard')}</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 120px',
                gap: 'var(--space-3)',
                marginTop: 'var(--space-3)',
              }}
            >
              <div className="field">
                <label className="field__label">{t('generation.composer.provider')}</label>
                <select className="select" value={provider} onChange={(e) => setProvider(e.target.value as 'openai' | 'anthropic' | 'openrouter')}>
                  <option value="openai">{t('generation.composer.providerOpenai')}</option>
                  <option value="anthropic">{t('generation.composer.providerAnthropic')}</option>
                  <option value="openrouter">{t('generation.composer.providerOpenrouter')}</option>
                </select>
              </div>
              <div className="field">
                <label className="field__label">{t('generation.composer.model')}</label>
                <input
                  className="input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="MiniMax-M3"
                />
              </div>
              <div className="field">
                <label className="field__label">{t('generation.composer.temperature')}</label>
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
              {create.isPending ? t('generation.composer.queueing') : t('generation.composer.submit')}
            </button>
          </div>
        </form>

        <aside className="card">
          <div className="card__title">{t('generation.composer.recentTitle')}</div>
          {generations.isLoading && <p className="tiny muted">{t('common.loading')}</p>}
          {generations.data && generations.data.length === 0 && (
            <p className="tiny muted">{t('generation.composer.noGenerations')}</p>
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