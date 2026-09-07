import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="brand" style={{ marginBottom: 10 }}>
              <span className="brand__mark" aria-hidden="true">
                C
              </span>
              CivilCheck
            </div>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 280 }}>
              Verify a property's legal history before you buy — court cases, loan defaults, and
              professional risk assessments in one report.
            </p>
          </div>

          <div className="footer-col">
            <div className="footer-col__title">Marketplace</div>
            <Link to="/search">Browse reports</Link>
            <Link to="/owner-properties">Owner listings</Link>
            <Link to="/reporter-feed">Property Updates</Link>
            <Link to="/coverage">Areas we cover</Link>
          </div>

          <div className="footer-col">
            <div className="footer-col__title">Account</div>
            <Link to="/login">Log in</Link>
            <Link to="/register">Create account</Link>
            <Link to="/account/verifications">Verification requests</Link>
          </div>

          <div className="footer-col">
            <div className="footer-col__title">Support</div>
            <Link to="/support">Help center</Link>
            <Link to="/support/new">Contact support</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} CivilCheck. All rights reserved.</span>
          <span>Property verification reports are informational and not legal advice.</span>
        </div>
      </div>
    </footer>
  )
}
