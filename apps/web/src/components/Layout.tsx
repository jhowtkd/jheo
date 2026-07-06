import { Outlet, Link } from 'react-router-dom';

export function Layout() {
  return (
    <div>
      <header style={{ padding: '12px 24px', borderBottom: '1px solid #eee' }}>
        <Link to="/projects" style={{ fontWeight: 600, textDecoration: 'none' }}>JHEO</Link>
      </header>
      <main style={{ padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
