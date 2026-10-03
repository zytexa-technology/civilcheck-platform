import { useEffect, useState, lazy, Suspense } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import { roleLabel } from '../utils/permissions'
import { logout } from '../api/auth.api'
import { LoadingState } from '../components/ui'

// DashboardHome is the index route — what an admin sees immediately after
// login/reload — so it stays a normal eager import; nothing should delay it.
// Every other page here is one click away, not on the critical first-paint
// path, so it's lazy-loaded: its code only downloads when actually
// navigated to, instead of all 24 pages' code shipping in the same bundle
// the admin waits on just to see the Dashboard. Routing/behavior is
// unchanged — React.lazy + the <Suspense> below only changes when the
// code downloads, not what renders once it has.
import DashboardHome from './admin/DashboardHome'
const Sellers = lazy(() => import('./admin/Sellers'))
const Listings = lazy(() => import('./admin/Listings'))
const Properties = lazy(() => import('./admin/Properties'))
const ReporterPosts = lazy(() => import('./admin/ReporterPosts'))
const RewardLedger = lazy(() => import('./admin/RewardLedger'))
const FinancialDashboard = lazy(() => import('./admin/FinancialDashboard'))
const SpecialRequests = lazy(() => import('./admin/SpecialRequests'))
const VerificationRequests = lazy(() => import('./admin/VerificationRequests'))
const Claims = lazy(() => import('./admin/Claims'))
const ReportFlags = lazy(() => import('./admin/ReportFlags'))
const Analytics = lazy(() => import('./admin/Analytics'))
const Buyers = lazy(() => import('./admin/Buyers'))
const Refunds = lazy(() => import('./admin/Refunds'))
const Reports = lazy(() => import('./admin/Reports'))
const AlertSubs = lazy(() => import('./admin/AlertSubs'))
const Settings = lazy(() => import('./admin/Settings'))
const AuditLog = lazy(() => import('./admin/AuditLog'))
const Admins = lazy(() => import('./admin/Admins'))
const PayoutLedger = lazy(() => import('./admin/PayoutLedger'))
const ContentControl = lazy(() => import('./admin/ContentControl'))
const Payments = lazy(() => import('./admin/Payments'))
const AdminSettlements = lazy(() => import('./admin/Settlements'))
const Security = lazy(() => import('./admin/Security'))
const SupportDashboard = lazy(() => import('./admin/SupportDashboard'))
const DeletedRecords = lazy(() => import('./admin/DeletedRecords'))
const Advertisements = lazy(() => import('./admin/Advertisements'))

// ─── NAV ITEMS ────────────────────────────────────────────────────────────
// `id` doubles as the route path segment under /dashboard/*.
const NAV = [
  { section: 'Main' },
  { id: '', icon: '📊', label: 'Dashboard', title: 'Dashboard' },
  { id: 'analytics', icon: '📈', label: 'Analytics', title: 'Analytics' },
  { section: 'Management' },
  { id: 'admins', icon: '🛡️', label: 'Admins', title: 'Admin Management' },
  { id: 'sellers', icon: '👤', label: 'Partners', title: 'Partner Management' },
  { id: 'listings', icon: '🏠', label: 'Expert Posts', title: 'Expert Posts' },
  { id: 'properties', icon: '🏘️', label: 'Owner Properties', title: 'Owner Properties' },
  { id: 'reporter-posts', icon: '📰', label: 'Reporter Posts', title: 'Reporter Posts' },
  { id: 'rewards', icon: '🎁', label: 'Reward Ledger', title: 'Reporter Reward Ledger' },
  { id: 'finance', icon: '💰', label: 'Financial Dashboard', title: 'Financial Dashboard' },
  { id: 'buyers', icon: '👤', label: 'Users', title: 'Users' },
  { id: 'special', icon: '🔍', label: 'Special Requests', title: 'Special Requests' },
  { id: 'verification-requests', icon: '🧾', label: 'Verification Requests', title: 'Verification Requests' },
  { id: 'claims', icon: '⚖️', label: 'Claims', title: 'Claims Review' },
  { id: 'report-flags', icon: '🚩', label: 'Report Flags', title: 'Report Flags' },
  { id: 'support', icon: '💬', label: 'AI / Human Support', title: 'AI / Human Support' },
  { id: 'content', icon: '📝', label: 'Content Control', title: 'Content Control' },
  { section: 'Finance' },
  { id: 'payments', icon: '💳', label: 'Payments', title: 'Payments' },
  { id: 'settlements', icon: '🏦', label: 'Settlements', title: 'Settlements' },
  { id: 'payout-ledger', icon: '📒', label: 'Payout Ledger', title: 'Partner Payout Ledger' },
  { id: 'refunds', icon: '↩️', label: 'Refunds', title: 'Refunds' },
  { section: 'Setting' },
  { id: 'reports', icon: '📋', label: 'Reports', title: 'Reports' },
  { id: 'alertsubs', icon: '🔔', label: 'Alert Subs', title: 'Alert Subs' },
  { id: 'audit-log', icon: '🧾', label: 'Audit Log', title: 'Audit Log' },
  { id: 'deleted', icon: '🗑️', label: 'Deleted / Removed', title: 'Deleted / Removed', superOnly: true },
  { id: 'advertisements', icon: '📣', label: 'Advertisements', title: 'Advertisements', superOnly: true },
  { id: 'security', icon: '🔒', label: 'Security', title: 'Security' },
  { id: 'settings', icon: '⚙️', label: 'Settings', title: 'Settings' },
]

