// ─────────────────────────────────────────────────────────────────────────
//  Layout.jsx  —  Partner Portal shell   (updated: Owner Dashboard + Properties wired)
//  RAKHNA: src/pages/Layout.jsx  (poora replace karo)
//
//  Jaise-jaise nayi pages aayengi, sirf 2 jagah change hoti hai:
//   (1) upar import add   (2) PAGES registry me Placeholder → real component
//  Main har page ke saath poora updated Layout de dunga.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getNotifications, getAvailableRequests } from '../api/seller.api'
import { Icon, Seal } from '../components/Icon'
import { Card, PageHead, ToastHost } from '../components/ui'

// ── ROLE PAGES (jaise aayengi, yahan import hoti jayengi) ──
import OwnerDashboard from './owner/Dashboard'
import OwnerProperties from './owner/MyProperties'
import OwnerAddProperty from './owner/AddProperty'
import OwnerAnalytics from './owner/Analytics'
// Reporter posts property-information/news content (ReporterPost), not a
// Property listing — no admin approval gate, live in the buyer feed
// immediately (see apps/api/src/routes/reporterPost.routes.ts + reward.routes.ts).
import ReporterDashboard from './reporter/Dashboard'
import ReporterPosts from './reporter/MyPosts'
import ReporterAddPost from './reporter/AddPost'
import ReporterRewards from './reporter/Rewards'
import ExpertDashboard from './expert/Dashboard'
import ExpertRequests from './expert/Requests'
import ExpertReports from './expert/Reports'
import ExpertEarnings from './expert/Earnings'
// Property Verification Marketplace (Phase 3) — the professional-quoting
// side, distinct from ExpertRequests (the older Special Request workflow).
import ExpertVerificationRequests from './expert/VerificationRequests'
// Verification Marketplace earnings/payouts (Phase 4B) — a separate money
// system (paid professional verification jobs) from expert/Earnings.jsx's
// Report-Unlock/weekly-settlement money.
import ExpertVerificationEarnings from './expert/VerificationEarnings'
import ExpertRatings from './expert/Ratings'
// Replaced expert/Verification.jsx, which listed seven documents as
// "Uploaded ✓" unconditionally — four of them had no backend field at all.
import SellerKYC from './seller/KYC'
// Purane seller dashboard ke listing pages (expert inhe use karega)
import SellerMyListings from './seller/MyListings'
import SellerNewListing from './seller/NewListing'
import SellerSettlements from './seller/Settlements'
import Notifications from './shared/Notifications'
import Profile from './shared/Profile'

// ─── ROLE META ──────────────────────────────────────────────────────────────
const RM = {
  OWNER:    { emo: '🏠', name: 'Property Owner' },
  REPORTER: { emo: '📝', name: 'Reporter' },
  EXPERT:   { emo: '⚖️', name: 'Property Expert' },
}

// ─── NAV per role ───────────────────────────────────────────────────────────
// item = [sectionId, label]. Badge counts are NOT hardcoded here — they come
// from real data (unread notifications / available requests), computed below.
const NAV = {
  OWNER: [
    { g: 'Overview', items: [['dash', 'Dashboard'], ['props', 'My Properties'], ['add', 'Add Property'], ['chart', 'Analytics']] },
    // Owners are Seller rows too — they need KYC to be paid out, same as experts.
    { g: 'Account',  items: [['shield', 'KYC & Documents'], ['bell', 'Notifications'], ['user', 'Profile']] },
  ],
  REPORTER: [
    { g: 'Overview', items: [['dash', 'Dashboard'], ['props', 'My Posts'], ['add', 'Post Update'], ['wallet', 'Wallet & Rewards']] },
    { g: 'Account',  items: [['bell', 'Notifications'], ['user', 'Profile']] },
  ],
  EXPERT: [
    { g: 'Work',     items: [['dash', 'Dashboard'], ['inbox', 'Requests'], ['vreq', 'Verification Requests'], ['file', 'Reports']] },
    // Property Listing — purane seller dashboard wale pages (case details, price, etc.)
    { g: 'Listings', items: [['props', 'My Listings'], ['plus', 'New Listing']] },
    { g: 'Finance',  items: [['money', 'Earnings'], ['vmoney', 'Verification Earnings'], ['settle', 'Settlements'], ['star', 'Ratings']] },
    { g: 'Account',  items: [['shield', 'KYC & Documents'], ['bell', 'Notifications'], ['user', 'Profile']] },
  ],
}

// section id → page title
const TITLES = {
  dash: 'Dashboard', props: 'My Properties', add: 'Add Property', chart: 'Analytics',
  bell: 'Notifications', user: 'Profile', feed: 'My Uploads', wallet: 'Wallet & Rewards',
  trophy: 'Leaderboard', inbox: 'Requests', file: 'Reports', money: 'Earnings',
  vmoney: 'Verification Earnings', vreq: 'Verification Requests',
  star: 'Ratings & Reviews', shield: 'KYC & Documents', plus: 'New Listing',
  settle: 'Settlements',
}
const titleFor = (role, sec) => {
  if (role === 'EXPERT' && sec === 'props') return 'My Listings'   // expert me props = listings
  if (role === 'REPORTER' && sec === 'props') return 'My Posts'
  if (role === 'REPORTER' && sec === 'add') return 'Post Update'
  return TITLES[sec] || 'Dashboard'
}

