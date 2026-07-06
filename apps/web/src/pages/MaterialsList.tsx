import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { createMaterial, deleteMaterial, listMaterials, type Material } from '../api.js';

export function MaterialsList() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['materials', projectId],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
  });
  const [type, setType] = useState<'url' | 'note'>('note');
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
  const del = useMutation({
    mutationFn: (id: string) => deleteMaterial(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['materials', projectId] }),
  });
  return (
    <section>
      <h1>Materials</h1>
      <ul>
        {list.data?.map((m: Material) => (
          <li key={m.id}>
            {m.title} ({m.type}, {m.charCount} chars, {m.embeddingStatus}){' '}
            <button onClick={() => del.mutate(m.id)}>Delete</button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title && source) create.mutate();
        }}
      >
        <select value={type} onChange={(e) => setType(e.target.value as 'url' | 'note')}>
          <option value="note">note</option>
          <option value="url">url</option>
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={type === 'url' ? 'https://...' : 'Paste text'}
          required
        />
        <button type="submit">Add</button>
      </form>
    </section>
  );
}