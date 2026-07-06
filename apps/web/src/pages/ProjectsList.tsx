import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createProject, listProjects } from '../api.js';

export function ProjectsList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects });
  const [name, setName] = useState('');
  const [rootUrl, setRootUrl] = useState('https://');
  const create = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
  });

  return (
    <section>
      <h1>Projects</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name, rootUrl });
          setName('');
        }}
        style={{ display: 'flex', gap: 8, marginBottom: 16 }}
      >
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input required value={rootUrl} onChange={(e) => setRootUrl(e.target.value)} placeholder="https://site.com" style={{ minWidth: 320 }} />
        <button type="submit">Create</button>
      </form>
      <ul>
        {projects.data?.map((p) => (
          <li key={p.id} style={{ margin: '6px 0' }}>
            <Link to={`/projects/${p.id}`}>{p.name}</Link> <span style={{ color: '#666' }}>— {p.rootUrl}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
