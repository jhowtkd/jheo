import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getPublishFiles } from '../api.js';

export function AgentBundleView() {
  const { publishId } = useParams<{ publishId: string }>();
  const q = useQuery({
    queryKey: ['publish-files', publishId],
    queryFn: () => getPublishFiles(publishId!),
    enabled: !!publishId,
  });
  if (!q.data) return <p>Loading…</p>;
  return (
    <section>
      <h1>Bundle {publishId}</h1>
      <p>
        Directory: <code>{q.data.dir}</code>
      </p>
      <p>
        <a href={`/api/publishes/${publishId}/bundle`} download>
          Download zip
        </a>
      </p>
      {q.data.files.map((f) => (
        <details key={f.name}>
          <summary>{f.name}</summary>
          <pre style={{ overflow: 'auto', maxHeight: 400 }}>{f.content}</pre>
        </details>
      ))}
    </section>
  );
}
