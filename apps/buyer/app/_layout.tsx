import { useEffect } from 'react'
import { View, Text } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import { colors } from '../src/theme'
import { IS_MISCONFIGURED_BUILD } from '../src/config/env'
import {
  addNotificationTapListener,
  readCachedPushPreference,
  registerForPushAsync,
} from '../src/lib/pushNotifications'

// Hold the native splash until the stored session has been resolved. Without
// this the navigator mounts first, the authenticated tabs render, and their
// requests 401 before the redirect to /login has a chance to run.
void SplashScreen.preventAutoHideAsync()

/**
 * Auth-flow screens — a dead end for an authenticated buyer, so becoming
 * authenticated while on one of these always bounces to Home (matches the
 * original, pre-guest-browsing behaviour exactly).
 *
 * Buyer Mobile Final Parity Batch (Task 1) — 'forgot-password' was missing
 * from the old PUBLIC_ROUTES set entirely, which meant a logged-out buyer
 * tapping "Forgot password" on Login was immediately bounced back to /login
 * by this very gate before ForgotPasswordScreen ever rendered. Real,
 * pre-existing bug, fixed here.
 */
const AUTH_FLOW_ROUTES = new Set(['login', 'register', 'phone-login', 'verify-email', 'forgot-password'])

/**
 * Content Buyer Web serves with no login required (Home, BrowseProperty,
 * PropertyDetail, OwnerProperties(+detail), ReporterFeed, Coverage — see
 * apps/buyer-web's App.tsx: all of these sit outside <ProtectedRoute/>).
 * Unlike AUTH_FLOW_ROUTES, becoming authenticated while already on one of
 * these must NOT force a navigation away — a guest reading a report who
 * signs in via an AuthRequiredSheet should stay on that exact report, not
 * get bounced to Home (see AuthRequiredSheet.tsx / VerifyPropertyCTA.tsx /
 * PropertyCard.tsx's FeedItemCard for where the sheet is triggered).
 *
 * Protected write actions on these same public pages (like/save/comment,
 * request verification, unlock/pay, watch) are gated inline at the
 * component level instead of by route — exactly like Buyer Web's own
 * AuthRequiredModal pattern (FeedCard.tsx, VerifyPropertyCTA.tsx).
 */
const PUBLIC_CONTENT_ROUTES = new Set(['coverage', 'owner-properties', 'reporter-feed', 'report'])

/**
 * The bottom-tab group. Home and Search are public; Alerts and Profile map
 * to Buyer Web's fully-protected account/alerts and account (Overview)
 * pages — since all four live behind one persistent tab bar on mobile
 * (unlike Web's separate route trees), those two screens gate themselves
 * inline (an in-tab "sign in required" state) rather than the tab bar
 * hiding/redirecting, which would be jarring on a persistent tab.
 */
const TABS_SEGMENT = '(tabs)'

/** /support (ticket-free FAQ/contact) is public; /support/new and
 * /support/[id] (an actual ticket) are not — mirrors Buyer Web exactly
 * (`support` outside ProtectedRoute, `account/support*` inside it). */
const SUPPORT_SEGMENT = 'support'

/**
 * Onboarding gate route. A buyer who signs in via phone-OTP only ever has
 * `phone` on record until they fill this in (email/password signup collects
 * name but not city/state either — schema.prisma's own comment: "mandatory
 * at the first-login profile step, enforced by the buyer app"). Routed here
 * from `AuthContext.user.profileComplete`, which the backend already
 * computes and returns from every login/me call — no separate local flag to
 * track, so this survives an app close/reopen for free: the stored JWT
 * rehydrates on cold start (AuthContext), and profileComplete is
 * re-evaluated from that same fresh /me response.
 */
const PROFILE_ROUTE = 'complete-profile'

