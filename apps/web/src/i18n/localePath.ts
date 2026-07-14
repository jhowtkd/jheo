import i18n from 'i18next';
import type { SupportedLocale } from './locale-base.js';

export type RouteId =
  | 'projects'
  | 'projectDashboard'
  | 'auditRunner'
  | 'audits'
  | 'auditResults'
  | 'materialsProject'
  | 'materialsGate'
  | 'compose'
  | 'generationsGate'
  | 'templates'
  | 'templateEditor'
  | 'fixes'
  | 'reports'
  | 'generationReview'
  | 'channelsProject'
  | 'channelsGate'
  | 'channelEditor'
  | 'publishDetail'
  | 'agentBundle'
  | 'settings';

type LocalizedId = Exclude<
  RouteId,
  'publishDetail' | 'agentBundle'
>;

// First-segment localization per S4/D5 spec. Routes whose first segment is
// intentionally not localized (publishes/*) are absent here and handled in
// pathForLocale by using TAIL verbatim.
const FIRST_SEGMENT: Record<LocalizedId, Record<SupportedLocale, string>> = {
  projects:           { en: 'projects',     'pt-BR': 'projetos' },
  projectDashboard:   { en: 'projects',     'pt-BR': 'projetos' },
  auditRunner:        { en: 'projects',     'pt-BR': 'projetos' },
  audits:             { en: 'audits',       'pt-BR': 'auditorias' },
  auditResults:       { en: 'audits',       'pt-BR': 'auditorias' },
  materialsProject:   { en: 'projects',     'pt-BR': 'projetos' },
  materialsGate:      { en: 'materials',    'pt-BR': 'materiais' },
  compose:            { en: 'projects',     'pt-BR': 'projetos' },
  generationsGate:    { en: 'generations',  'pt-BR': 'geracoes' },
  templates:          { en: 'templates',    'pt-BR': 'modelos' },
  templateEditor:     { en: 'templates',    'pt-BR': 'modelos' },
  fixes:              { en: 'fixes',        'pt-BR': 'correcoes' },
  reports:            { en: 'reports',      'pt-BR': 'relatorios' },
  generationReview:   { en: 'generations',  'pt-BR': 'geracoes' },
  channelsProject:    { en: 'projects',     'pt-BR': 'projetos' },
  channelsGate:       { en: 'channels',     'pt-BR': 'canais' },
  channelEditor:      { en: 'channels',     'pt-BR': 'canais' },
  settings:           { en: 'settings',     'pt-BR': 'configuracoes' },
};

// Path tail in canonical English. Param segments are :slug; substituted at call.
// For unlocalized first segments, tail already begins with /publishes.
const TAIL: Record<RouteId, string> = {
  projects:           '',
  projectDashboard:   '/:projectId',
  auditRunner:        '/:projectId/audit',
  audits:             '',
  auditResults:       '/:auditId',
  materialsProject:   '/:projectId/materials',
  materialsGate:      '',
  compose:            '/:projectId/compose',
  generationsGate:    '',
  templates:          '',
  templateEditor:     '/:templateId',
  fixes:              '',
  reports:            '',
  generationReview:   '/:generationId',
  channelsProject:    '/:projectId/channels',
  channelsGate:       '',
  channelEditor:      '/:channelId',
  publishDetail:      '/publishes/:publishId',
  agentBundle:        '/publishes/:publishId/bundle',
  settings:           '',
};

function fillParams(template: string, id: RouteId, params?: Record<string, string>): string {
  if (!/:[a-zA-Z]+/.test(template)) return template;
  return template.replace(/:([a-zA-Z]+)/g, (_, k: string) => {
    const v = params?.[k];
    if (v == null) {
      throw new Error(
        `localePath: route "${id}" requires param "${k}" (template: ${template}). ` +
          `If you need the route shape (e.g. for <Route path=…>), use ` +
          `englishPathTemplate() / ptBRPathTemplate() instead.`,
      );
    }
    return encodeURIComponent(v);
  });
}

/** Concrete path for a given locale, with params interpolated. */
export function pathForLocale(
  locale: SupportedLocale,
  id: RouteId,
  params?: Record<string, string>,
): string {
  const tail = fillParams(TAIL[id], id, params);
  const first = FIRST_SEGMENT[id as LocalizedId];
  if (first) {
    const head = first[locale];
    return tail ? `/${head}${tail}` : `/${head}`;
  }
  return tail;
}

/**
 * Path template for a given locale — same shape as pathForLocale but with
 * :param placeholders preserved (no interpolation). Useful for redirect
 * templates like `/projetos/:projectId/materiais`.
 */
export function pathTemplateForLocale(locale: SupportedLocale, id: RouteId): string {
  const tail = TAIL[id];
  const first = FIRST_SEGMENT[id as LocalizedId];
  if (first) {
    const head = first[locale];
    return tail ? `/${head}${tail}` : `/${head}`;
  }
  return tail;
}

export function englishPath(id: RouteId, params?: Record<string, string>): string {
  return pathForLocale('en', id, params);
}

export function ptBRPath(id: RouteId, params?: Record<string, string>): string {
  return pathForLocale('pt-BR', id, params);
}

// Template variants — preserve `:param` placeholders instead of filling them.
// Use these in <Route path=...> so the placeholder stays as a real react-router
// dynamic segment, and in any other context that needs a route shape rather
// than a concrete URL.
export function englishPathTemplate(id: RouteId): string {
  return pathTemplateForLocale('en', id);
}

