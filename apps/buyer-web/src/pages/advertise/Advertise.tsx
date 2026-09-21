import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAdvertiserToken, getConfig, type AdvertiserConfig } from '../../api/advertiser.api'
import { Button } from '../../components/Button'
import { formatRupees } from '../../lib/format'

// Public entry point for third-party advertisers: /advertise. Independent of the buyer, partner,
// expert and admin areas. Any legitimate business can advertise — not just property businesses.
export default function Advertise() {
  const navigate = useNavigate()
  const [cfg, setCfg] = useState<AdvertiserConfig | null>(null)

  useEffect(() => {
    void getConfig().then(setCfg).catch(() => {})
  }, [])

  const start = () => navigate(getAdvertiserToken() ? '/advertiser/campaigns/new' : '/advertiser/login')

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <h1 className="h1" style={{ marginBottom: 12 }}>
          Advertise on CivilCheck
        </h1>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 24 }}>
          Reach CivilCheck users with your advertisement. Promote any legitimate product, service, brand, app, website or
          event — your ad appears naturally inside the CivilCheck feed on the web and in the app.
        </p>
        <Button size="lg" onClick={start}>
          Start Advertising
        </Button>
        <p style={{ marginTop: 14, fontSize: 13 }}>
          <Link to={getAdvertiserToken() ? '/advertiser/dashboard' : '/advertiser/login'} style={{ color: 'var(--cc-gold)' }}>
            Already advertising? Open your dashboard
          </Link>
        </p>
      </div>

      <div className="stack" style={{ marginTop: 20 }}>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Simple, transparent pricing</div>
          <ul style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.8 }}>
            <li>
              {cfg ? `${formatRupees(cfg.cpm)} per 1,000 impressions` : 'Pay per 1,000 impressions'} — you are billed only for ads that were actually seen.
            </li>
            <li>Minimum budget {cfg ? formatRupees(cfg.minBudget) : '₹100'}. There is no maximum.</li>
            <li>You pay your budget once. No extra charges, no separate click fees.</li>
            <li>Every campaign is reviewed before it goes live.</li>
          </ul>
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>How it works</div>
          <ol style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.8 }}>
            <li>Create your advertisement — image or video, title, description and link.</li>
            <li>Set your budget and see the estimated impressions.</li>
            <li>Pay securely, then our team reviews your ad.</li>
            <li>Once approved it goes live and you track impressions, clicks and spend on your dashboard.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
