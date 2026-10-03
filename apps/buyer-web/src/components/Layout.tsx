import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { LoadingState } from './States'

// Only the routed page content waits on a lazy route's chunk (see App.tsx) —
// Header/Footer are outside this boundary, so they never disappear behind a
// fallback no matter which page is loading.
export function Layout() {
  return (
    <>
      <Header />
      <main className="main">
        <Suspense fallback={<div className="container page"><LoadingState label="Loading…" /></div>}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

/** Same shell, no footer — for focused flows (payment-heavy detail pages, etc.) where a long footer just adds scroll. */
export function BareLayout() {
  return (
    <>
      <Header />
      <main className="main">
        <Suspense fallback={<div className="container page"><LoadingState label="Loading…" /></div>}>
          <Outlet />
        </Suspense>
      </main>
    </>
  )
}