// ─── PAGES REGISTRY ─────────────────────────────────────────────────────────
const PAGES = {
  shared:   { user: Profile, bell: Notifications, shield: SellerKYC },
  OWNER:    { dash: OwnerDashboard, props: OwnerProperties, add: OwnerAddProperty, chart: OwnerAnalytics },
  REPORTER: { dash: ReporterDashboard, props: ReporterPosts, add: ReporterAddPost, wallet: ReporterRewards },
  EXPERT:   { dash: ExpertDashboard, inbox: ExpertRequests, vreq: ExpertVerificationRequests, file: ExpertReports, money: ExpertEarnings, vmoney: ExpertVerificationEarnings, star: ExpertRatings,
              props: SellerMyListings, plus: SellerNewListing, settle: SellerSettlements },   // ← property listing + settlements (purane seller pages)
}

// ════════════════════════════════════════════════════════════════════════════
export default function Layout() {
  const { seller, roles, activeRole, logoutSeller } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Both branches must be validated against RM — a stale/legacy partnerRole
  // value (e.g. the removed 'reporter' role, still possible on an old DB row)
  // would otherwise white-screen the whole portal below (NAV[safeRole] etc.
  // would all be undefined).
  const firstValidRole = roles.find((r) => RM[r])
  const safeRole = (activeRole && RM[activeRole]) ? activeRole : (firstValidRole || 'OWNER')
  const defaultSection = NAV[safeRole]?.[0].items[0][0] || 'dash'
  // Section comes from the URL (/dashboard/:section) instead of local state —
  // real deep-linking, working back/forward (roadmap.md Day 1).
  const section = location.pathname.replace(/^\/dashboard\/?/, '') || defaultSection
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Real nav badge counts — refetched on every section change so visiting
  // Notifications/Requests clears the badge instead of it staying stuck.
  const [unreadCount, setUnreadCount] = useState(0)
  const [availableCount, setAvailableCount] = useState(0)

  useEffect(() => {
    let live = true
    getNotifications()
      .then((data) => { if (live) setUnreadCount(data?.unreadCount || 0) })
      .catch(() => {})
    if (safeRole === 'EXPERT') {
      getAvailableRequests()
        .then((data) => { if (live) setAvailableCount(data?.total || 0) })
        .catch(() => {})
    }
    return () => { live = false }
  }, [section, safeRole])

  const badgeFor = { bell: unreadCount, inbox: availableCount }

  const go = (sec) => {
    navigate(sec === defaultSection ? '/dashboard' : `/dashboard/${sec}`)
    if (window.innerWidth <= 900) setSidebarOpen(false)
  }
  const handleLogout = () => { logoutSeller(); navigate('/login', { replace: true }) }

  const Comp = PAGES.shared[section] || PAGES[safeRole]?.[section] || Placeholder

  const sellerName = seller?.name || 'Partner'
  const initial = (sellerName[0] || 'P').toUpperCase()
  const meta = RM[safeRole]

  return (
    <div className="portal">
      {/* ══ SIDEBAR ══ */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="top">
          <Seal size="sm" />
          <div><b>CivilCheck</b><div className="tag">PARTNER PORTAL</div></div>
        </div>

        {/* A seller has exactly one role (Seller.partnerRole on the backend)
            — no switcher, just a link to the Profile page for details. */}
        <div className="role-pill" onClick={() => go('user')} style={{ cursor: 'pointer' }}>
          <span className="emo">{meta.emo}</span>
          <div className="nm"><b>{meta.name}</b><span>View profile</span></div>
        </div>

        <nav className="nav">
          {NAV[safeRole].map((grp) => (
            <div key={grp.g}>
              <div className="lbl">{grp.g}</div>
              {grp.items.map(([id, label]) => (
                <a key={id} className={section === id ? 'on' : ''} onClick={() => go(id)}>
                  <Icon name={id} size={18} />
                  <span>{label}</span>
                  {badgeFor[id] ? <span className="badge">{badgeFor[id]}</span> : null}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="foot">
          <button className="btn btn-block" style={{ background: 'rgba(255,255,255,.06)', color: '#cfd8e4', justifyContent: 'flex-start' }} onClick={handleLogout}>
            <Icon name="logout" size={17} /> Log Out
          </button>
        </div>
      </aside>

      {/* ══ MAIN ══ */}
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen((o) => !o)}>
            <Icon name="menu" size={20} />
          </button>
          <h1 className="dev">{titleFor(safeRole, section)}</h1>
          <button className="icon-btn" onClick={() => go('bell')}>
            <Icon name="bell" size={19} />{unreadCount > 0 && <span className="dot" />}
          </button>
          <div className="who">
            <div className="avatar">{initial}</div>
            <div className="nm-txt">
              <div style={{ fontSize: 13, fontWeight: 600 }}>{sellerName}</div>
              <div className="xs muted">{meta.name}</div>
            </div>
          </div>
        </header>

        <div className="content">
          <Comp title={titleFor(safeRole, section)} go={go} />
        </div>
      </div>

      <div className={`overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
      <ToastHost />
    </div>
  )
}

// ─── PLACEHOLDER ────────────────────────────────────────────────────────────
function Placeholder({ title }) {
  return (
    <>
      <PageHead title={title || 'Coming soon'} subtitle="Yeh page agli file me aayega." />
      <Card style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🚧</div>
        <p className="muted dev">Is section ka page abhi banna baaki hai — jaise hi file aayegi, yahan lag jayega.</p>
      </Card>
    </>
  )
}