import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { queryClient } from './queryClient.js';
import { ensureI18n } from './i18n';
import { applyStoredTheme } from './theme/theme.js';
import './styles.css';

applyStoredTheme();

ensureI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
});
