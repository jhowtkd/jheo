import { describe, it, expect } from 'vitest';
import {
  pathForLocale,
  pathTemplateForLocale,
  englishPath,
  ptBRPath,
  englishPathTemplate,
  ptBRPathTemplate,
  siblingPath,
  routeIdFromPath,
  rootRouteIdFromPath,
  type RouteId,
} from './localePath.js';

describe('localePath', () => {
  it('maps first segments for English per D5 spec', () => {
    expect(pathForLocale('en', 'projects')).toBe('/projects');
    expect(pathForLocale('en', 'audits')).toBe('/audits');
    expect(pathForLocale('en', 'templates')).toBe('/templates');
    expect(pathForLocale('en', 'fixes')).toBe('/fixes');
    expect(pathForLocale('en', 'reports')).toBe('/reports');
    expect(pathForLocale('en', 'settings')).toBe('/settings');
  });

  it('maps first segments for pt-BR per D5 spec', () => {
    expect(pathForLocale('pt-BR', 'projects')).toBe('/projetos');
    expect(pathForLocale('pt-BR', 'audits')).toBe('/auditorias');
    expect(pathForLocale('pt-BR', 'templates')).toBe('/modelos');
    expect(pathForLocale('pt-BR', 'materialsProject', { projectId: 'p1' })).toBe(
      '/projetos/p1/materials',
    );
    expect(pathForLocale('pt-BR', 'fixes')).toBe('/correcoes');
    expect(pathForLocale('pt-BR', 'reports')).toBe('/relatorios');
    expect(pathForLocale('pt-BR', 'generationReview', { generationId: 'g1' })).toBe('/geracoes/g1');
    expect(pathForLocale('pt-BR', 'settings')).toBe('/configuracoes');
    expect(pathForLocale('pt-BR', 'channelsProject', { projectId: 'p1' })).toBe(
      '/projetos/p1/channels',
    );
    expect(pathForLocale('pt-BR', 'channelEditor', { channelId: 'c1' })).toBe('/canais/c1');
  });

  it('preserves param segments across locales for nested routes', () => {
    expect(pathForLocale('en', 'auditRunner', { projectId: 'p1' })).toBe('/projects/p1/audit');
    expect(pathForLocale('pt-BR', 'auditRunner', { projectId: 'p1' })).toBe('/projetos/p1/audit');
  });

  it('encodes params', () => {
    expect(pathForLocale('en', 'auditResults', { auditId: 'a/b' })).toBe('/audits/a%2Fb');
  });

  it('throws when a required param is missing', () => {
    expect(() => pathForLocale('en', 'auditResults')).toThrow(/auditId/);
  });

  it('error message names the route id and the template (debug aid)', () => {
    // The thrown error must mention both the id and the template so a
    // developer hitting it in the console knows exactly which call site
    // is wrong, plus a hint to use the *Template() variants for shape
    // use cases.
    let captured: Error | null = null;
    try {
      pathForLocale('en', 'projectDashboard');
    } catch (e) {
      captured = e as Error;
    }
    expect(captured).not.toBeNull();
    expect(captured!.message).toContain('projectDashboard');
    expect(captured!.message).toContain('projectId');
    expect(captured!.message).toContain('/:projectId');
    expect(captured!.message).toMatch(/Template/);
  });

  it('leaves unlocalized first segments (publishes) alone', () => {
    expect(pathForLocale('en', 'publishDetail', { publishId: 'x' })).toBe('/publishes/x');
    expect(pathForLocale('pt-BR', 'publishDetail', { publishId: 'x' })).toBe('/publishes/x');
    expect(pathForLocale('en', 'agentBundle', { publishId: 'x' })).toBe('/publishes/x/bundle');
  });

  it('englishPath and ptBRPath helpers are aliases', () => {
    expect(englishPath('projects')).toBe('/projects');
    expect(ptBRPath('projects')).toBe('/projetos');
  });

  it('englishPathTemplate/ptBRPathTemplate preserve :param placeholders', () => {
    // Routes with placeholders — must NOT throw and must keep :slug form.
    expect(englishPathTemplate('projectDashboard')).toBe('/projects/:projectId');
    expect(ptBRPathTemplate('projectDashboard')).toBe('/projetos/:projectId');
    expect(englishPathTemplate('auditRunner')).toBe('/projects/:projectId/audit');
    expect(ptBRPathTemplate('auditRunner')).toBe('/projetos/:projectId/audit');
    expect(englishPathTemplate('auditResults')).toBe('/audits/:auditId');
    expect(ptBRPathTemplate('auditResults')).toBe('/auditorias/:auditId');
    expect(englishPathTemplate('materialsProject')).toBe('/projects/:projectId/materials');
    expect(ptBRPathTemplate('materialsProject')).toBe('/projetos/:projectId/materials');
    expect(englishPathTemplate('compose')).toBe('/projects/:projectId/compose');
    expect(ptBRPathTemplate('compose')).toBe('/projetos/:projectId/compose');
    expect(englishPathTemplate('templateEditor')).toBe('/templates/:templateId');
    expect(ptBRPathTemplate('templateEditor')).toBe('/modelos/:templateId');
    expect(englishPathTemplate('generationReview')).toBe('/generations/:generationId');
    expect(ptBRPathTemplate('generationReview')).toBe('/geracoes/:generationId');
    expect(englishPathTemplate('channelsProject')).toBe('/projects/:projectId/channels');
    expect(ptBRPathTemplate('channelsProject')).toBe('/projetos/:projectId/channels');
    expect(englishPathTemplate('channelEditor')).toBe('/channels/:channelId');
    expect(ptBRPathTemplate('channelEditor')).toBe('/canais/:channelId');
    expect(englishPathTemplate('publishDetail')).toBe('/publishes/:publishId');
    expect(englishPathTemplate('agentBundle')).toBe('/publishes/:publishId/bundle');
  });

  it('englishPathTemplate/ptBRPathTemplate work for routes without params', () => {
    expect(englishPathTemplate('projects')).toBe('/projects');
    expect(ptBRPathTemplate('projects')).toBe('/projetos');
    expect(englishPathTemplate('audits')).toBe('/audits');
    expect(ptBRPathTemplate('audits')).toBe('/auditorias');
    expect(englishPathTemplate('settings')).toBe('/settings');
    expect(ptBRPathTemplate('settings')).toBe('/configuracoes');
  });

  it('siblingPath maps the first segment and keeps the rest', () => {
    expect(siblingPath('en', 'pt-BR', '/projects')).toBe('/projetos');
    expect(siblingPath('pt-BR', 'en', '/projetos')).toBe('/projects');
    expect(siblingPath('en', 'pt-BR', '/projects/p1/audit')).toBe('/projetos/p1/audit');
    expect(siblingPath('pt-BR', 'en', '/projetos/p1/audit')).toBe('/projects/p1/audit');
  });

  it('siblingPath leaves paths alone when first segment is already in the target locale', () => {
    expect(siblingPath('en', 'pt-BR', '/projetos')).toBe('/projetos');
    expect(siblingPath('pt-BR', 'en', '/projects')).toBe('/projects');
  });

  it('siblingPath is a no-op when source equals target locale', () => {
    expect(siblingPath('en', 'en', '/projects')).toBe('/projects');
    expect(siblingPath('pt-BR', 'pt-BR', '/projetos')).toBe('/projetos');
  });

  it('siblingPath leaves unlocalized paths alone (publishes)', () => {
    expect(siblingPath('en', 'pt-BR', '/publishes/x')).toBe('/publishes/x');
  });

  it('routeIdFromPath matches under both locales', () => {
    expect(routeIdFromPath('/projects')).toBe('projects');
    expect(routeIdFromPath('/projetos')).toBe('projects');
    expect(routeIdFromPath('/auditorias/a1')).toBe('auditResults');
    expect(routeIdFromPath('/audits')).toBe('audits');
    expect(routeIdFromPath('/correcoes')).toBe('fixes');
  });

  it('routeIdFromPath picks the most specific id for nested paths', () => {
    expect(routeIdFromPath('/projects/p1')).toBe('projectDashboard');
    expect(routeIdFromPath('/projetos/p1/materials')).toBe('materialsProject');
    expect(routeIdFromPath('/projects/p1/channels')).toBe('channelsProject');
  });

  it('routeIdFromPath returns null for unknown or empty paths', () => {
    expect(routeIdFromPath('/')).toBeNull();
    expect(routeIdFromPath('/publishes/xyz')).toBeNull();
    expect(routeIdFromPath('')).toBeNull();
  });

  it('rootRouteIdFromPath always resolves to a no-param section root', () => {
    // Deeply nested paths collapse to the section root under either locale.
    expect(rootRouteIdFromPath('/projects/p1')).toBe('projects');
    expect(rootRouteIdFromPath('/projects/p1/audit')).toBe('projects');
    expect(rootRouteIdFromPath('/projetos/p1')).toBe('projects');
    expect(rootRouteIdFromPath('/projetos/p1/audit')).toBe('projects');
    expect(rootRouteIdFromPath('/audits/a1')).toBe('audits');
    expect(rootRouteIdFromPath('/auditorias/a1')).toBe('audits');
    expect(rootRouteIdFromPath('/templates/t1')).toBe('templates');
    expect(rootRouteIdFromPath('/modelos/t1')).toBe('templates');
    expect(rootRouteIdFromPath('/fixes')).toBe('fixes');
    expect(rootRouteIdFromPath('/correcoes')).toBe('fixes');
    expect(rootRouteIdFromPath('/reports')).toBe('reports');
    expect(rootRouteIdFromPath('/relatorios')).toBe('reports');
    expect(rootRouteIdFromPath('/settings')).toBe('settings');
    expect(rootRouteIdFromPath('/configuracoes')).toBe('settings');
  });

  it('rootRouteIdFromPath handles gate / first-segment sections', () => {
    // /materials and /geracoes have no /:projectId segment; they use the
    // "gate" form which lives at the section root, then redirects to the
    // project-scoped route. rootRouteIdFromPath returns the gate id.
    expect(rootRouteIdFromPath('/materials')).toBe('materialsGate');
    expect(rootRouteIdFromPath('/materiais')).toBe('materialsGate');
    expect(rootRouteIdFromPath('/generations')).toBe('generationsGate');
    expect(rootRouteIdFromPath('/geracoes')).toBe('generationsGate');
    expect(rootRouteIdFromPath('/channels')).toBe('channelsGate');
    expect(rootRouteIdFromPath('/canais')).toBe('channelsGate');
  });

  it('rootRouteIdFromPath returns null for empty / unlocalized paths', () => {
    expect(rootRouteIdFromPath('/')).toBeNull();
    expect(rootRouteIdFromPath('')).toBeNull();
    expect(rootRouteIdFromPath('/publishes/xyz')).toBeNull();
  });

  it('sanity: every RouteId is either fillable without params OR throws a meaningful error', () => {
    // Regression guard: walk every id, try to build a path under both
    // locales. If it throws, the error must name the route id and the
    // missing param; if it doesn't throw, the result must round-trip
    // against englishPathTemplate / ptBRPathTemplate.
    const ids: RouteId[] = [
      'projects',
      'projectDashboard',
      'auditRunner',
      'audits',
      'auditResults',
      'materialsProject',
      'materialsGate',
      'compose',
      'generationsGate',
      'templates',
      'templateEditor',
      'fixes',
      'reports',
      'generationReview',
      'channelsProject',
      'channelsGate',
      'channelEditor',
      'publishDetail',
      'agentBundle',
      'settings',
    ];
    for (const id of ids) {
      for (const locale of ['en', 'pt-BR'] as const) {
        // Build the template first (always succeeds).
        const tpl = pathTemplateForLocale(locale, id);
        const hasParams = /:[a-zA-Z]+/.test(tpl);
        if (hasParams) {
          // The concrete path builder must throw with a useful message.
          let threw = false;
          try {
            pathForLocale(locale, id);
          } catch (e) {
            threw = true;
            // The error must name the id and at least one :param.
            expect((e as Error).message).toContain(id);
            expect((e as Error).message).toMatch(/:[a-zA-Z]+/);
          }
          expect(threw).toBe(true);
        } else {
          // No params: concrete and template must be identical.
          expect(pathForLocale(locale, id)).toBe(tpl);
        }
      }
    }
  });

  it('sanity: every RouteId template placeholders are also accepted as params keys', () => {
    // If you add a :foo in TAIL, the only way fillParams finds it is via
    // `params.foo` — make sure all placeholders in the live templates
    // match the param keys the app actually uses.
    const knownKeys: Record<string, string[]> = {
      projectDashboard: ['projectId'],
      auditRunner: ['projectId'],
      auditResults: ['auditId'],
      materialsProject: ['projectId'],
      compose: ['projectId'],
      templateEditor: ['templateId'],
      generationReview: ['generationId'],
      channelsProject: ['projectId'],
      channelEditor: ['channelId'],
      publishDetail: ['publishId'],
      agentBundle: ['publishId'],
    };
    for (const [id, keys] of Object.entries(knownKeys)) {
      for (const locale of ['en', 'pt-BR'] as const) {
        const tpl = pathTemplateForLocale(locale, id as RouteId);
        const placeholders = (tpl.match(/:[a-zA-Z]+/g) ?? []).map((s) => s.slice(1));
        expect(new Set(placeholders)).toEqual(new Set(keys));
        // And we can fill with exactly those keys and get a path.
        const params: Record<string, string> = {};
        for (const k of keys) params[k] = 'x';
        const filled = pathForLocale(locale, id as RouteId, params);
        expect(filled).not.toContain(':');
      }
    }
  });
});
