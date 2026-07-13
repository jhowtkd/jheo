import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LanguageToggle } from './LanguageToggle.js';
import { ThemeToggle } from './ThemeToggle.js';
import { useBackendReachable } from '../hooks/useBackendReachable.js';

interface NavItem {
  to: string;
  labelKey: string;
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

const CRUMB_ROOT: Record<string, string> = {
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

function Crumb() {
  const { t } = useTranslation();
  const loc = useLocation();
  const parts = loc.pathname.split('/').filter(Boolean);
  if (parts.length === 0) {
    return <span className="topbar__crumb"><span>{t('nav.projects')}</span></span>;
  }
  const rootKey = CRUMB_ROOT[parts[0]!] ?? 'nav.projects';
  const rootHref = `/${parts[0]}`;
  return (
    <nav className="topbar__crumb" aria-label={t('topbar.breadcrumb')}>
      <NavLink to={rootHref} end>{t(rootKey)}</NavLink>
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

export function Layout() {
  const { t } = useTranslation();
  const NAV: NavItem[] = [
    {
      to: '/projects',
      labelKey: 'nav.projects',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
          <path d="M3 7l9 4 9-4" />
          <path d="M12 11v10" />
        </svg>
      ),
    },
    {
      to: '/audits',
      labelKey: 'nav.audits',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      to: '/templates',
      labelKey: 'nav.templates',
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
      to: '/materials',
      labelKey: 'nav.materials',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
    {
      to: '/generations',
      labelKey: 'nav.generations',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
        </svg>
      ),
    },
    {
      to: '/fixes',
      labelKey: 'nav.fixes',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12l4 4 14-14" />
          <path d="M3 18l4 4 14-14" />
        </svg>
      ),
    },
    {
      to: '/channels',
      labelKey: 'nav.channels',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11h18" />
          <path d="M3 11l3-6h12l3 6" />
          <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
        </svg>
      ),
    },
    {
      to: '/settings',
      labelKey: 'nav.settings',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo"><Logo /></div>
          <div className="sidebar__wordmark">
            <div className="sidebar__wordmark-name">{t('app.name')}</div>
            <div className="sidebar__wordmark-tag">{t('app.tagline')}</div>
          </div>
        </div>
        <div className="sidebar__section-label">{t('sidebar.workspace')}</div>
        <nav className="sidebar__nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/projects'}
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
