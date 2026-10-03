import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AccountShell } from './components/AccountShell'
import { ProtectedRoute, GuestOnlyRoute } from './components/ProtectedRoute'

// Home, Advertise and Login are kept as normal eager imports — these are
// the pages most likely to be the very first thing opened (including the
// two production URLs this was explicitly measured against), plus the
// login page itself, which shouldn't need an extra chunk round trip either.
// Everything else below is lazy: its code only downloads when a user
// actually navigates there, instead of shipping in the bundle every visitor
// to "/" has to wait on. <Suspense> boundaries live in Layout.tsx and
// AccountShell.tsx around their own <Outlet/>, so the header/footer/account
// sidebar stay mounted and interactive while a lazy page's chunk loads —
// only that page's own content area shows a brief placeholder.
import Home from './pages/Home'
import Advertise from './pages/advertise/Advertise'
import Login from './pages/auth/Login'

const ExpertProperties = lazy(() => import('./pages/ExpertProperties'))
const BrowseProperty = lazy(() => import('./pages/BrowseProperty'))
const Search = lazy(() => import('./pages/Search'))
const PropertyDetail = lazy(() => import('./pages/PropertyDetail'))
const OwnerProperties = lazy(() => import('./pages/OwnerProperties'))
const OwnerPropertyDetail = lazy(() => import('./pages/OwnerPropertyDetail'))
const ReporterFeed = lazy(() => import('./pages/ReporterFeed'))
const Coverage = lazy(() => import('./pages/Coverage'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
const NotFound = lazy(() => import('./pages/NotFound'))
const AdvertiserAuth = lazy(() => import('./pages/advertise/AdvertiserAuth'))
const AdvertiserDashboard = lazy(() => import('./pages/advertise/AdvertiserDashboard'))
const CreateCampaign = lazy(() => import('./pages/advertise/CreateCampaign'))

const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const Register = lazy(() => import('./pages/auth/Register'))
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'))
const CompleteProfile = lazy(() => import('./pages/auth/CompleteProfile'))

const SupportHome = lazy(() => import('./pages/support/SupportHome'))
const NewSupportTicket = lazy(() => import('./pages/support/NewSupportTicket'))
const SupportTickets = lazy(() => import('./pages/support/SupportTickets'))
const SupportTicketDetail = lazy(() => import('./pages/support/SupportTicketDetail'))

const Notifications = lazy(() => import('./pages/Notifications'))

const AccountOverview = lazy(() => import('./pages/account/AccountOverview'))
const MyReports = lazy(() => import('./pages/account/MyReports'))
const SavedProperties = lazy(() => import('./pages/account/SavedProperties'))
const VerificationRequests = lazy(() => import('./pages/account/VerificationRequests'))
const VerificationRequestDetail = lazy(() => import('./pages/account/VerificationRequestDetail'))
const MyRequests = lazy(() => import('./pages/account/MyRequests'))
const NewSpecialRequest = lazy(() => import('./pages/account/NewSpecialRequest'))
const SpecialRequestDetail = lazy(() => import('./pages/account/SpecialRequestDetail'))
// Property Discovery flow (Step 4E) — new VerificationRequest(source=
// DISCOVERY) creation, distinct from the legacy SpecialRequest flow above.
const NewDiscoveryRequest = lazy(() => import('./pages/account/NewDiscoveryRequest'))
const Alerts = lazy(() => import('./pages/account/Alerts'))

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="expert-properties" element={<ExpertProperties />} />
        <Route path="browse" element={<BrowseProperty />} />
        {/* Legacy route — no longer in primary nav (see Header.tsx's NAV_LINKS),
            kept mounted so nothing that already links here breaks. */}
        <Route path="search" element={<Search />} />
        <Route path="reports/:id" element={<PropertyDetail />} />
        <Route path="owner-properties" element={<OwnerProperties />} />
        <Route path="owner-properties/:id" element={<OwnerPropertyDetail />} />
        <Route path="reporter-feed" element={<ReporterFeed />} />
        <Route path="coverage" element={<Coverage />} />
        <Route path="terms" element={<Terms />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="support" element={<SupportHome />} />

        <Route element={<GuestOnlyRoute />}>
          <Route path="login" element={<Login />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="register" element={<Register />} />
          {/* Signup Email Verification — Register.tsx redirects here right
              after signup; loginBuyer's EMAIL_NOT_VERIFIED response redirects
              here too, for someone who abandoned verification and came back. */}
          <Route path="verify-email" element={<VerifyEmail />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="complete-profile" element={<CompleteProfile />} />
          <Route path="support/new" element={<NewSupportTicket />} />
          <Route path="notifications" element={<Notifications />} />

          <Route path="account" element={<AccountShell />}>
            <Route index element={<AccountOverview />} />
            <Route path="reports" element={<MyReports />} />
            <Route path="saved" element={<SavedProperties />} />
            <Route path="verifications" element={<VerificationRequests />} />
            <Route path="verifications/:id" element={<VerificationRequestDetail />} />
            <Route path="requests" element={<MyRequests />} />
            <Route path="requests/new" element={<NewSpecialRequest />} />
            <Route path="requests/:id" element={<SpecialRequestDetail />} />
            <Route path="discovery-request/new" element={<NewDiscoveryRequest />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="support" element={<SupportTickets />} />
            <Route path="support/:id" element={<SupportTicketDetail />} />
          </Route>
        </Route>

        {/* Advertising platform — separate public area for third-party advertisers */}
        <Route path="advertise" element={<Advertise />} />
        <Route path="advertiser/login" element={<AdvertiserAuth />} />
        <Route path="advertiser/dashboard" element={<AdvertiserDashboard />} />
        <Route path="advertiser/campaigns/new" element={<CreateCampaign />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
