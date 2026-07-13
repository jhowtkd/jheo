import i18n from 'i18next';
import type { SupportedLocale } from './locale-base.js';

export type RouteId =
  | 'projects'
  | 'projectDashboard'
  | 'auditRunner'
  | 'audits'
  | 'auditResults'
  | 'materialsProject'
  | 'compose'
  | 'templates'
  | 'templateEditor'
  | 'fixes'
  | 'reports'
  | 'generationReview'
  | 'channelsProject'
  | 'channelEditor'
  | 'publishDetail'
  | 'agentBundle'
  | 'settings';

type LocalizedId = Exclude<RouteId, 'publishDetail' | 'agentBundle'>;

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
  compose:            { en: 'projects',     'pt-BR': 'projetos' },
  templates:          { en: 'templates',    'pt-BR': 'modelos' },
  templateEditor:     { en: 'templates',    'pt-BR': 'modelos' },
  fixes:              { en: 'fixes',        'pt-BR': 'correcoes' },
  reports:            { en: 'reports',      'pt-BR': 'relatorios' },
  generationReview:   { en: 'generations',  'pt-BR': 'geracoes' },
  channelsProject:    { en: 'projects',     'pt-BR': 'projetos' },
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
  compose:            '/:projectId/compose',
  templates:          '',
  templateEditor:     '/:templateId',
  fixes:              '',
  reports:            '',
  generationReview:   '/:generationId',
  channelsProject:    '/:projectId/channels',
  channelEditor:      '/:channelId',
  publishDetail:      '/publishes/:publishId',
  agentBundle:        '/publishes/:publishId/bundle',
  settings:           '',
};

function fillParams(template: string, params?: Record<string, string>): string {
  if (!/:[a-zA-Z]+/.test(template)) return template;
  return template.replace(/:([a-zA-Z]+)/g, (_, k: string) => {
    const v = params?.[k];
    if (v == null) throw new Error(`Missing param "${k}" for route`);
    return encodeURIComponent(v);
  });
}

export function pathForLocale(
  locale: SupportedLocale,
  id: RouteId,
  params?: Record<string, string>,
): string {
  const tail = fillParams(TAIL[id], params);
  const first = FIRST_SEGMENT[id as LocalizedId];
  if (first) {
    const head = first[locale];
    return tail ? `/${head}${tail}` : `/${head}`;
  }
  // Unlocalized first segment — tail already starts with /publishes.
  return tail;
}

export function englishPath(id: RouteId, params?: Record<string, string>): string {
  return pathForLocale('en', id, params);
}

export function ptBRPath(id: RouteId, params?: Record<string, string>): string {
  return pathForLocale('pt-BR', id, params);
}

export function activeLocale(): SupportedLocale {
  return (i18n.language as SupportedLocale) === 'pt-BR' ? 'pt-BR' : 'en';
}

export function localePath(id: RouteId, params?: Record<string, string>): string {
  return pathForLocale(activeLocale(), id, params);
}

const FIRST_BY_LOCALE: Record<SupportedLocale, Record<string, LocalizedId>> = {
  en: (() => {
    const m: Record<string, LocalizedId> = {};
    for (const [id, segs] of Object.entries(FIRST_SEGMENT) as [LocalizedId, Record<SupportedLocale, string>][]) {
      m[segs.en] = id;
    }
    return m;
  })(),
  'pt-BR': (() => {
    const m: Record<string, LocalizedId> = {};
    for (const [id, segs] of Object.entries(FIRST_SEGMENT) as [LocalizedId, Record<SupportedLocale, string>][]) {
      m[segs['pt-BR']] = id;
    }
    return m;
  })(),
};

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
  // Tolerant lookup: the active URL may already be under the target locale's
  // segments (e.g. user pasted a bookmark, or hit a redirect). Find the id
  // by trying both locales instead of only the reported source.
  const id =
    FIRST_BY_LOCALE[fromLocale][firstSegment] ??
    FIRST_BY_LOCALE[toLocale][firstSegment];
  if (!id) return pathname;
  const newHead = FIRST_SEGMENT[id][toLocale];
  return '/' + [newHead, ...parts.slice(1)].join('/');
}