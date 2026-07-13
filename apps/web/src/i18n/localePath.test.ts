import { describe, it, expect } from 'vitest';
import {
  pathForLocale,
  englishPath,
  ptBRPath,
  siblingPath,
  routeIdFromPath,
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
    expect(pathForLocale('pt-BR', 'materialsProject', { projectId: 'p1' }))
      .toBe('/projetos/p1/materials');
    expect(pathForLocale('pt-BR', 'fixes')).toBe('/correcoes');
    expect(pathForLocale('pt-BR', 'reports')).toBe('/relatorios');
    expect(pathForLocale('pt-BR', 'generationReview', { generationId: 'g1' }))
      .toBe('/geracoes/g1');
    expect(pathForLocale('pt-BR', 'settings')).toBe('/configuracoes');
    expect(pathForLocale('pt-BR', 'channelsProject', { projectId: 'p1' }))
      .toBe('/projetos/p1/channels');
    expect(pathForLocale('pt-BR', 'channelEditor', { channelId: 'c1' }))
      .toBe('/canais/c1');
  });

  it('preserves param segments across locales for nested routes', () => {
    expect(pathForLocale('en', 'auditRunner', { projectId: 'p1' }))
      .toBe('/projects/p1/audit');
    expect(pathForLocale('pt-BR', 'auditRunner', { projectId: 'p1' }))
      .toBe('/projetos/p1/audit');
  });

  it('encodes params', () => {
    expect(pathForLocale('en', 'auditResults', { auditId: 'a/b' }))
      .toBe('/audits/a%2Fb');
  });

  it('throws when a required param is missing', () => {
    expect(() => pathForLocale('en', 'auditResults')).toThrow(/auditId/);
  });

  it('leaves unlocalized first segments (publishes) alone', () => {
    expect(pathForLocale('en', 'publishDetail', { publishId: 'x' }))
      .toBe('/publishes/x');
    expect(pathForLocale('pt-BR', 'publishDetail', { publishId: 'x' }))
      .toBe('/publishes/x');
    expect(pathForLocale('en', 'agentBundle', { publishId: 'x' }))
      .toBe('/publishes/x/bundle');
  });

  it('englishPath and ptBRPath helpers are aliases', () => {
    expect(englishPath('projects')).toBe('/projects');
    expect(ptBRPath('projects')).toBe('/projetos');
  });

  it('siblingPath maps the first segment and keeps the rest', () => {
    expect(siblingPath('en', 'pt-BR', '/projects')).toBe('/projetos');
    expect(siblingPath('pt-BR', 'en', '/projetos')).toBe('/projects');
    expect(siblingPath('en', 'pt-BR', '/projects/p1/audit'))
      .toBe('/projetos/p1/audit');
    expect(siblingPath('pt-BR', 'en', '/projetos/p1/audit'))
      .toBe('/projects/p1/audit');
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
});