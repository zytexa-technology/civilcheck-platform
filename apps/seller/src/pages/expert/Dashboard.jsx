// ─────────────────────────────────────────────────────────────────────────
//  expert/Dashboard.jsx  —  Property Expert dashboard  (REAL APIs)
//  File #16 of the redesign.  RAKHNA: src/pages/expert/Dashboard.jsx
//
//  Ye file Expert ka shared store + reusable table bhi export karta hai:
//    useExpertStore()          → { requests, earnings, loaded }
//    expertActions.load/accept/reject/submit
//    ExpertRequestsTable       → reusable (Requests page bhi use karega)
//
//  REAL:  getAvailableRequests, acceptRequest, declineRequest, getEarningsOverview
//  (koi demo fallback nahi — khaali backend = khaali state). submit() abhi local hai —
//  real submitRequest(id, listingId) ke liye report-listing flow chahiye (baad me).
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getMySpecialRequests, acceptRequest, declineRequest, submitRequest, getEarningsOverview,
  getMyListings,
} from '../../api/seller.api'
import { Icon, Seal } from '../../components/Icon'
import { Card, StatCard, Chip, PageHead, SectionTitle, Field, Modal, toast } from '../../components/ui'

// backend SpecialRequestStatus → UI status. COMPLETED means the seller has
// submitted their research and it's awaiting admin review — it is NOT the
// same as admin-approved, so these must render as distinct labels/chips.
const STATUS_MAP = {
  ASSIGNED: 'pending',
  IN_PROGRESS: 'active',
  COMPLETED: 'completed',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REFUNDED: 'refunded',
}

// backend request → row shape
const mapReq = (r) => ({
  id: r.id,
  title: r.address || 'Special Request',
  type: r.propertyType || 'Verification',
  buyer: r.buyerName || 'Buyer',
  fee: r.advanceAmount || 0,
  status: STATUS_MAP[r.status] || 'pending',
  adminNote: r.adminNote || null,
})

// ═══ SHARED STORE ═══════════════════════════════════════════════════════════
let state = { requests: [], earnings: 0, loaded: false }   // real data load() se aayega
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())
const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb) }
const getSnapshot = () => state

export function useExpertStore() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export const expertActions = {
  async load() {
    if (state.loaded) return
    try {
      const [rq, ov] = await Promise.allSettled([getMySpecialRequests(), getEarningsOverview()])
      let requests = []
      if (rq.status === 'fulfilled' && Array.isArray(rq.value?.requests)) {
        requests = rq.value.requests.map(mapReq)   // khaali bhi ho sakta hai — real
      }
      let earnings = 0
      if (ov.status === 'fulfilled' && ov.value?.earnings) {
        earnings = ov.value.earnings.lifetime || 0
      }
      state = { requests, earnings, loaded: true }
    } catch {
      state = { requests: [], earnings: 0, loaded: true }
    }
    emit()
  },
  async accept(id) {
    try {
      await acceptRequest(id)
      state = { ...state, requests: state.requests.map((r) => (r.id === id ? { ...r, status: 'active' } : r)) }
      emit(); toast('Accepted — research shuru karein')
    } catch (e) {
      toast(e?.response?.data?.message || 'Accept nahi hua')
    }
  },
  async reject(id) {
    try {
      await declineRequest(id, 'Not available')
      state = { ...state, requests: state.requests.filter((r) => r.id !== id) }
      emit(); toast('Request rejected')
    } catch (e) {
      toast(e?.response?.data?.message || 'Reject nahi hua')
    }
  },
  // Real submit. The backend (specialRequest.controller.ts) requires a
  // listingId belonging to this seller and sets completedListingId on the
  // request — the research deliverable IS a Listing. Callers must therefore
  // give the expert a way to pick one; see UploadReportModal.
  async submit(id, listingId) {
    try {
      await submitRequest(id, listingId)
      state = {
        ...state,
        requests: state.requests.map((r) => (r.id === id ? { ...r, status: 'completed' } : r)),
      }
      emit(); toast('Report submitted for Admin Review')
      return true
    } catch (e) {
      toast(e?.response?.data?.message || 'Submit nahi hua')
      return false
    }
  },
}

