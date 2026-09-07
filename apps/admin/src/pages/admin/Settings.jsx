// ─────────────────────────────────────────────────────────────────────────
//  Settings — READ-ONLY platform configuration reference.
//
//  This page used to be an editable form with a Save button that ran a
//  setTimeout and then showed "✅ Settings saved successfully!" — nothing was
//  ever persisted. There is no settings model in the backend: every value
//  below is a constant in the API source, so an admin editing them here was
//  being actively misled about the platform's live behaviour.
//
//  Until a settings model exists, this page shows the real values and says
//  where each one lives. Each row is annotated with its source file so the
//  page cannot silently drift out of sync without someone noticing.
// ─────────────────────────────────────────────────────────────────────────
import { Card, PageHead } from '../../components/ui'

const Section = ({ title, icon, note, children }) => (
  <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontFamily: 'var(--disp)', fontSize: 14, fontWeight: 700 }}>{title}</span>
      {note && <code className="small muted" style={{ marginLeft: 'auto', fontFamily: 'monospace' }}>{note}</code>}
    </div>
    <div style={{ padding: '8px 0' }}>{children}</div>
  </Card>
)

const Row = ({ label, desc, value, accent = 'var(--text)' }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', gap: 20, flexWrap: 'wrap' }}>
    <div style={{ flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
      {desc && <div className="small muted" style={{ marginTop: 3 }}>{desc}</div>}
    </div>
    <div style={{ fontSize: 14, fontWeight: 700, color: accent, whiteSpace: 'nowrap' }}>{value}</div>
  </div>
)

export default function Settings() {
  return (
    <div>
      <PageHead title="Settings" subtitle="Live platform configuration — read-only" />

      <div className="badge blue" style={{ display: 'block', padding: '14px 18px', borderRadius: 10, marginBottom: 20, fontSize: 13, lineHeight: 1.65, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
        ℹ️ These values are <strong>compiled into the API</strong>, not stored in a database — there is no settings model, so nothing on
        this page is editable from the panel. Changing any of them is a code change plus a deploy. The source file for each group is
        shown on the right of its header.
      </div>

      <Section title="Commission split — report unlocks" icon="💰" note="services/payment.service.ts">
        <div className="small muted" style={{ padding: '4px 20px 12px', lineHeight: 1.6 }}>
          Seller&apos;s share of each report unlock. Better badges keep more — the platform&apos;s cut is the remainder.
        </div>
        <Row label="Bronze seller" desc="Default rate for new sellers" value="60%" accent="#cd7f32" />
        <Row label="Silver seller" desc="Same rate as Bronze" value="60%" accent="#c0c0c0" />
        <Row label="Gold seller" desc="High performer" value="65%" accent="var(--gold)" />
        <Row label="Platinum seller" desc="Top performer" value="70%" accent="var(--blue)" />
      </Section>

      <Section title="Commission split — other payments" icon="🧾" note="services/payment.service.ts">
        <Row label="Special request advance" desc="Seller keeps 70%, platform takes a flat 30% regardless of badge" value="70% / 30%" accent="var(--violet)" />
        <Row label="Alert subscription" desc="Platform-only revenue — no seller side to split" value="100% platform" accent="var(--muted)" />
        <Row label="Featured listing" desc="Platform-only revenue — no seller side to split" value="100% platform" accent="var(--muted)" />
      </Section>

      <Section title="Subscription pricing" icon="🔔" note="services/subscription.service.ts">
        <Row label="Case update alerts" desc="Buyer-side monthly plan" value="₹49 / month" accent="var(--blue)" />
        <Row label="Featured listing" desc="Seller-side monthly plan" value="₹499 / month" accent="var(--blue)" />
      </Section>

      <Section title="Payouts" icon="🏦" note="services/settlement.service.ts">
        <Row label="Minimum settlement amount" desc="Below this the balance carries forward to the next weekly run" value="₹500" accent="var(--green)" />
        <Row label="Settlement schedule" desc="Weekly cron — aggregates purchases and special-request payouts" value="Weekly" accent="var(--green)" />
      </Section>

      <Section title="Listing rules" icon="🏠" note="packages/shared/src/validation.ts">
        <Row label="Minimum listing price" desc="Enforced by the shared Zod schema" value="₹99" accent="var(--amber)" />
        <Row label="Maximum listing price" desc="Enforced by the shared Zod schema" value="₹4,999" accent="var(--amber)" />
        <Row label="Spot-check auto-flag rate" desc="Share of new listings randomly flagged for QC review (controllers/listing.controller.ts)" value="10%" accent="var(--amber)" />
      </Section>

      <Section title="Quality control" icon="🛡️" note="Day 7 — QC penalties">
        <Row label="Accuracy strikes before ban" desc="Three confirmed accuracy violations permanently ban the seller" value="3 strikes" accent="var(--red)" />
      </Section>

      <Section title="Configurable at deploy time" icon="⚙️" note="apps/api/.env">
        <div className="small muted" style={{ padding: '4px 20px 12px', lineHeight: 1.6 }}>
          These are real environment variables — changing them needs an API restart, not a code change. See{' '}
          <code style={{ fontFamily: 'monospace' }} className="muted">apps/api/.env.sample</code>.
        </div>
        <Row label="ADMIN_SESSION_TIMEOUT_MINUTES" desc="Idle timeout before an admin session expires" value="env" accent="var(--muted)" />
        <Row label="ADMIN_2FA_ENFORCE_GRACE_PERIOD" desc="Whether unenrolled admins are locked out after the grace period" value="env" accent="var(--muted)" />
        <Row label="ADMIN_2FA_GRACE_PERIOD_DAYS" desc="Days a new admin has to enrol in 2FA" value="env" accent="var(--muted)" />
        <Row label="RAZORPAY_PLAN_ALERT / _FEATURED" desc="Live Razorpay plan ids — required in production" value="env" accent="var(--muted)" />
      </Section>
    </div>
  )
}
