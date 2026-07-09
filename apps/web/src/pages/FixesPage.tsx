import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  listProjects,
  getProject,
  listSuggestionsByAudit,
  createSuggestion,
  acceptSuggestion,
  rejectSuggestion,
  type Project,
  type ProjectDetail,
  type Suggestion,
  type Finding,
} from '../api.js';
import { FixCard, type FindingLike } from '../components/fixes/FixCard.js';
import { FixGroup, type FixGroupData } from '../components/fixes/FixGroup.js';
import { EmptyFixesState } from '../components/fixes/EmptyFixesState.js';

type Filter = {
  projectId?: string | undefined;
  auditId?: string | undefined;
  category?: string | undefined;
  status?: string | undefined;
  findingId?: string | undefined;
};

const DEFAULT_GROUP_BY_RULE = true;
const GROUP_BY_RULE_STORAGE_KEY = 'jheo.fixes.groupByRule';

export function FixesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [findings, setFindings] = useState<FindingLike[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [loading, setLoading] = useState(true);
  // Project picker state — used when the URL doesn't carry auditId/projectId.
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  // Group-by-rule toggle (persisted in localStorage).
  const [groupByRule, setGroupByRule] = useState<boolean>(() => {
    if (typeof window === 'undefined') return DEFAULT_GROUP_BY_RULE;
    const raw = window.localStorage.getItem(GROUP_BY_RULE_STORAGE_KEY);
    return raw === null ? DEFAULT_GROUP_BY_RULE : raw === 'true';
  });

  const filter: Filter = useMemo(
    () => ({
      projectId: params.get('projectId') ?? undefined,
      auditId: params.get('auditId') ?? undefined,
      category: params.get('category') ?? undefined,
      status: params.get('status') ?? undefined,
      // Optional pre-filter: ?findingId=... (used by the cross-link button).
      findingId: params.get('findingId') ?? undefined,
    }),
    [params],
  );

  // Findings + suggestions for the resolved auditId.
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
          rule: f.rule,
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
    return () => {
      cancelled = true;
    };
  }, [filter.auditId]);

  // No auditId: load the project list (or a single project's detail) so the
  // user can pick a context instead of staring at a bare ID input.
  useEffect(() => {
    let cancelled = false;
    async function loadChooser() {
      if (filter.auditId) return;
      if (filter.projectId) {
        setProjectsLoading(true);
        try {
          const detail: ProjectDetail = await getProject(filter.projectId);
          if (cancelled) return;
          // Redirect to the latest audit so the page renders the existing
          // findings+suggestions view rather than the picker.
          const latest = detail.audits?.[0];
          if (latest) {
            const next = new URLSearchParams(params);
            next.set('auditId', latest.id);
            setParams(next, { replace: true });
          } else {
            // No audits — show the empty state in the project context.
            setProjects([]);
          }
        } finally {
          if (!cancelled) setProjectsLoading(false);
        }
        return;
      }
      setProjectsLoading(true);
      try {
        const list = await listProjects();
        if (cancelled) return;
        setProjects(list);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    }
    void loadChooser();
    return () => {
      cancelled = true;
    };
  }, [filter.auditId, filter.projectId, params, setParams]);

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

  const visible = useMemo(
    () =>
      findings.filter((f) => {
        if (filter.findingId && f.id !== filter.findingId) return false;
        if (filter.category && f.category !== filter.category) return false;
        if (filter.status) {
          const s = suggestions[f.id];
          if (!s || s.status !== filter.status) return false;
        }
        return true;
      }),
    [findings, filter.findingId, filter.category, filter.status, suggestions],
  );

  // Group by rule so a 14-occurrence "Page has no <h1>" doesn't render 14
  // identical cards. When a single finding has its own suggestion, the
  // group expands to show the existing FixCard (otherwise we render the
  // per-page "Gerar sugestão" buttons).
  const groups = useMemo<FixGroupData[]>(() => {
    if (!groupByRule) return [];
    const map = new Map<string, FixGroupData>();
    for (const f of visible) {
      const key = `${f.category}::${f.rule}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          rule: f.rule,
          category: f.category,
          severity: f.severity,
          message: f.message,
          findings: [],
        };
        map.set(key, g);
      }
      g.findings.push(f);
    }
    return Array.from(map.values()).sort((a, b) => b.findings.length - a.findings.length);
  }, [visible, groupByRule]);

  const stats = useMemo(() => {
    const suggestionList = Object.values(suggestions);
    return {
      rules: groups.length,
      findings: visible.length,
      pending: suggestionList.filter((s) => s.status === 'pending').length,
      accepted: suggestionList.filter((s) => s.status === 'accepted').length,
    };
  }, [groups, visible, suggestions]);

  return (
    <div className="fixes-page">
      <h1>{t('fixes.title')}</h1>
      {!filter.auditId ? (
        <ProjectChooser
          projects={projects}
          loading={projectsLoading}
          hasProjectContext={Boolean(filter.projectId)}
        />
      ) : (
        <>
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
            <label className="fixes-page__toggle">
              <input
                type="checkbox"
                checked={groupByRule}
                onChange={(e) => {
                  const next = e.target.checked;
                  setGroupByRule(next);
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem(GROUP_BY_RULE_STORAGE_KEY, String(next));
                  }
                }}
              />
              {t('fixes.group.toggle')}
            </label>
          </div>

          {!loading && (
            <ul className="fixes-page__stats" aria-label={t('fixes.stats.label')}>
              <li>
                <span className="fixes-page__stat-value">{stats.rules}</span>
                <span className="muted">{t('fixes.stats.rules')}</span>
              </li>
              <li>
                <span className="fixes-page__stat-value">{stats.findings}</span>
                <span className="muted">{t('fixes.stats.findings')}</span>
              </li>
              <li>
                <span className="fixes-page__stat-value">{stats.pending}</span>
                <span className="muted">{t('fixes.stats.pending')}</span>
              </li>
              <li>
                <span className="fixes-page__stat-value">{stats.accepted}</span>
                <span className="muted">{t('fixes.stats.accepted')}</span>
              </li>
            </ul>
          )}

          {loading ? (
            <p>…</p>
          ) : visible.length === 0 ? (
            <EmptyFixesState kind="no-findings" />
          ) : groupByRule ? (
            groups.map((g) => (
              <FixGroup
                key={g.key}
                group={g}
                suggestions={suggestions}
                onGenerate={handleGenerate}
                onAccept={handleAccept}
                onReject={handleReject}
                onRegenerate={handleRegenerate}
                onOpen={handleOpenGroup}
              />
            ))
          ) : (
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
          )}
        </>
      )}
    </div>
  );

  function handleOpenGroup(findingId: string) {
    // Drill-down: clicking a page in the group jumps to /fixes pre-filtered
    // to that single finding. The user lands back on the grouped view (toggle
    // persists) but with the per-finding list visible at the top.
    const next = new URLSearchParams(params);
    next.set('auditId', filter.auditId!);
    next.set('findingId', findingId);
    setParams(next, { replace: true });
  }
}

type ProjectChooserProps = {
  projects: Project[];
  loading: boolean;
  // True when the URL had projectId but the project has no audits yet.
  hasProjectContext: boolean;
};

function ProjectChooser({ projects, loading, hasProjectContext }: ProjectChooserProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openLatestAudit(p: Project) {
    setError(null);
    setPendingId(p.id);
    try {
      const detail = await getProject(p.id);
      const latest = detail.audits?.[0];
      if (latest) {
        navigate(`/fixes?auditId=${latest.id}`);
      } else {
        // No audits yet — drop the user on the project dashboard so they
        // can run one and come back.
        navigate(`/projects/${p.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <p>…</p>;
  if (projects.length === 0) {
    return <EmptyFixesState kind={hasProjectContext ? 'no-audits' : 'no-projects'} />;
  }
  return (
    <div className="fixes-page__chooser">
      <h2 className="fixes-page__chooser-title">{t('fixes.chooseProject.title')}</h2>
      <p className="muted">{t('fixes.chooseProject.hint')}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="fixes-page__chooser-list">
        {projects.map((p) => (
          <li key={p.id} className="card">
            <div className="fixes-page__chooser-row">
              <div>
                <div className="fixes-page__chooser-name">{p.name}</div>
                <div className="muted mono">{p.rootUrl}</div>
              </div>
              <button
                className="btn btn--sm btn--primary"
                disabled={pendingId === p.id}
                onClick={() => openLatestAudit(p)}
              >
                {pendingId === p.id
                  ? t('common.loading')
                  : t('fixes.chooseProject.viewFixes')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
