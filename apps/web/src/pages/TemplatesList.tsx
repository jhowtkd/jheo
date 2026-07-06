import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { activateTemplate, listTemplates, type GenerationTemplate } from '../api.js';

export function TemplatesList() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const act = useMutation({
    mutationFn: (id: string) => activateTemplate(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
  return (
    <section>
      <h1>Templates</h1>
      <ul>
        {list.data?.map((t: GenerationTemplate) => (
          <li key={t.id}>
            <Link to={`/templates/${t.id}`}>
              {t.name} v{t.version}
            </Link>{' '}
            {t.isActive ? <strong>active</strong> : <button onClick={() => act.mutate(t.id)}>Activate</button>}
          </li>
        ))}
      </ul>
      <p><Link to="/templates">/templates</Link> · editor at <code>/templates/:id</code></p>
    </section>
  );
}