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

/** Routes reachable without a session. */
const PUBLIC_ROUTES = new Set(['login', 'register', 'phone-login'])

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
    const onPublicRoute = PUBLIC_ROUTES.has(segment)
    const onProfileRoute = segment === PROFILE_ROUTE

    if (status === 'unauthenticated') {
      if (!onPublicRoute) router.replace('/login')
      return
    }

    // status === 'authenticated' from here on.
    const needsProfile = user?.profileComplete === false

    if (needsProfile && !onProfileRoute) {
      router.replace('/complete-profile')
      return
    }

    if (!needsProfile && (onPublicRoute || onProfileRoute)) {
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

  // Tapping a push notification (backgrounded or cold-launched from a tap)
  // lands the buyer on their alerts list — every push is a case-update alert
  // for a watched property (see NotificationSettingsScreen).
  useEffect(() => {
    return addNotificationTapListener(() => {
      router.push('/alerts')
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
