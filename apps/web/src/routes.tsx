import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { ProjectsList } from './pages/ProjectsList.js';
import { ProjectDashboard } from './pages/ProjectDashboard.js';
import { AuditRunner } from './pages/AuditRunner.js';
import { AuditResults } from './pages/AuditResults.js';
import { MaterialsList } from './pages/MaterialsList.js';
import { TemplatesList } from './pages/TemplatesList.js';
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
        <Route path="/templates" element={<TemplatesList />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}