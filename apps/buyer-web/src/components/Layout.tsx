import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'

export function Layout() {
  return (
    <>
      <Header />
      <main className="main">
        <Outlet />
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
        <Outlet />
      </main>
    </>
  )
}
