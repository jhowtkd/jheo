import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTemplate, updateTemplate } from '../api.js';

export function TemplateEditor() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const t = useQuery({ queryKey: ['template', templateId], queryFn: () => getTemplate(templateId!) });
  const [prompt, setPrompt] = useState('');
  const [schema, setSchema] = useState('{}');
  // One-shot hydration when the template arrives — `useEffect` with a
  // sentinel ref avoids the setState-during-render warning and keeps the
  // JSON.stringify cost off the render path.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !t.data) return;
    hydrated.current = true;
    setPrompt(t.data.prompt);
    setSchema(JSON.stringify(t.data.outputSchema, null, 2));
  }, [t.data]);

  const save = useMutation({
    mutationFn: () =>
      updateTemplate(templateId!, { prompt, outputSchema: JSON.parse(schema) as unknown }),
    onSuccess: () => navigate('/templates'),
  });
  return (
    <section>
      <h1>Edit template</h1>
      <p>Editing creates a new version (v{(t.data?.version ?? 0) + 1}).</p>
      <label>Prompt</label>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={20} style={{ width: '100%' }} />
      <label>Output schema (JSON)</label>
      <textarea value={schema} onChange={(e) => setSchema(e.target.value)} rows={5} style={{ width: '100%' }} />
      <button onClick={() => save.mutate()} disabled={!prompt}>
        Save new version
      </button>
    </section>
  );
}