// ═══ REUSABLE REQUESTS TABLE ════════════════════════════════════════════════
export function ExpertRequestsTable({ limit, go }) {
  const { requests } = useExpertStore()
  const [uploadTarget, setUploadTarget] = useState(null)
  const list = limit ? requests.slice(0, limit) : requests

  return (
    <Card style={{ overflowX: 'auto' }}>
      <table className="tbl">
        <thead>
          <tr>{['Request', 'Type', 'Buyer', 'Fee', 'Status', ''].map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }} className="dev">Koi request nahi.</td></tr>
          ) : list.map((r) => <ReqRow key={r.id} r={r} onUpload={() => setUploadTarget(r)} />)}
        </tbody>
      </table>
      <UploadReportModal req={uploadTarget} onClose={() => setUploadTarget(null)} go={go} />
    </Card>
  )
}

// Status → [chip tone, honest label]. COMPLETED is deliberately NOT green —
// it means "submitted, waiting on the admin," not "approved."
export const STATUS_CHIP = {
  pending:   ['amber', 'New'],
  active:    ['green', 'Active'],
  completed: ['ink',   'Submitted — Review Pending'],
  approved:  ['green', 'Admin Approved'],
  rejected:  ['red',   'Rejected'],
  refunded:  ['red',   'Refunded'],
}

