import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyNotifications } from '../api/notification.api'
import { initial } from '../lib/format'

// Buyer Experience redesign — simplified to exactly these 4 primary items.
// Coverage/Property Updates/Owner listings/Support keep their routes (still
// reachable — Reporter/Owner content now surfaces inside the Home feed, and
// Support lives inside Profile/account), they're just no longer top-level
// nav entries.
const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/expert-properties', label: 'Expert Properties' },
  { to: '/browse', label: 'Browse Property' },
  { to: '/account', label: 'Profile' },
]

export function Header() {
  const { status, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [query, setQuery] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status !== 'authenticated') return
    let live = true
    void getMyNotifications()
      .then((res) => {
        if (live) setUnread(res.unreadCount)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [status])

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(query.trim() ? `/expert-properties?q=${encodeURIComponent(query.trim())}` : '/expert-properties')
    setMobileOpen(false)
  }

  const handleLogout = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/')
  }

  return (
    <>
      <header className="site-header">
        <div className="container row" style={{ gap: 20 }}>
          <button
            type="button"
            className="menu-toggle"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? '✕' : '☰'}
          </button>

          <Link to="/" className="brand" aria-label="CivilCheck home">
            <span className="brand__mark" aria-hidden="true">
              C
            </span>
            CivilCheck
          </Link>

          <nav className="nav-links" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <form className="header-search" role="search" onSubmit={handleSearch}>
            <span className="header-search__icon" aria-hidden="true">
              🔍
            </span>
            <input
              type="search"
              placeholder="Search by address, city, khasra…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search properties"
            />
          </form>

          <div className="header-actions">
            {status === 'authenticated' && user ? (
              <>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
                  onClick={() => navigate('/notifications')}
                >
                  🔔
                  {unread > 0 ? <span className="icon-btn__dot" aria-hidden="true" /> : null}
                </button>
                <div className="menu-wrap" ref={menuRef}>
                  <button
                    type="button"
                    className="avatar"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="Account menu"
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    {initial(user.name, user.email, user.phone)}
                  </button>
                  {menuOpen ? (
                    <div className="dropdown" role="menu">
                      <div style={{ padding: '8px 12px 10px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{user.name || 'Buyer'}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {user.email || user.phone}
                        </div>
                      </div>
                      <div className="dropdown__divider" />
                      {/* My reports/Verifications/Support all live inside the Profile tab's
                          account sidebar now (AccountShell) — no need to duplicate them here. */}
                      <Link to="/account" className="dropdown__item" role="menuitem" onClick={() => setMenuOpen(false)}>
                        👤 Profile
                      </Link>
                      <div className="dropdown__divider" />
                      <button type="button" className="dropdown__item" role="menuitem" onClick={() => void handleLogout()}>
                        🚪 Log out
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn--secondary btn--sm">
                  Log in
                </Link>
                <Link to="/register" className="btn btn--primary btn--sm">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <nav className="mobile-nav" aria-label="Mobile">
          <form className="row" style={{ padding: '12px var(--cc-gutter)' }} onSubmit={handleSearch}>
            <input
              type="search"
              className="field__control"
              placeholder="Search properties…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search properties"
            />
          </form>
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className="nav-link" onClick={() => setMobileOpen(false)}>
              {link.label}
            </NavLink>
          ))}
          {status === 'authenticated' ? (
            <NavLink to="/account" className="nav-link" onClick={() => setMobileOpen(false)}>
              My account
            </NavLink>
          ) : null}
        </nav>
      ) : null}
    </>
  )
}
