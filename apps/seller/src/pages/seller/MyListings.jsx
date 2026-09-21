// ─────────────────────────────────────────────────────────────────────────
//  MyListings.jsx  —  Property Listings (light theme, partner portal)
//  RAKHNA: src/pages/seller/MyListings.jsx   (poora replace)
//
//  Pehle ye page purane DARK dashboard ka tha — colors hardcoded (#111318 etc.)
//  the, isliye light portal me kaala box + gayab heading dikh rahi thi.
//  Ab poora design system use karta hai: Card / PageHead / Chip / .tbl / .btn
//  aur CSS variables (var(--ink), var(--line)...) — theme ke saath match.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import {
  getMyListings, deleteListing, getSingleListing, updateListing,
} from '../../api/seller.api'
import { Card, Chip, PageHead, Modal, Field, Pagination, toast } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'

// Seller's share of a report-unlock sale, by badge — mirrors
// REPORT_UNLOCK_PLATFORM_SHARE in apps/api/src/services/payment.service.ts
// (seller cut = 1 - platform cut). Kept as the single source of truth's
// numbers, not re-derived, since there is no per-listing earnings endpoint
// to read the real split from here.
const SELLER_CUT_BY_BADGE = { BRONZE: 0.6, SILVER: 0.6, GOLD: 0.65, PLATINUM: 0.7 }

// backend status → UI
const STATUS = {
  APPROVED:       { key: 'active',      tone: 'green', text: 'Active' },
  PENDING_REVIEW: { key: 'pending',     tone: 'amber', text: 'Pending' },
  REJECTED:       { key: 'rejected',    tone: 'red',   text: 'Rejected' },
  UNPUBLISHED:    { key: 'unpublished', tone: 'ink',   text: 'Unpublished' },
}
const statusOf = (s) => STATUS[s] || STATUS.PENDING_REVIEW

// The listing alert is the declared Property Status: Clear (green) or Disputed (red). Legacy
// listings that were never classified show "Not classified" — never yellow, no risk badge.
const PROPERTY_STATUS = {
  CLEAR:    { tone: 'green', text: 'Clear' },
  DISPUTED: { tone: 'red',   text: 'Disputed' },
}
const riskOf = (status) => PROPERTY_STATUS[status] || { tone: 'ink', text: 'Not classified' }

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

