import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { ScoreCard } from '../components/ScoreCard.js';

type ProjectDetail = {
  id: string; name: string; rootUrl: string;
  audits: { id: string; status: string; score: { overall: number; byCategory: Record<string, number | null> } | null }[];
};

async function getProject(id: string): Promise<ProjectDetail> {
  return (await fetch(`/api/projects/${id}`)).json();
}

export function ProjectDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
    refetchInterval: 3000,
  });
  if (!project.data) return <p>Loading…</p>;
  const latest = project.data.audits[0];
  return (
    <section>
      <h1>{project.data.name}</h1>
      <p>{project.data.rootUrl}</p>
      {latest?.score ? (
        <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
          <ScoreCard label="Overall" value={latest.score.overall} />
          {Object.entries(latest.score.byCategory).map(([k, v]) => (
            <ScoreCard key={k} label={k} value={v} />
          ))}
        </div>
      ) : (
        <p>No audits yet.</p>
      )}
      <Link to={`/projects/${projectId}/audit`}>Run audit</Link>
      <h2>Audits</h2>
      <ul>
        {project.data.audits.map((a) => (
          <li key={a.id}>
            <Link to={`/audits/${a.id}`}>{a.id}</Link> — {a.status} — {a.score?.overall ?? '—'}
          </li>
        ))}
      </ul>
    </section>
  );
}
