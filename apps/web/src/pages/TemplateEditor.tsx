import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTemplate, updateTemplate } from '../api.js';

export function TemplateEditor() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const t = useQuery({ queryKey: ['template', templateId], queryFn: () => getTemplate(templateId!) });
  const [prompt, setPrompt] = useState('');
  const [schema, setSchema] = useState('{}');
  const [autoSet, setAutoSet] = useState(false);
  if (t.data && !autoSet) {
    setPrompt(t.data.prompt);
    setSchema(JSON.stringify(t.data.outputSchema, null, 2));
    setAutoSet(true);
  }
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
