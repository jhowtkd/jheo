import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createChannel,
  deleteChannel,
  listChannels,
  updateChannel,
  type Channel,
  type ChannelType,
} from '../api.js';

export function ChannelsList() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['channels', projectId], queryFn: () => listChannels(projectId!) });
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('http');
  const create = useMutation({
    mutationFn: () => createChannel(projectId!, { name, type, config: defaultConfigFor(type) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['channels', projectId] });
      setName('');
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteChannel(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['channels', projectId] }),
  });
  const toggleActive = useMutation({
    mutationFn: (ch: Channel) => updateChannel(ch.id, { isActive: !ch.isActive }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['channels', projectId] }),
  });
  return (
    <section>
      <h1>Channels</h1>
      <ul>
        {list.data?.map((ch: Channel) => (
          <li key={ch.id}>
            <Link to={`/channels/${ch.id}`}>{ch.name}</Link> ({ch.type}){' '}
            {ch.isActive ? (
              <button onClick={() => toggleActive.mutate(ch)}>Deactivate</button>
            ) : (
              <button onClick={() => toggleActive.mutate(ch)}>Activate</button>
            )}{' '}
            <button onClick={() => del.mutate(ch.id)}>Delete</button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name) create.mutate();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        <select value={type} onChange={(e) => setType(e.target.value as ChannelType)}>
          <option value="wordpress">wordpress</option>
          <option value="http">http</option>
          <option value="agent">agent</option>
        </select>
        <button type="submit">Create</button>
      </form>
    </section>
  );
}

function defaultConfigFor(type: ChannelType): unknown {
  switch (type) {
    case 'wordpress':
      return {
        siteUrl: 'https://example.com',
        username: 'admin',
        appPassword: '',
        defaultStatus: 'draft',
      };
    case 'http':
      return { endpointUrl: 'https://example.com/api', method: 'POST' as const, headers: {} };
    case 'agent':
      return { siteName: 'Site', themeColor: '#0ea5e9', assetFolder: 'assets' };
  }
}