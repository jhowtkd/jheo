import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { deleteSetting, listSettings, upsertSetting } from '../api.js';

export function Settings() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['settings'], queryFn: listSettings });
  const [key, setKey] = useState('openai_api_key');
  const [value, setValue] = useState('');
  const put = useMutation({
    mutationFn: () => upsertSetting(key, value),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['settings'] });
      setValue('');
    },
  });
  const del = useMutation({
    mutationFn: (k: string) => deleteSetting(k),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
  return (
    <section>
      <h1>Settings</h1>
      <p>API keys are encrypted with JHEO_SECRET_KEY. Values are write-only.</p>
      <ul>
        {list.data?.map((s) => (
          <li key={s.key}>
            {s.key} <small>{s.updatedAt}</small>{' '}
            <button onClick={() => del.mutate(s.key)}>Delete</button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          put.mutate();
        }}
      >
        <input value={key} onChange={(e) => setKey(e.target.value)} />
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value"
        />
        <button type="submit">Save</button>
      </form>
    </section>
  );
}