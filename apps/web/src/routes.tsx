import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { ProjectScopedGate } from './components/ProjectScopedGate.js';
import {
  activeLocale,
  englishPath,
  pathTemplateForLocale,
  ptBRPath,
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
          <Route path={englishPath('projects')} element={<ProjectsList />} />
          <Route path={englishPath('projectDashboard')} element={<ProjectDashboard />} />
          <Route path={englishPath('auditRunner')} element={<AuditRunner />} />
          <Route path={englishPath('audits')} element={<AuditsList />} />
          <Route path={englishPath('auditResults')} element={<AuditResults />} />
          <Route path={englishPath('materialsProject')} element={<MaterialsList />} />
          <Route path={englishPath('materialsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.materialsGate} />} />
          <Route path={englishPath('compose')} element={<GenerationComposer />} />
          <Route path={englishPath('generationsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.generationsGate} />} />
          <Route path={englishPath('templates')} element={<TemplatesList />} />
          <Route path={englishPath('templateEditor')} element={<TemplateEditor />} />
          <Route path={englishPath('fixes')} element={<FixesPage />} />
          <Route path={englishPath('reports')} element={<ReportsList />} />
          <Route path={englishPath('generationReview')} element={<GenerationReview />} />
          <Route path={englishPath('channelsProject')} element={<ChannelsList />} />
          <Route path={englishPath('channelsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.channelsGate} />} />
          <Route path={englishPath('channelEditor')} element={<ChannelEditor />} />
          <Route path={englishPath('publishDetail')} element={<PublishDetail />} />
          <Route path={englishPath('agentBundle')} element={<AgentBundleView />} />
          <Route path={englishPath('settings')} element={<Settings />} />

          {/* pt-BR segment tree */}
          <Route path={ptBRPath('projects')} element={<ProjectsList />} />
          <Route path={ptBRPath('projectDashboard')} element={<ProjectDashboard />} />
          <Route path={ptBRPath('auditRunner')} element={<AuditRunner />} />
          <Route path={ptBRPath('audits')} element={<AuditsList />} />
          <Route path={ptBRPath('auditResults')} element={<AuditResults />} />
          <Route path={ptBRPath('materialsProject')} element={<MaterialsList />} />
          <Route path={ptBRPath('materialsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.ptMaterialsGate} />} />
          <Route path={ptBRPath('compose')} element={<GenerationComposer />} />
          <Route path={ptBRPath('generationsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.ptGenerationsGate} />} />
          <Route path={ptBRPath('templates')} element={<TemplatesList />} />
          <Route path={ptBRPath('templateEditor')} element={<TemplateEditor />} />
          <Route path={ptBRPath('fixes')} element={<FixesPage />} />
          <Route path={ptBRPath('reports')} element={<ReportsList />} />
          <Route path={ptBRPath('generationReview')} element={<GenerationReview />} />
          <Route path={ptBRPath('channelsProject')} element={<ChannelsList />} />
          <Route path={ptBRPath('channelsGate')} element={<ProjectScopedGate redirectTemplate={GATE_REDIRECTS.ptChannelsGate} />} />
          <Route path={ptBRPath('channelEditor')} element={<ChannelEditor />} />
          <Route path={englishPath('publishDetail')} element={<PublishDetail />} />
          <Route path={englishPath('agentBundle')} element={<AgentBundleView />} />
          <Route path={ptBRPath('settings')} element={<Settings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}