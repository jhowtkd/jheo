import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { ProjectScopedGate } from './components/ProjectScopedGate.js';
import {
  activeLocale,
  englishPath,
  englishPathTemplate,
  pathTemplateForLocale,
  ptBRPath,
  ptBRPathTemplate,
} from './i18n/localePath.js';

// Every page is a separate chunk. With lazy(), Vite/Rollup produces one JS
// per page and the initial bundle only loads the chunk for the first route
// the user lands on. The obvious winner is `react-markdown` which alone is
// ~50 KB gzipped and only needed on the GenerationReview page.
const ProjectsList = lazy(() =>
  import('./pages/ProjectsList.js').then((m) => ({ default: m.ProjectsList })),
);
const ProjectDashboard = lazy(() =>
  import('./pages/ProjectDashboard.js').then((m) => ({ default: m.ProjectDashboard })),
);
const AuditRunner = lazy(() =>
  import('./pages/AuditRunner.js').then((m) => ({ default: m.AuditRunner })),
);
const AuditResults = lazy(() =>
  import('./pages/AuditResults.js').then((m) => ({ default: m.AuditResults })),
);
const AuditsList = lazy(() =>
  import('./pages/AuditsList.js').then((m) => ({ default: m.AuditsList })),
);
const MaterialsList = lazy(() =>
  import('./pages/MaterialsList.js').then((m) => ({ default: m.MaterialsList })),
);
const TemplatesList = lazy(() =>
  import('./pages/TemplatesList.js').then((m) => ({ default: m.TemplatesList })),
);
const FixesPage = lazy(() =>
  import('./pages/FixesPage.js').then((m) => ({ default: m.FixesPage })),
);
const TemplateEditor = lazy(() =>
  import('./pages/TemplateEditor.js').then((m) => ({ default: m.TemplateEditor })),
);
const GenerationComposer = lazy(() =>
  import('./pages/GenerationComposer.js').then((m) => ({ default: m.GenerationComposer })),
);
const GenerationReview = lazy(() =>
  import('./pages/GenerationReview.js').then((m) => ({ default: m.GenerationReview })),
);
const ChannelsList = lazy(() =>
  import('./pages/ChannelsList.js').then((m) => ({ default: m.ChannelsList })),
);
const ChannelEditor = lazy(() =>
  import('./pages/ChannelEditor.js').then((m) => ({ default: m.ChannelEditor })),
);
const PublishDetail = lazy(() =>
  import('./pages/PublishDetail.js').then((m) => ({ default: m.PublishDetail })),
);
const AgentBundleView = lazy(() =>
  import('./pages/AgentBundleView.js').then((m) => ({ default: m.AgentBundleView })),
);
const Settings = lazy(() =>
  import('./pages/Settings.js').then((m) => ({ default: m.Settings })),
);
const ReportsList = lazy(() =>
  import('./pages/ReportsList.js').then((m) => ({ default: m.ReportsList })),
);

function PageFallback() {
  return <p style={{ padding: 24 }}>Loading…</p>;
}

function HomeRedirect() {
  // Active locale decides the canonical list URL.
  return (
    <Navigate
      to={activeLocale() === 'pt-BR' ? ptBRPath('projects') : englishPath('projects')}
      replace
    />
  );
}

// ponytail: keep both en/pt-BR redirect strings in sync — these power the
// global /materials, /geracoes, /canais pickers. Order is project-scoped.
const GATE_REDIRECTS = {
  materialsGate:     pathTemplateForLocale('en', 'materialsProject'),
  ptMaterialsGate:   pathTemplateForLocale('pt-BR', 'materialsProject'),
  generationsGate:   pathTemplateForLocale('en', 'compose'),
  ptGenerationsGate: pathTemplateForLocale('pt-BR', 'compose'),
  channelsGate:      pathTemplateForLocale('en', 'channelsProject'),
  ptChannelsGate:    pathTemplateForLocale('pt-BR', 'channelsProject'),
};

// Both locale trees share the same elements — the active locale decides the
// canonical URL via LanguageToggle, but every localized path renders the
// right page, so bookmarks under either language keep working.
export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomeRedirect />} />

          {/* English segment tree */}
          <Route path={englishPathTemplate('projects')} element={<ProjectsList />} />
          <Route path={englishPathTemplate('projectDashboard')} element={<ProjectDashboard />} />
          <Route path={englishPathTemplate('auditRunner')} element={<AuditRunner />} />
          <Route path={englishPathTemplate('audits')} element={<AuditsList />} />
          <Route path={englishPathTemplate('auditResults')} element={<AuditResults />} />
          <Route path={englishPathTemplate('materialsProject')} element={<MaterialsList />} />
          <Route path={englishPathTemplate('materialsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.materialsGate} />} />
          <Route path={englishPathTemplate('compose')} element={<GenerationComposer />} />
          <Route path={englishPathTemplate('generationsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.generationsGate} />} />
          <Route path={englishPathTemplate('templates')} element={<TemplatesList />} />
          <Route path={englishPathTemplate('templateEditor')} element={<TemplateEditor />} />
          <Route path={englishPathTemplate('fixes')} element={<FixesPage />} />
          <Route path={englishPathTemplate('reports')} element={<ReportsList />} />
          <Route path={englishPathTemplate('generationReview')} element={<GenerationReview />} />
          <Route path={englishPathTemplate('channelsProject')} element={<ChannelsList />} />
          <Route path={englishPathTemplate('channelsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.channelsGate} />} />
          <Route path={englishPathTemplate('channelEditor')} element={<ChannelEditor />} />
          <Route path={englishPathTemplate('publishDetail')} element={<PublishDetail />} />
          <Route path={englishPathTemplate('agentBundle')} element={<AgentBundleView />} />
          <Route path={englishPathTemplate('settings')} element={<Settings />} />

          {/* pt-BR segment tree */}
          <Route path={ptBRPathTemplate('projects')} element={<ProjectsList />} />
          <Route path={ptBRPathTemplate('projectDashboard')} element={<ProjectDashboard />} />
          <Route path={ptBRPathTemplate('auditRunner')} element={<AuditRunner />} />
          <Route path={ptBRPathTemplate('audits')} element={<AuditsList />} />
          <Route path={ptBRPathTemplate('auditResults')} element={<AuditResults />} />
          <Route path={ptBRPathTemplate('materialsProject')} element={<MaterialsList />} />
          <Route path={ptBRPathTemplate('materialsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.ptMaterialsGate} />} />
          <Route path={ptBRPathTemplate('compose')} element={<GenerationComposer />} />
          <Route path={ptBRPathTemplate('generationsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.ptGenerationsGate} />} />
          <Route path={ptBRPathTemplate('templates')} element={<TemplatesList />} />
          <Route path={ptBRPathTemplate('templateEditor')} element={<TemplateEditor />} />
          <Route path={ptBRPathTemplate('fixes')} element={<FixesPage />} />
          <Route path={ptBRPathTemplate('reports')} element={<ReportsList />} />
          <Route path={ptBRPathTemplate('generationReview')} element={<GenerationReview />} />
          <Route path={ptBRPathTemplate('channelsProject')} element={<ChannelsList />} />
          <Route path={ptBRPathTemplate('channelsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.ptChannelsGate} />} />
          <Route path={ptBRPathTemplate('channelEditor')} element={<ChannelEditor />} />
          <Route path={englishPathTemplate('publishDetail')} element={<PublishDetail />} />
          <Route path={englishPathTemplate('agentBundle')} element={<AgentBundleView />} />
          <Route path={ptBRPathTemplate('settings')} element={<Settings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}