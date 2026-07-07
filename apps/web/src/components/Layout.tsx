import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
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

const NAV: NavItem[] = [
  {
    to: '/projects',
    label: 'Projects',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
        <path d="M3 7l9 4 9-4" />
        <path d="M12 11v10" />
      </svg>
    ),
  },
  {
    to: '/templates',
    label: 'Templates',
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
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

function Crumb() {
  const loc = useLocation();
  const parts = loc.pathname.split('/').filter(Boolean);
  if (parts.length === 0) {
    return <span className="topbar__crumb"><span>Projects</span></span>;
  }
  return (
    <nav className="topbar__crumb" aria-label="Breadcrumb">
      <a href="/projects" onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/projects'); window.dispatchEvent(new PopStateEvent('popstate')); }}>Projects</a>
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
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      const start = performance.now();
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (!cancelled) {
          setLatencyMs(Math.round(performance.now() - start));
          setDown(!r.ok);
        }
      } catch {
        if (!cancelled) {
          setLatencyMs(null);
          setDown(true);
        }
      }
    }
    ping();
    const id = setInterval(ping, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="topbar__health" title={down ? 'Backend unreachable' : 'Backend healthy'}>
      <span className="topbar__health-dot" style={down ? { background: 'var(--danger)', boxShadow: '0 0 8px rgba(239,68,68,0.4)' } : undefined} />
      <span>API {down ? 'down' : latencyMs !== null ? `${latencyMs}ms` : '…'}</span>
    </div>
  );
}

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo"><Logo /></div>
          <div className="sidebar__wordmark">
            <div className="sidebar__wordmark-name">JHEO</div>
            <div className="sidebar__wordmark-tag">GEO · SEO · content</div>
          </div>
        </div>
        <div className="sidebar__section-label">Workspace</div>
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
              <span>{item.label}</span>
              {item.badge && <span className="sidebar__badge">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__avatar">JS</div>
          <div className="sidebar__user">
            <div className="sidebar__user-name">Local user</div>
            <div className="sidebar__user-meta">single-user · v0.1.0</div>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Crumb />
          <div className="topbar__actions">
            <HealthIndicator />
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}