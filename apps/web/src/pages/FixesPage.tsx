import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listSuggestionsByAudit, createSuggestion, acceptSuggestion, rejectSuggestion, type Suggestion, type Finding } from '../api.js';
import { FixCard, type FindingLike } from '../components/fixes/FixCard.js';
import { EmptyFixesState } from '../components/fixes/EmptyFixesState.js';

type Filter = { projectId?: string | undefined; auditId?: string | undefined; category?: string | undefined; status?: string | undefined; findingId?: string | undefined };

export function FixesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [findings, setFindings] = useState<FindingLike[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [loading, setLoading] = useState(true);

  const filter: Filter = useMemo(() => ({
    projectId: params.get('projectId') ?? undefined,
    auditId: params.get('auditId') ?? undefined,
    category: params.get('category') ?? undefined,
    status: params.get('status') ?? undefined,
    // Optional pre-filter: ?findingId=... (used by the cross-link button)
    findingId: params.get('findingId') ?? undefined,
  }), [params]);

  // For the MVP we read the audit from the URL and ask the server for
  // findings via a thin endpoint. If no auditId is set, we show empty state.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!filter.auditId) {
        setLoading(false);
        setFindings([]);
        setSuggestions({});
        return;
      }
      setLoading(true);
      try {
        const r = await fetch(`/api/audits/${filter.auditId}/findings`);
        if (!r.ok) return;
        const data: Finding[] = await r.json();
        if (cancelled) return;
        const list: FindingLike[] = data.map((f) => ({
          id: f.id,
          category: f.category,
          severity: f.severity,
          message: f.message,
          url: f.url,
        }));
        setFindings(list);
        // One round-trip for all suggestions on this audit; keep latest per finding.
        const sugList = await listSuggestionsByAudit(filter.auditId);
        if (cancelled) return;
        const map: Record<string, Suggestion> = {};
        for (const s of sugList) map[s.findingId] = s;
        setSuggestions(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [filter.auditId]);

  async function handleGenerate(findingId: string) {
    const s = await createSuggestion({ findingId });
    setSuggestions((prev) => ({ ...prev, [findingId]: s }));
  }
  async function handleRegenerate(suggestionId: string) {
    const s = suggestions[suggestionId];
    if (!s) return;
    const fresh = await createSuggestion({ findingId: s.findingId });
    setSuggestions((prev) => ({ ...prev, [s.findingId]: fresh }));
  }
  async function handleAccept(suggestionId: string) {
    const r = await acceptSuggestion(suggestionId);
    setSuggestions((prev) => ({ ...prev, [r.suggestion.findingId]: r.suggestion }));
  }
  async function handleReject(suggestionId: string) {
    const s = await rejectSuggestion(suggestionId);
    setSuggestions((prev) => ({ ...prev, [s.findingId]: s }));
  }

  const visible = useMemo(() => findings.filter((f) => {
    if (filter.findingId && f.id !== filter.findingId) return false;
    if (filter.category && f.category !== filter.category) return false;
    if (filter.status) {
      const s = suggestions[f.id];
      if (!s || s.status !== filter.status) return false;
    }
    return true;
  }), [findings, filter.findingId, filter.category, filter.status, suggestions]);

  return (
    <div className="fixes-page">
      <h1>{t('fixes.title')}</h1>
      <div className="fixes-page__filters">
        {/* F7 ships URL-param-driven filters; UI controls can be added in F8. */}
        <input
          placeholder={t('fixes.filter.audit') + ' ID'}
          value={filter.auditId ?? ''}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set('auditId', e.target.value);
            else next.delete('auditId');
            setParams(next, { replace: true });
          }}
        />
      </div>
      {loading ? <p>…</p> :
        visible.length === 0 ? <EmptyFixesState /> :
        visible.map((f) => (
          <FixCard
            key={f.id}
            finding={f}
            suggestion={suggestions[f.id] ?? null}
            onGenerate={handleGenerate}
            onAccept={handleAccept}
            onReject={handleReject}
            onRegenerate={handleRegenerate}
          />
        ))
      }
    </div>
  );
}