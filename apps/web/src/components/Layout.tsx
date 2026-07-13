import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LanguageToggle } from './LanguageToggle.js';
import { ThemeToggle } from './ThemeToggle.js';
import { RouteListener } from './RouteListener.js';
import { recordNavClick } from '../telemetry/sessionTelemetry.js';
import { useBackendReachable } from '../hooks/useBackendReachable.js';
import { localePath, routeIdFromPath, type RouteId } from '../i18n/localePath.js';

interface NavItem {
  id: RouteId;
  labelKey: string;
  hintKey: string;
  badge?: string;
  icon: JSX.Element;
}

function Logo() {
  // Custom mark: an abstract "J" merged with a search/audit glyph.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4v12a4 4 0 0 0 4 4h2" stroke="var(--accent-bright)" />
      <circle cx="17" cy="17" r="4" stroke="var(--accent-bright)" />
      <line x1="20" y1="20" x2="22.5" y2="22.5" stroke="var(--accent)" />
    </svg>
  );
}

// Crumb root resolution: first segment may be en OR pt-BR.
// The reverse map is duplicated here (small) so the breadcrumb doesn't have
// to import the full localePath module for what is essentially a label swap.
const CRUMB_ROOT_EN: Record<string, string> = {
  projects: 'nav.projects',
  audits: 'nav.audits',
  reports: 'nav.reports',
  templates: 'nav.templates',
  materials: 'nav.materials',
  generations: 'nav.generations',
  fixes: 'nav.fixes',
  channels: 'nav.channels',
  settings: 'nav.settings',
};
const CRUMB_ROOT_PT: Record<string, string> = {
  projetos: 'nav.projects',
  auditorias: 'nav.audits',
  relatorios: 'nav.reports',
  modelos: 'nav.templates',
  materiais: 'nav.materials',
  geracoes: 'nav.generations',
  correcoes: 'nav.fixes',
  canais: 'nav.channels',
  configuracoes: 'nav.settings',
};

function Crumb() {
  const { t } = useTranslation();
  const loc = useLocation();
  const parts = loc.pathname.split('/').filter(Boolean);
  if (parts.length === 0) {
    return <span className="topbar__crumb"><span>{t('nav.projects')}</span></span>;
  }
  const firstSeg = parts[0]!;
  const rootKey = CRUMB_ROOT_EN[firstSeg] ?? CRUMB_ROOT_PT[firstSeg] ?? 'nav.projects';
  // Use the active locale's canonical path for the crumb link, not the URL's
  // first segment — a pt-BR user on a bookmarked /projects/abc URL still
  // expects clicking the crumb to land on /projetos.
  const id = routeIdFromPath(loc.pathname);
  const crumbTo = id ? localePath(id) : `/${firstSeg}`;
  return (
    <nav className="topbar__crumb" aria-label={t('topbar.breadcrumb')}>
      <NavLink to={crumbTo} end>{t(rootKey)}</NavLink>
      {parts.slice(1).map((p, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="topbar__sep">/</span>
          <span>{p.length > 18 ? p.slice(0, 14) + '…' : p}</span>
        </span>
      ))}
    </nav>
  );
}

function HealthIndicator() {
  const { t } = useTranslation();
  const { status, latencyMs } = useBackendReachable();
  const down = status === 'down';
  return (
    <div className="topbar__health" title={down ? 'Backend unreachable' : 'Backend healthy'}>
      <span
        className="topbar__health-dot"
        style={down ? { background: 'var(--danger)', boxShadow: '0 0 8px rgba(239,68,68,0.4)' } : undefined}
      />
      <span>
        {t('topbar.api')} {down ? t('topbar.down') : status === 'reachable' && latencyMs !== null ? `${latencyMs}ms` : '…'}
      </span>
    </div>
  );
}

const NAV_IDS: RouteId[] = [
  'projects',
  'audits',
  'templates',
  'materialsGate',
  'generationsGate',
  'fixes',
  'channelsGate',
  'settings',
];

export function Layout() {
  const { t } = useTranslation();
  const NAV: NavItem[] = [
    {
      id: 'projects',
      labelKey: 'nav.projects',
      hintKey: 'nav.projectsHint',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
          <path d="M3 7l9 4 9-4" />
          <path d="M12 11v10" />
        </svg>
      ),
    },
    {
      id: 'audits',
      labelKey: 'nav.audits',
      hintKey: 'nav.auditsHint',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      id: 'templates',
      labelKey: 'nav.templates',
      hintKey: 'nav.templatesHint',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="13" y2="16" />
        </svg>
      ),
    },
    {
      id: 'materialsGate',
      labelKey: 'nav.materials',
      hintKey: 'nav.materialsHint',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
    {
      id: 'generationsGate',
      labelKey: 'nav.generations',
      hintKey: 'nav.generationsHint',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
        </svg>
      ),
    },
    {
      id: 'fixes',
      labelKey: 'nav.fixes',
      hintKey: 'nav.fixesHint',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12l4 4 14-14" />
          <path d="M3 18l4 4 14-14" />
        </svg>
      ),
    },
    {
      id: 'channelsGate',
      labelKey: 'nav.channels',
      hintKey: 'nav.channelsHint',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11h18" />
          <path d="M3 11l3-6h12l3 6" />
          <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
        </svg>
      ),
    },
    {
      id: 'settings',
      labelKey: 'nav.settings',
      hintKey: 'nav.settingsHint',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];
  // Compile-time check that NAV_IDS matches NAV (cheap way to keep them in sync)
  if (NAV_IDS.length !== NAV.length || NAV.some((n, i) => n.id !== NAV_IDS[i])) {
    throw new Error('NAV_IDS out of sync with NAV — update both');
  }

  return (
    <div className="app-shell">
      <RouteListener />
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo"><Logo /></div>
          <div className="sidebar__wordmark">
            <div className="sidebar__wordmark-name">{t('app.name')}</div>
            <div className="sidebar__wordmark-tag" title={t('app.taglineHint')}>{t('app.tagline')}</div>
          </div>
        </div>
        <div className="sidebar__section-label">{t('sidebar.workspace')}</div>
        <nav className="sidebar__nav">
          {NAV.map((item) => (
            <NavLink
              key={item.id}
              to={localePath(item.id)}
              end={item.id === 'projects'}
              title={t(item.hintKey)}
              onClick={() => recordNavClick(item.id)}
              className={({ isActive }) =>
                'sidebar__link' + (isActive ? ' sidebar__link--active' : '')
              }
            >
              <span className="sidebar__link-icon">{item.icon}</span>
              <span>{t(item.labelKey)}</span>
              {item.badge && <span className="sidebar__badge">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__avatar">JS</div>
          <div className="sidebar__user">
            <div className="sidebar__user-name">{t('sidebar.userName')}</div>
            <div className="sidebar__user-meta">{t('sidebar.userMeta')}</div>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Crumb />
          <div className="topbar__actions">
            <LanguageToggle />
            <ThemeToggle />
            <HealthIndicator />
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}