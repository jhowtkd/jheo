import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getChannel, updateChannel, type ChannelDetail } from '../api.js';

export function ChannelEditor() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => getChannel(channelId!),
    enabled: !!channelId,
  });
  const [configText, setConfigText] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    if (q.data && !configText) {
      setConfigText(JSON.stringify(q.data.config, null, 2));
      setName(q.data.name);
    }
  }, [q.data, configText]);
  const save = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(configText) as unknown;
      return updateChannel(channelId!, { name, config: parsed });
    },
    onSuccess: () => navigate('/projects/' + q.data?.projectId + '/channels'),
  });

  if (!q.data) return <p>Loading…</p>;
  return (
    <section>
      <h1>Edit channel ({q.data.type})</h1>
      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Config (JSON)</label>
      <textarea value={configText} onChange={(e) => setConfigText(e.target.value)} rows={15} style={{ width: '100%' }} />
      <button onClick={() => save.mutate()} disabled={!name}>Save</button>
    </section>
  );
}