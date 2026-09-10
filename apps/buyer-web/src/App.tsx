import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AccountShell } from './components/AccountShell'
import { ProtectedRoute, GuestOnlyRoute } from './components/ProtectedRoute'

import Home from './pages/Home'
import ExpertProperties from './pages/ExpertProperties'
import BrowseProperty from './pages/BrowseProperty'
import Search from './pages/Search'
import PropertyDetail from './pages/PropertyDetail'
import OwnerProperties from './pages/OwnerProperties'
import OwnerPropertyDetail from './pages/OwnerPropertyDetail'
import ReporterFeed from './pages/ReporterFeed'
import Coverage from './pages/Coverage'
import NotFound from './pages/NotFound'

import Login from './pages/auth/Login'
import ForgotPassword from './pages/auth/ForgotPassword'
import Register from './pages/auth/Register'
import VerifyEmail from './pages/auth/VerifyEmail'
import CompleteProfile from './pages/auth/CompleteProfile'

import SupportHome from './pages/support/SupportHome'
import NewSupportTicket from './pages/support/NewSupportTicket'
import SupportTickets from './pages/support/SupportTickets'
import SupportTicketDetail from './pages/support/SupportTicketDetail'

import Notifications from './pages/Notifications'

import AccountOverview from './pages/account/AccountOverview'
import MyReports from './pages/account/MyReports'
import SavedProperties from './pages/account/SavedProperties'
import VerificationRequests from './pages/account/VerificationRequests'
import VerificationRequestDetail from './pages/account/VerificationRequestDetail'
import MyRequests from './pages/account/MyRequests'
import NewSpecialRequest from './pages/account/NewSpecialRequest'
import SpecialRequestDetail from './pages/account/SpecialRequestDetail'
// Property Discovery flow (Step 4E) — new VerificationRequest(source=
// DISCOVERY) creation, distinct from the legacy SpecialRequest flow above.
import NewDiscoveryRequest from './pages/account/NewDiscoveryRequest'
import Alerts from './pages/account/Alerts'

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

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
