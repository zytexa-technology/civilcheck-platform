import { Link } from 'react-router-dom'
import { Button } from '../components/Button'

export default function NotFound() {
  return (
    <div className="container page center" style={{ flexDirection: 'column', minHeight: '50vh', gap: 16 }}>
      <span style={{ fontSize: 40 }} aria-hidden="true">
        🧭
      </span>
      <h1 className="h2">Page not found</h1>
      <p className="muted">The page you're looking for doesn't exist or may have moved.</p>
      <Link to="/">
        <Button>Back to home</Button>
      </Link>
    </div>
  )
}
