import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createGeneration, listMaterials, listTemplates, type Material } from '../api.js';

export function GenerationComposer() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const mats = useQuery({
    queryKey: ['materials', projectId],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
  });
  const tmpls = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const [prompt, setPrompt] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const toggleMaterial = (id: string, on: boolean) =>
    setSelectedMaterials((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'openrouter'>('openai');
  const [model, setModel] = useState('gpt-4o-mini');

  // One-shot: when templates arrive and the user hasn't picked one, default
  // to the active version. Lives in useEffect rather than the render body so
  // we don't trigger React's setState-during-render warning.
  useEffect(() => {
    if (!tmpls.data || templateId) return;
    const active = tmpls.data.find((t) => t.isActive);
    if (active) setTemplateId(active.id);
  }, [tmpls.data, templateId]);

  const create = useMutation({
    mutationFn: () =>
      createGeneration(projectId!, {
        prompt,
        templateId,
        materialIds: [...selectedMaterials],
        llmConfig: { provider, model },
      }),
    onSuccess: (gen) => navigate(`/generations/${gen.id}`),
  });

  return (
    <section>
      <h1>Compose</h1>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={6}
        placeholder="What should the post be about?"
        style={{ width: '100%' }}
      />
      <label>Template</label>
      <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
        {tmpls.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} v{t.version} {t.isActive ? '(active)' : ''}
          </option>
        ))}
      </select>
      <h3>Materials</h3>
      <ul>
        {mats.data?.map((m: Material) => (
          <li key={m.id}>
            <label>
              <input
                type="checkbox"
                checked={selectedMaterials.has(m.id)}
                onChange={(e) => toggleMaterial(m.id, e.target.checked)}
              />{' '}
              {m.title}
            </label>
          </li>
        ))}
      </ul>
      <label>Provider</label>
      <select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
        <option value="openai">openai</option>
        <option value="anthropic">anthropic</option>
        <option value="openrouter">openrouter</option>
      </select>
      <label>Model</label>
      <input value={model} onChange={(e) => setModel(e.target.value)} />
      <button onClick={() => create.mutate()} disabled={!prompt || !templateId}>
        Generate
      </button>
    </section>
  );
}