// `go` prop Layout se aata hai → "+ New Listing" sidebar ke New Listing page pe le jata hai
export default function MyListings({ go }) {
  const { seller } = useAuth()
  const sellerCut = SELLER_CUT_BY_BADGE[seller?.badge] ?? SELLER_CUT_BY_BADGE.BRONZE
  const [listings, setListings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState('all')
  const [viewTarget, setViewTarget] = useState(null)
  const [page, setPage] = useState(1)
  // Generic destructive-action confirmation — replaces native confirm().
  const [confirmState, setConfirmState] = useState(null) // { title, message, confirmLabel, onConfirm }

  useEffect(() => { load() }, [])
  useEffect(() => { setPage(1) }, [search, filter])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getMyListings()
      setListings(data.listings || [])
    } catch {
      setError('Listings load nahi huin')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = (id) => {
    setConfirmState({
      title: 'Delete Listing',
      message: 'Yeh listing delete karna chahte ho? Ye action wapas nahi ho sakta.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await deleteListing(id)
          toast('Listing delete ho gayi')
          load()
        } catch (err) {
          toast(err?.response?.data?.message || 'Delete nahi hua')
        }
      },
    })
  }

  const q = search.trim().toLowerCase()
  const filtered = listings.filter((l) => {
    const hit =
      !q ||
      [l.address, l.city, l.surveyNumber, l.khasraNumber]
        .some((v) => (v || '').toLowerCase().includes(q))
    const match = filter === 'all' || statusOf(l.status).key === filter
    return hit && match
  })

  // Client-side — GET /seller/listings has no page/limit support on the
  // backend, so pagination just windows the already-fetched array.
  const PAGE_SIZE = 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const counts = {
    all:      listings.length,
    active:   listings.filter((l) => l.status === 'APPROVED').length,
    pending:  listings.filter((l) => l.status === 'PENDING_REVIEW').length,
    rejected: listings.filter((l) => l.status === 'REJECTED').length,
  }

  const FILTERS = [
    { id: 'all',      label: 'All' },
    { id: 'active',   label: 'Active' },
    { id: 'pending',  label: 'Pending' },
    { id: 'rejected', label: 'Rejected' },
  ]

  return (
    <>
      <PageHead title="My Listings" subtitle="Aapki saari property listings yahan hain." />

      {/* ── Toolbar: search + filters + new ── */}
      <div style={S.toolbar}>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}><Icon name="eye" size={15} /></span>
          <input
            className="control"
            style={{ paddingLeft: 38 }}
            placeholder="Address, city ya survey number se search karein…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={S.chipsRow}>
          {FILTERS.map((f) => {
            const on = filter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`btn btn-sm ${on ? 'btn-seal' : 'btn-light'}`}
                style={{ borderRadius: 99 }}
              >
                {f.label}
                <span style={{ opacity: 0.75, marginLeft: 5 }}>{counts[f.id]}</span>
              </button>
            )
          })}
        </div>

        <button className="btn btn-primary" onClick={() => go?.('plus')}>
          <Icon name="plus" size={16} /> New Listing
        </button>
      </div>

      {/* ── Count ── */}
      {!loading && !error && (
        <p className="small muted dev" style={{ marginBottom: 12 }}>
          {listings.length} me se <b style={{ color: 'var(--ink)' }}>{filtered.length}</b> listing dikh rahi hain
        </p>
      )}

      {/* ── Error ── */}
      {error && (
        <Card style={S.errorBox}>
          <span>{error}</span>
          <button className="btn btn-light btn-sm" onClick={load}>Retry</button>
        </Card>
      )}

      {/* ── Table / states ── */}
      {loading ? (
        <Card style={S.center}>
          <p className="muted dev">Loading…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card style={S.center}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🏠</div>
          <h3 className="dev" style={{ color: 'var(--ink)', marginBottom: 6 }}>
            {listings.length === 0 ? 'Abhi koi listing nahi hai' : 'Koi listing nahi mili'}
          </h3>
          <p className="small muted dev">
            {listings.length === 0
              ? 'New Listing button se apni pehli listing banaiye.'
              : 'Search ya filter badal ke dekhiye.'}
          </p>
          {listings.length === 0 && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => go?.('plus')}>
              <Icon name="plus" size={15} /> New Listing
            </button>
          )}
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  {['Property', 'Type', 'Risk', 'Price', 'Sales', 'Earned', 'Status', 'Actions'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((l) => {
                  const r  = riskOf(l.propertyStatus)
                  const st = statusOf(l.status)
                  const earned = (l.totalSales || 0) * (l.price || 0) * sellerCut
                  const canDelete = l.status === 'PENDING_REVIEW' || l.status === 'REJECTED'
                  return (
                    <tr key={l.id}>
                      <td>
                        <div style={{ fontWeight: 650, color: 'var(--ink)' }}>{l.address}</div>
                        <div className="xs muted" style={{ marginTop: 3 }}>
                          {l.surveyNumber || l.khasraNumber || '—'} · {l.city}{l.tehsil ? `, ${l.tehsil}` : ''}
                        </div>
                        <div className="xs muted" style={{ marginTop: 1, opacity: 0.75 }}>
                          {fmtDate(l.createdAt)}
                        </div>
                      </td>
                      <td><Chip tone="ink">{l.propertyType}</Chip></td>
                      <td><Chip tone={r.tone}>{r.text}</Chip></td>
                      <td style={{ fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                        ₹{Number(l.price || 0).toLocaleString('en-IN')}
                      </td>
                      <td><Chip tone="blue">×{l.totalSales || 0}</Chip></td>
                      <td style={{ fontWeight: 700, color: 'var(--verified)', whiteSpace: 'nowrap' }}>
                        ₹{earned.toLocaleString('en-IN')}
                      </td>
                      <td>
                        <Chip tone={st.tone}>{st.text}</Chip>
                        {l.featured && <> <Chip tone="seal">★ Featured</Chip></>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn btn-light btn-sm" title="View listing" onClick={() => setViewTarget(l)}>
                            <Icon name="eye" size={15} /> View
                          </button>
                          {canDelete && (
                            <button className="btn btn-danger btn-sm" title="Delete listing" onClick={() => handleDelete(l.id)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Pagination page={safePage} totalPages={totalPages} total={filtered.length} onChange={setPage} noun="listings" />

      <ListingDetailModal
        listingId={viewTarget?.id}
        onClose={() => setViewTarget(null)}
        onSaved={load}
      />

      <ConfirmModal
        state={confirmState}
        onClose={() => setConfirmState(null)}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
//  ConfirmModal — small reusable destructive-action confirmation, replaces
//  native window.confirm() so it matches the app's own dialog styling.
//  `state` is null when closed, or { title, message, confirmLabel, onConfirm }.
// ─────────────────────────────────────────────────────────────────────────
function ConfirmModal({ state, onClose }) {
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (!state?.onConfirm) return
    setBusy(true)
    try {
      await state.onConfirm()
    } finally {
      setBusy(false)
      onClose?.()
    }
  }

  return (
    <Modal
      open={!!state}
      title={state?.title || 'Confirm'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-light" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={confirm}
            disabled={busy}
            style={{ opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Please wait...' : (state?.confirmLabel || 'Confirm')}
          </button>
        </>
      }
    >
      <p className="small" style={{ lineHeight: 1.6 }}>{state?.message}</p>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────
//  Listing detail / edit — the "View" button's target. Fetches the full row
//  (getSingleListing) rather than reusing the table's row data, since the
//  table has no case/loan/document fields to show. Saving always sends the
//  listing back through admin review (backend's updateListing resets status
//  to PENDING_REVIEW unconditionally), so the UI says so up front rather than
//  leaving that as a surprise after Save.
// ─────────────────────────────────────────────────────────────────────────
function ListingDetailModal({ listingId, onClose, onSaved }) {
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')
  const [form, setForm]       = useState(null)

  useEffect(() => {
    if (!listingId) { setListing(null); setForm(null); return }
    setLoading(true)
    setErr('')
    getSingleListing(listingId)
      .then((res) => {
        const l = res.listing
        setListing(l)
        setForm({
          price: String(l.price ?? ''),
          propertyStatus: l.propertyStatus || '',
          disputeType: l.disputeType || '',
          caseStatus: l.caseStatus || '',
          caseNumber: l.caseNumber || '',
          courtName: l.courtName || '',
          partiesInvolved: l.partiesInvolved || '',
          loanDefault: !!l.loanDefault,
          lenderName: l.lenderName || '',
          sellerNotes: l.sellerNotes || '',
        })
      })
      .catch((e) => setErr(e?.response?.data?.message || 'Listing load nahi hui'))
      .finally(() => setLoading(false))
  }, [listingId])

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const save = async () => {
    setSaving(true)
    setErr('')
    try {
      // Optional fields are seeded as '' when the listing has them unset (null) —
      // the backend schema treats them as optional-if-absent, not optional-if-empty,
      // so an unset field must be omitted rather than sent back as ''.
      const payload = { loanDefault: form.loanDefault, price: Number(form.price) || listing.price }
      if (form.propertyStatus === 'DISPUTED' && !form.disputeType) {
        setErr('Dispute type select karein (Civil / Criminal / Other)')
        setSaving(false)
        return
      }
      // Only sent once a status is chosen (a legacy, unclassified listing may still be
      // edited without one). CLEAR carries no dispute type; the server derives the badge.
      if (form.propertyStatus) {
        payload.propertyStatus = form.propertyStatus
        if (form.propertyStatus === 'DISPUTED') payload.disputeType = form.disputeType
      }
      for (const key of ['caseStatus', 'caseNumber', 'courtName', 'partiesInvolved', 'lenderName', 'sellerNotes']) {
        if (form[key]) payload[key] = form[key]
      }
      await updateListing(listingId, payload)
      toast('Listing update ho gayi — dobara admin review me hai')
      onSaved?.()
      onClose?.()
    } catch (e) {
      setErr(e?.response?.data?.message || 'Update nahi hua')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!listingId}
      title="Listing Details"
      onClose={onClose}
      footer={listing && (
        <>
          <button className="btn btn-light" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      )}
    >
      {loading && <p className="muted small">Loading…</p>}
      {err && <div className="small" style={{ color: 'var(--danger)', marginBottom: 12 }}>❌ {err}</div>}

      {listing && form && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 650, color: 'var(--ink)' }}>{listing.address}</div>
            <div className="xs muted" style={{ marginTop: 3 }}>
              {listing.surveyNumber || listing.khasraNumber || '—'} · {listing.city}{listing.tehsil ? `, ${listing.tehsil}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <Chip tone={statusOf(listing.status).tone}>{statusOf(listing.status).text}</Chip>
              <Chip tone={riskOf(listing.propertyStatus).tone}>{riskOf(listing.propertyStatus).text}</Chip>
              <Chip tone="blue">×{listing.totalSales ?? 0} sales</Chip>
            </div>
          </div>

          <p className="small muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
            Changes yahan se dobara admin review me jaati hain — save karne ke baad
            listing "Pending" status me chali jayegi jab tak admin recheck nahi karta.
          </p>

          <Field label="Price (₹)" required>
            <input className="control" type="number" value={form.price}
              onChange={(e) => update('price', e.target.value.replace(/\D/g, ''))} />
          </Field>

          <Field label="Property Status" required>
            <select
              className="control" value={form.propertyStatus}
              onChange={(e) => setForm((prev) => ({ ...prev, propertyStatus: e.target.value, disputeType: e.target.value === 'CLEAR' ? '' : prev.disputeType }))}
            >
              {!listing.propertyStatus && <option value="">Not classified — select…</option>}
              <option value="CLEAR">Clear</option>
              <option value="DISPUTED">Dispute</option>
            </select>
          </Field>

          {form.propertyStatus === 'DISPUTED' && (
            <Field label="Dispute Type" required>
              <select className="control" value={form.disputeType} onChange={(e) => update('disputeType', e.target.value)}>
                <option value="">Select…</option>
                <option value="CIVIL">Civil</option>
                <option value="CRIMINAL">Criminal</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
          )}

          <Field label="Case Status" optional>
            <select className="control" value={form.caseStatus} onChange={(e) => update('caseStatus', e.target.value)}>
              <option value="">—</option>
              <option value="ACTIVE">Active</option>
              <option value="STAYED">Stayed</option>
              <option value="DISPOSED">Disposed</option>
            </select>
          </Field>

          {listing.caseExists && (
            <>
              <Field label="Case Number" optional>
                <input className="control" value={form.caseNumber} onChange={(e) => update('caseNumber', e.target.value)} />
              </Field>
              <Field label="Court Name" optional>
                <input className="control" value={form.courtName} onChange={(e) => update('courtName', e.target.value)} />
              </Field>
              <Field label="Parties Involved" optional>
                <input className="control" value={form.partiesInvolved} onChange={(e) => update('partiesInvolved', e.target.value)} />
              </Field>
            </>
          )}

          <Field label="Loan Default / Bank Dues" optional>
            <select className="control" value={form.loanDefault ? 'true' : 'false'}
              onChange={(e) => update('loanDefault', e.target.value === 'true')}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </Field>

          {form.loanDefault && (
            <Field label="Lender Name" optional>
              <input className="control" value={form.lenderName} onChange={(e) => update('lenderName', e.target.value)} />
            </Field>
          )}

          <Field label="Partner Notes" optional>
            <textarea className="control" rows={3} value={form.sellerNotes} onChange={(e) => update('sellerNotes', e.target.value)} />
          </Field>
        </>
      )}
    </Modal>
  )
}

const S = {
  toolbar:    { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 },
  searchWrap: { position: 'relative', flex: '1 1 260px', minWidth: 220 },
  searchIcon: { position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none', display: 'grid' },
  chipsRow:   { display: 'flex', gap: 6, flexWrap: 'wrap' },
  center:     { padding: 48, textAlign: 'center' },
  errorBox:   { padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--danger-soft)', borderColor: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 13.5, fontWeight: 600 },
}