function initials(name) {
  if (!name) return 'AD'
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function Dashboard() {
  const { admin, logoutAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close the mobile drawer automatically on route change, so navigating
  // from the sidebar doesn't leave it open over the new page.
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    // Server call must happen before logoutAdmin() clears the token —
    // axios.js's request interceptor reads it from localStorage on every
    // call. Still logs the admin out locally even if this fails (offline,
    // already-expired token), since that's a client-side affordance either way.
    try {
      await logout()
    } catch {
      // ignore — proceed to clear local session regardless
    } finally {
      logoutAdmin()
      navigate('/login')
    }
  }

  // location.pathname is like "/dashboard", "/dashboard/sellers", etc.
  const activeSegment = location.pathname.replace(/^\/dashboard\/?/, '')
  const activeItem = NAV.find((n) => !n.section && n.id === activeSegment)

  return (
    <div className="admin-shell">
      {/* ── Mobile Overlay ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 99 }}
          aria-hidden="true"
        />
      )}

      {/* ── SIDEBAR ── */}
      <nav
        className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}
        aria-label="Admin navigation"
      >
        <div className="admin-sidebar-logo">
          <div className="admin-sidebar-icon">🛡️</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>CivilCheck</div>
            <div className="small muted">{admin?.role ? roleLabel(admin.role) : 'Admin'}</div>
          </div>
        </div>

        <div className="admin-nav">
          {NAV.filter((n) => !n.superOnly || admin?.role === 'SUPER_ADMIN').map((n, i) => {
            if (n.section) {
              return (
                <div key={i} className="admin-nav-section">
                  {n.section}
                </div>
              )
            }
            const active = activeSegment === n.id
            return (
              <button
                key={n.id || 'home'}
                type="button"
                onClick={() => {
                  navigate(n.id ? `/dashboard/${n.id}` : '/dashboard')
                  setSidebarOpen(false)
                }}
                className={`admin-nav-item ${active ? 'on' : ''}`}
                style={{ width: '100%', textAlign: 'left' }}
                aria-current={active ? 'page' : undefined}
              >
                <span style={{ fontSize: 15 }} aria-hidden="true">{n.icon}</span>
                <span style={{ flex: 1 }}>{n.label}</span>
              </button>
            )
          })}
        </div>

        <div style={{ padding: '14px 10px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gold)', color: 'var(--on-gold)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {initials(admin?.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{admin?.name || 'Admin'}</div>
              <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{admin?.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 8 }}>
            🚪 Sign out
          </button>
        </div>
      </nav>

      {/* ── RIGHT SIDE ── */}
      <div className="admin-main">
        <div className="admin-topbar">
          <button
            className="admin-hamburger btn-icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle navigation"
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{activeItem?.title || 'Dashboard'}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="badge grey" style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              {new Date().toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </div>
          </div>
        </div>

        <div className="admin-content">
          {/* Only this content area waits on a lazy page's chunk — the
              sidebar/header above stay mounted and interactive throughout. */}
          <Suspense fallback={<LoadingState label="Loading page…" />}>
          <Routes>
            <Route index element={<DashboardHome />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="admins" element={<Admins />} />
            <Route path="sellers" element={<Sellers />} />
            <Route path="listings" element={<Listings />} />
            <Route path="properties" element={<Properties />} />
            <Route path="reporter-posts" element={<ReporterPosts />} />
            <Route path="rewards" element={<RewardLedger />} />
            <Route path="finance" element={<FinancialDashboard />} />
            <Route path="buyers" element={<Buyers />} />
            <Route path="special" element={<SpecialRequests />} />
            <Route path="verification-requests" element={<VerificationRequests />} />
            <Route path="claims" element={<Claims />} />
            <Route path="report-flags" element={<ReportFlags />} />
            <Route path="support" element={<SupportDashboard />} />
            <Route path="content" element={<ContentControl />} />
            <Route path="payments" element={<Payments />} />
            <Route path="settlements" element={<AdminSettlements />} />
            <Route path="payout-ledger" element={<PayoutLedger />} />
            <Route path="refunds" element={<Refunds />} />
            <Route path="reports" element={<Reports />} />
            <Route path="alertsubs" element={<AlertSubs />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route
              path="advertisements"
              element={admin?.role === 'SUPER_ADMIN' ? <Advertisements /> : <Navigate to="/dashboard" replace />}
            />
            <Route
              path="deleted"
              element={admin?.role === 'SUPER_ADMIN' ? <DeletedRecords /> : <Navigate to="/dashboard" replace />}
            />
            <Route path="security" element={<Security />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  )
}