export function ptBRPathTemplate(id: RouteId): string {
  return pathTemplateForLocale('pt-BR', id);
}

export function activeLocale(): SupportedLocale {
  return (i18n.language as SupportedLocale) === 'pt-BR' ? 'pt-BR' : 'en';
}

export function localePath(id: RouteId, params?: Record<string, string>): string {
  return pathForLocale(activeLocale(), id, params);
}

const FIRST_BY_LOCALE: Record<SupportedLocale, Record<string, LocalizedId[]>> = {
  en: (() => {
    const m: Record<string, LocalizedId[]> = {};
    for (const [id, segs] of Object.entries(FIRST_SEGMENT) as [LocalizedId, Record<SupportedLocale, string>][]) {
      (m[segs.en] ??= []).push(id);
    }
    return m;
  })(),
  'pt-BR': (() => {
    const m: Record<string, LocalizedId[]> = {};
    for (const [id, segs] of Object.entries(FIRST_SEGMENT) as [LocalizedId, Record<SupportedLocale, string>][]) {
      (m[segs['pt-BR']] ??= []).push(id);
    }
    return m;
  })(),
};

// All route id → path template pairs for both locales, with segment count.
// Used to resolve a pathname to its most specific RouteId.
const ALL_PATHS: Array<{ id: RouteId; locale: SupportedLocale; template: string; segments: number }> = (() => {
  const out: Array<{ id: RouteId; locale: SupportedLocale; template: string; segments: number }> = [];
  for (const id of Object.keys(TAIL) as RouteId[]) {
    for (const locale of ['en', 'pt-BR'] as const) {
      const tpl = pathTemplateForLocale(locale, id);
      out.push({ id, locale, template: tpl, segments: tpl.split('/').filter(Boolean).length });
    }
  }
  return out;
})();

/**
 * Resolve a pathname to its most specific RouteId. Matches under either
 * locale's segments; ties broken by longer template (more segments wins).
 * Returns null for paths that don't match any known route (e.g. /publishes/...).
 */
export function routeIdFromPath(pathname: string): RouteId | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  // Unlocalized first segment (publishes/*) is intentionally excluded from
  // telemetry + nav tracking per S4 spec — those deep links never resolve
  // to a section id.
  if (parts[0] === 'publishes') return null;
  let best: { id: RouteId; segments: number } | null = null;
  for (const entry of ALL_PATHS) {
    if (entry.segments > parts.length) continue;
    // Walk entry.template segments and verify each against parts.
    const entrySegs = entry.template.split('/').filter(Boolean);
    let ok = true;
    for (let i = 0; i < entrySegs.length; i++) {
      const want = entrySegs[i]!;
      const got = parts[i]!;
      if (want.startsWith(':')) continue; // param — any value ok
      if (want !== got) { ok = false; break; }
    }
    if (ok && (!best || entry.segments > best.segments)) {
      best = { id: entry.id, segments: entry.segments };
    }
  }
  return best?.id ?? null;
}

/**
 * Map a pathname under one locale to the equivalent pathname under another.
 * Preserves trailing segments verbatim (param ids do not change across locales).
 * Unlocalized first segments (publishes/*) are returned as-is.
 */
export function siblingPath(
  fromLocale: SupportedLocale,
  toLocale: SupportedLocale,
  pathname: string,
): string {
  if (fromLocale === toLocale) return pathname;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return pathname || '/';
  const firstSegment = parts[0]!;
  // The first-segment map holds arrays of candidate ids; pick whichever is
  // registered for this locale's head. We use the first match under the
  // target locale if the source has no entry, else the first source entry.
  const fromIds = FIRST_BY_LOCALE[fromLocale][firstSegment];
  const toIds = FIRST_BY_LOCALE[toLocale][firstSegment];
  const id = fromIds?.[0] ?? toIds?.[0];
  if (!id) return pathname;
  const newHead = FIRST_SEGMENT[id][toLocale];
  return '/' + [newHead, ...parts.slice(1)].join('/');
}

// Maps each localizable first segment to the RouteId of the section root
// (no params, safe to call localePath() on it without filling anything).
// Used by the Crumb to build a root link regardless of how deep the current
// pathname is.
const ROOT_ID_BY_FIRST_SEGMENT: Record<SupportedLocale, Record<string, RouteId>> = {
  en: {
    projects: 'projects',
    audits: 'audits',
    templates: 'templates',
    materials: 'materialsGate',
    generations: 'generationsGate',
    fixes: 'fixes',
    reports: 'reports',
    channels: 'channelsGate',
    settings: 'settings',
  },
  'pt-BR': {
    projetos: 'projects',
    auditorias: 'audits',
    modelos: 'templates',
    materiais: 'materialsGate',
    geracoes: 'generationsGate',
    correcoes: 'fixes',
    relatorios: 'reports',
    canais: 'channelsGate',
    configuracoes: 'settings',
  },
};

/**
 * Resolve a pathname to the RouteId of its section root (the no-param
 * template for the current first segment). Useful for building breadcrumb
 * / section links without filling any :param placeholders. Returns null for
 * empty paths or unlocalized first segments (publishes/*).
 */
export function rootRouteIdFromPath(pathname: string): RouteId | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const firstSeg = parts[0]!;
  if (firstSeg === 'publishes') return null;
  return (
    ROOT_ID_BY_FIRST_SEGMENT.en[firstSeg] ??
    ROOT_ID_BY_FIRST_SEGMENT['pt-BR'][firstSeg] ??
    null
  );
}