function ReqRow({ r, onUpload }) {
  const st = STATUS_CHIP[r.status] || STATUS_CHIP.pending
  return (
    <tr>
      <td><b className="dev">{r.title}</b></td>
      <td>{r.type}</td>
      <td>{r.buyer}</td>
      <td>₹{Number(r.fee).toLocaleString('en-IN')}</td>
      <td><Chip tone={st[0]}>{st[1]}</Chip></td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {r.status === 'pending' && (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => expertActions.accept(r.id)}>Accept</button>{' '}
            <button className="btn btn-danger btn-sm" onClick={() => expertActions.reject(r.id)}>Reject</button>
          </>
        )}
        {r.status === 'active' && <button className="btn btn-seal btn-sm" onClick={onUpload}>Submit Report</button>}
        {!['pending', 'active'].includes(r.status) && <Chip tone={st[0]}>{st[1]}</Chip>}
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────
//  Submit-report modal.
//
//  The old version collected a title, a findings blurb and a fake "evidence"
//  drop zone, persisted none of it, and flipped the row to Completed locally.
//
//  What the backend actually wants is a listingId: the expert publishes their
//  research as a Listing, and submitting links it to the request via
//  completedListingId. So this picks one of the expert's own listings — with a
//  direct route to create one when they have none yet.
// ─────────────────────────────────────────────────────────────────────────
function UploadReportModal({ req, onClose, go }) {
  const [listings, setListings] = useState([])
  const [listingId, setListingId] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!req) return
    let live = true
    setListingId('')
    setLoading(true)
    getMyListings()
      .then((d) => { if (live) setListings(d.listings || []) })
      .catch(() => { if (live) setListings([]) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [req])

  const submit = async () => {
    if (!listingId) return
    setSubmitting(true)
    const ok = await expertActions.submit(req.id, listingId)
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open={!!req} title="Submit Report" onClose={onClose}
      footer={<>
        <button className="btn btn-light" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={!listingId || submitting}
          style={{ opacity: (!listingId || submitting) ? 0.5 : 1 }}
        >
          {submitting ? 'Submitting...' : 'Submit for Admin Review'}
        </button>
      </>}
    >
      <p className="small muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
        Apni research ek listing ke roop mein publish karein, phir use yahan
        select karke submit karein. Admin usi listing ko review karega.
      </p>

      {loading ? (
        <div className="small muted" style={{ padding: '18px 0', textAlign: 'center' }}>Loading your listings...</div>
      ) : listings.length === 0 ? (
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <Icon name="file" size={24} style={{ color: 'var(--muted)', strokeWidth: 1.8 }} />
          <div className="small muted" style={{ margin: '8px 0 14px' }}>
            Aapki koi listing nahi hai. Pehle is property ki listing banayein.
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { onClose(); go?.('plus') }}
          >
            Create Listing
          </button>
        </div>
      ) : (
        <Field label="Select the listing that holds this research">
          <select className="control" value={listingId} onChange={(e) => setListingId(e.target.value)}>
            <option value="">— Choose a listing —</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.address} · {l.city} · ₹{l.price} · {l.status}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Modal>
  )
}

// ═══ PROFESSION LABEL ═══════════════════════════════════════════════════════
const PROF_LABEL = { LAWYER: 'Advocate', CIVIL_ENGINEER: 'Civil Engineer', TEHSIL_EXPERT: 'Revenue Expert', PROPERTY_CONSULTANT: 'Property Consultant' }

// ═══ KYC STATUS DISPLAY ═════════════════════════════════════════════════════
// Never hardcode "Verified" — this always reflects the real seller.kycStatus
// (QA audit finding, 2026-09-03: the dashboard used to show a hardcoded
// "Verified" chip/subtitle regardless of actual approval state).
const KYC_STATUS_DISPLAY = {
  APPROVED:  { chip: 'green', label: '✓ Verified',                     subtitle: 'Verified professional partner — paid reports aur legal verification.' },
  PENDING:   { chip: 'amber', label: '⏳ Awaiting Super Admin Approval', subtitle: 'Your professional credentials are under review by our team.' },
  REJECTED:  { chip: 'red',   label: '✗ KYC Rejected',                  subtitle: 'Your last application was not approved — see below to resubmit.' },
  SUSPENDED: { chip: 'red',   label: '⛔ Account Suspended',             subtitle: 'Your account has been suspended. Contact support for help.' },
}

// ═══ DASHBOARD ══════════════════════════════════════════════════════════════
export default function ExpertDashboard({ go }) {
  const { seller } = useAuth()
  const { requests, earnings } = useExpertStore()

  useEffect(() => { expertActions.load() }, [])

  const firstName = seller?.name?.split(' ')[0] || 'Expert'
  const initial = (seller?.name?.[0] || 'E').toUpperCase()
  const prof = PROF_LABEL[seller?.profession] || 'Advocate'
  const city = seller?.city || 'your area'
  const avgRating = seller?.avgRating ?? null
  const reviewCount = seller?.reviewCount ?? 0
  const kycStatus = seller?.kycStatus || 'PENDING'
  const kycDisplay = KYC_STATUS_DISPLAY[kycStatus] || KYC_STATUS_DISPLAY.PENDING

  const pe = requests.filter((r) => r.status === 'pending').length
  const ac = requests.filter((r) => r.status === 'active').length
  const co = requests.filter((r) => ['completed', 'approved', 'rejected', 'refunded'].includes(r.status)).length

  return (
    <>
      <PageHead title={`Namaste, ${firstName}`} subtitle={kycDisplay.subtitle} />

      {/* Profile banner */}
      <Card style={{ padding: 20, marginBottom: 20, background: 'linear-gradient(120deg,#14273f,#1f3a58)', color: '#fff', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', border: 'none' }}>
        <div className="avatar lg">{initial}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 className="dev" style={{ fontSize: 19, color: '#fff' }}>{seller?.name || 'Expert'}</h3>
            <Chip tone={kycDisplay.chip}>{kycDisplay.label}</Chip>
          </div>
          <p className="small dev" style={{ color: 'rgba(255,255,255,.65)', marginTop: 2 }}>
            {prof} • {avgRating !== null ? `${avgRating.toFixed(1)} ★ (${reviewCount} review${reviewCount === 1 ? '' : 's'})` : 'No reviews yet'} • Service area: {city}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 800, color: '#d8b25f' }}>₹{Number(earnings).toLocaleString('en-IN')}</div>
          <div className="xs" style={{ color: 'rgba(255,255,255,.6)' }}>Total earnings</div>
        </div>
      </Card>

      {/* KYC rejected — reason + clear resubmission path (never silently hidden) */}
      {kycStatus === 'REJECTED' && (
        <Card style={{ padding: 16, marginBottom: 20, background: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="dev" style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>Your KYC application was rejected</div>
              <p className="small dev" style={{ color: 'var(--ink)' }}>
                {seller?.kycRejectionReason || 'No specific reason was provided.'}
              </p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => go?.('shield')}>
              Resubmit KYC Documents
            </button>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid g3" style={{ marginBottom: 20 }}>
        <StatCard icon="inbox" color="#B67A12" value={pe} label="Pending Requests" />
        <StatCard icon="file"  color="#2b5c8f" value={ac} label="Active" />
        <StatCard icon="star"  color="#137a56" value={co} label="Completed" />
      </div>

      {/* Workflow */}
      <SectionTitle>Special Request Workflow</SectionTitle>
      <Card style={{ marginBottom: 22 }}>
        <div className="flow">
          <span className="step done">Buyer Request</span><span className="arw">→</span>
          <span className="step done">Super Admin</span><span className="arw">→</span>
          <span className="step now">Assigned to You</span><span className="arw">→</span>
          <span className="step">Accept & Research</span><span className="arw">→</span>
          <span className="step">Upload Report</span><span className="arw">→</span>
          <span className="step">Admin Review</span>
        </div>
      </Card>

      {/* Assigned requests */}
      <SectionTitle right={<button className="btn btn-light btn-sm" onClick={() => go?.('inbox')}>View all</button>}>
        Assigned Requests
      </SectionTitle>
      <ExpertRequestsTable limit={3} go={go} />
    </>
  )
}