function RootNavigator() {
  const { status, user } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return

    void SplashScreen.hideAsync()

    const segment = segments[0] ?? ''
    const subSegment = segments[1]
    const onAuthRoute = AUTH_FLOW_ROUTES.has(segment)
    const onPublicContentRoute =
      segment === TABS_SEGMENT ||
      PUBLIC_CONTENT_ROUTES.has(segment) ||
      (segment === SUPPORT_SEGMENT && subSegment === undefined)
    const onProfileRoute = segment === PROFILE_ROUTE

    if (status === 'unauthenticated') {
      if (!onAuthRoute && !onPublicContentRoute) router.replace('/login')
      return
    }

    // status === 'authenticated' from here on.
    const needsProfile = user?.profileComplete === false

    if (needsProfile && !onProfileRoute) {
      router.replace('/complete-profile')
      return
    }

    // A public content route never force-navigates on its own — signing in
    // from an AuthRequiredSheet while reading a report must leave the buyer
    // on that exact report (see PUBLIC_CONTENT_ROUTES above).
    if (!needsProfile && (onAuthRoute || onProfileRoute)) {
      router.replace('/')
    }
  }, [status, user, segments, router])

  // Re-register on every authenticated app start (tokens can rotate), but
  // only when the buyer has push turned on — a denied/undecided OS
  // permission is a normal outcome here, not something to prompt for on
  // every cold start; that only happens from the settings toggle itself.
  useEffect(() => {
    if (status !== 'authenticated') return
    void (async () => {
      if (await readCachedPushPreference()) {
        await registerForPushAsync()
      }
    })()
  }, [status])

  // Notification deep-linking (Final Parity Batch, Task 5) — every buyer
  // push notification's FCM data payload was audited directly at its send
  // site (apps/api's notification.service.ts callers: alert.controller.ts,
  // verification.controller.ts, refund.service.ts, admin.controller.ts,
  // support.service.ts). The payload only ever carries one of three keys —
  // `listingId` (the older case-update alert), `verificationRequestId` (the
  // overwhelming majority: quotes, payments, cancellations, claims,
  // messages, status changes — there is no separate "quote" or
  // "conversation" screen, both live inside the verification request detail
  // screen), or `supportTicketId`. Routing on exactly those three, with the
  // old unconditional /alerts as the fallback for anything else (or no data
  // at all), covers every push this backend actually sends — nothing here
  // is an invented field.
  useEffect(() => {
    return addNotificationTapListener((data) => {
      const listingId = typeof data.listingId === 'string' ? data.listingId : null
      const verificationRequestId =
        typeof data.verificationRequestId === 'string' ? data.verificationRequestId : null
      const supportTicketId = typeof data.supportTicketId === 'string' ? data.supportTicketId : null

      if (listingId) router.push(`/report/${listingId}`)
      else if (verificationRequestId) router.push(`/verifications/${verificationRequestId}`)
      else if (supportTicketId) router.push(`/support/${supportTicketId}`)
      else router.push('/alerts')
    })
  }, [router])

  // Render nothing while the splash is still up — mounting the stack here would
  // start the very requests this gate exists to prevent.
  if (status === 'loading') return null

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Screen name="register" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="phone-login" />
      <Stack.Screen name="complete-profile" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="report/[id]" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="owner-properties/index" />
      <Stack.Screen name="owner-properties/[id]" />
      <Stack.Screen name="reporter-feed/index" />
      <Stack.Screen name="requests/index" />
      <Stack.Screen name="requests/new" />
      <Stack.Screen name="requests/[id]" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="coverage" />
    </Stack>
  )
}

// A shipped build with no server address configured (QA audit 2026-08-03,
// finding #7) used to fail silently — every screen would just error out
// against an unreachable localhost with no indication why. This stops it
// before AuthProvider (and the network calls it fires) ever mounts.
function MisconfiguredBuildScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 10,
      }}
    >
      <StatusBar style="light" backgroundColor={colors.bg} />
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
        This app isn&apos;t set up correctly
      </Text>
      <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
        Please reinstall the latest version from the app store, or contact CivilCheck support if this
        keeps happening.
      </Text>
    </View>
  )
}

export default function RootLayout() {
  if (IS_MISCONFIGURED_BUILD) {
    return <MisconfiguredBuildScreen />
  }

  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor={colors.bg} />
      <RootNavigator />
    </AuthProvider>
  )
}
