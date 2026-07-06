import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { ProjectsList } from './pages/ProjectsList.js';
import { ProjectDashboard } from './pages/ProjectDashboard.js';
import { AuditRunner } from './pages/AuditRunner.js';
import { AuditResults } from './pages/AuditResults.js';
import { MaterialsList } from './pages/MaterialsList.js';
import { TemplatesList } from './pages/TemplatesList.js';
import { TemplateEditor } from './pages/TemplateEditor.js';
import { GenerationComposer } from './pages/GenerationComposer.js';
import { GenerationReview } from './pages/GenerationReview.js';
import { ChannelsList } from './pages/ChannelsList.js';
import { ChannelEditor } from './pages/ChannelEditor.js';
import { PublishDetail } from './pages/PublishDetail.js';
import { AgentBundleView } from './pages/AgentBundleView.js';
import { Settings } from './pages/Settings.js';

export function AppRoutes() {
  return (
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
        <Route path="/generations/:generationId" element={<GenerationReview />} />
        <Route path="/projects/:projectId/channels" element={<ChannelsList />} />
        <Route path="/channels/:channelId" element={<ChannelEditor />} />
        <Route path="/publishes/:publishId" element={<PublishDetail />} />
        <Route path="/publishes/:publishId/bundle" element={<AgentBundleView />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
