import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';

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

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsList />} />
          <Route path="/projects/:projectId" element={<ProjectDashboard />} />
          <Route path="/projects/:projectId/audit" element={<AuditRunner />} />
          <Route path="/audits/:auditId" element={<AuditResults />} />
          <Route path="/projects/:projectId/materials" element={<MaterialsList />} />
          <Route path="/projects/:projectId/compose" element={<GenerationComposer />} />
          <Route path="/templates" element={<TemplatesList />} />
          <Route path="/templates/:templateId" element={<TemplateEditor />} />
          <Route path="/fixes" element={<FixesPage />} />
          <Route path="/reports" element={<ReportsList />} />
          <Route path="/generations/:generationId" element={<GenerationReview />} />
          <Route path="/projects/:projectId/channels" element={<ChannelsList />} />
          <Route path="/channels/:channelId" element={<ChannelEditor />} />
          <Route path="/publishes/:publishId" element={<PublishDetail />} />
          <Route
            path="/publishes/:publishId/bundle"
            element={<AgentBundleView />}
          />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
