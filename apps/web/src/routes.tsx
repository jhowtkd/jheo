import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { ProjectsList } from './pages/ProjectsList.js';
import { ProjectDashboard } from './pages/ProjectDashboard.js';
import { AuditRunner } from './pages/AuditRunner.js';
import { AuditResults } from './pages/AuditResults.js';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsList />} />
        <Route path="/projects/:projectId" element={<ProjectDashboard />} />
        <Route path="/projects/:projectId/audit" element={<AuditRunner />} />
        <Route path="/audits/:auditId" element={<AuditResults />} />
      </Route>
    </Routes>
  );
}
