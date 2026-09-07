import { NavLink, Outlet } from 'react-router-dom'

const LINKS = [
  { to: '/account', label: '👤 Overview', end: true },
  { to: '/account/reports', label: '📄 My reports' },
  { to: '/account/saved', label: '🔖 Saved & liked' },
  { to: '/account/verifications', label: '🔎 Verification requests' },
  { to: '/account/requests', label: '🧾 Custom research' },
  { to: '/account/alerts', label: '🔔 Watching & alerts' },
  { to: '/account/support', label: '💬 Support' },
  { to: '/notifications', label: '📥 Notifications' },
]

/** Sidebar shell for the authenticated buyer account area. */
export function AccountShell() {
  return (
    <div className="container page">
      <div className="account-layout">
        <aside style={{ position: 'sticky', top: 84 }}>
          <nav className="card" aria-label="Account" style={{ padding: 10 }}>
            <ul className="stack" style={{ gap: 2 }}>
              {LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className="dropdown__item"
                    style={({ isActive }) => (isActive ? { background: 'var(--cc-surface-2)', color: 'var(--cc-gold)' } : undefined)}
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div style={{ minWidth: 0 }}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
