import { useState, useEffect } from 'react'
import {
  getSellers,
  getKycApplication,
  approveSeller,
  rejectSeller,
  suspendSeller,
  unsuspendSeller,
  updateSellerBadge,
  getAnalyticsOverview,
  deleteSeller,
  approveIdentityDocument,
  rejectIdentityDocument,
  getSellerKycDocumentSignedUrl,
} from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canManageSellerKyc } from '../../utils/permissions'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Field,
  Modal,
  PageHead,
  Pagination,
  ResponsiveTable,
  SearchInput,
  StatCard,
  Toast,
} from '../../components/ui'

const BADGES = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']

// KYC document link — image preview when the URL looks like one, otherwise
// just a "View" link (Cloudinary URLs for the certificate can be a PDF).
//
// KYC document security hardening — certificate/selfie/identity-document are
// now `type: authenticated` in Cloudinary, so the raw stored URL (storedUrl,
// used only to detect "is there a document" and sniff its image/PDF
// extension) is no longer directly viewable. A fresh, short-lived signed URL
// is fetched from the admin-scoped endpoint on mount and used for both the
// thumbnail `<img>` and the "View document" link.
const KycDocLink = ({ label, sellerId, field, storedUrl }) => {
  const [signedUrl, setSignedUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSignedUrl(null)
    setError('')
    if (!storedUrl || !sellerId) return
    setLoading(true)
    getSellerKycDocumentSignedUrl(sellerId, field)
      .then((res) => setSignedUrl(res.url))
      .catch(() => setError('Could not load'))
      .finally(() => setLoading(false))
  }, [sellerId, field, storedUrl])

  if (!storedUrl) {
    return (
      <div>
        <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
        <div className="small muted">Not uploaded</div>
      </div>
    )
  }
  const isImage = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(storedUrl)
  return (
    <div>
      <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
      {loading && <div className="small muted">Loading…</div>}
      {error && <div className="small" style={{ color: 'var(--danger)' }}>{error}</div>}
      {signedUrl && (
        <>
          {isImage && (
            <a href={signedUrl} target="_blank" rel="noreferrer">
              <img src={signedUrl} alt={label} style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 6 }} />
            </a>
          )}
          <a href={signedUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--blue)' }}>View document ↗</a>
        </>
      )}
    </div>
  )
}

const DetailGrid = ({ items }) => (
  <div className="grid g2" style={{ marginBottom: 20 }}>
    {items.map(([label, value]) => (
      <div key={label}>
        <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
      </div>
    ))}
  </div>
)

// ─── SELLER MODAL ─────────────────────────────────────────────────────────
const SellerModal = ({ seller, onClose, onAction, canManage }) => {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [badgeSaving, setBadgeSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Purpose-built KYC review payload (GET /admin/kyc/:id) — the list row only
  // has a certificateUploaded boolean, not enough to actually review KYC.
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(true)

  useEffect(() => {
    let live = true
    getKycApplication(seller.id)
      .then((d) => { if (live) setDetail(d.application) })
      .catch(() => {})
      .finally(() => { if (live) setDetailLoading(false) })
    return () => { live = false }
  }, [seller.id])

  const handleAction = async (action) => {
    if ((action === 'reject' || action === 'suspend' || action === 'rejectIdentity') && !reason.trim()) {
      alert('A reason is required')
      return
    }
    setLoading(true)
    await onAction(action, seller.id, reason)
    setLoading(false)
    onClose()
  }

  const handleBadgeChange = async (e) => {
    const badge = e.target.value
    setBadgeSaving(true)
    await onAction('badge', seller.id, badge)
    setBadgeSaving(false)
    onClose()
  }

  return (
    <Modal open title={`Seller details — ${seller.name}`} onClose={onClose} size="lg" footer={
      <>
        {canManage && seller.kycStatus === 'PENDING' && (
          <>
            <Button variant="soft" onClick={() => handleAction('approve')} disabled={loading}>✓ Approve KYC</Button>
            <Button variant="danger" onClick={() => handleAction('reject')} disabled={loading}>✗ Reject</Button>
          </>
        )}
        {canManage && seller.kycStatus === 'APPROVED' && (
          <Button variant="danger" onClick={() => handleAction('suspend')} disabled={loading}>⏸ Suspend</Button>
        )}
        {canManage && seller.kycStatus === 'SUSPENDED' && (
          <Button variant="soft" onClick={() => handleAction('unsuspend')} disabled={loading}>▶ Reinstate</Button>
        )}
        {canManage && detail?.identityVerification?.status === 'PENDING' && (
          <>
            <Button variant="soft" onClick={() => handleAction('approveIdentity')} disabled={loading}>✓ Approve identity document</Button>
            <Button variant="danger" onClick={() => handleAction('rejectIdentity')} disabled={loading}>✗ Reject identity document</Button>
          </>
        )}
        {canManage && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={loading}>🗑 Delete account</Button>
        )}
        <Button variant="ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>Close</Button>
      </>
    }>
      <DetailGrid items={[
        ['Full name', seller.name],
        ['Phone', seller.phone],
        ['Email', seller.email || '—'],
        ['Partner role', seller.partnerRole || '—'],
        ['Profession', seller.profession],
        ['License / registration number', detail?.licenseNumber || '—'],
        ['Years of experience', detail?.yearsOfExperience ?? '—'],
        ['Badge', seller.badge],
        ['KYC status', seller.kycStatus],
        ['Accuracy score', `${seller.accuracyScore}%`],
        ['Total listings', seller.totalListings],
        ['Total earnings', `₹${(seller.totalEarnings || 0).toLocaleString('en-IN')}`],
      ]} />

      {seller.kycStatus === 'REJECTED' && detail?.kycRejectionReason && (
        <div className="small" style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'var(--danger-soft, #fdecea)', color: 'var(--danger, #b3261e)' }}>
          Previous rejection reason: {detail.kycRejectionReason}
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }} className="muted">KYC documents</div>
        {detailLoading ? (
          <p className="small muted">⏳ Loading documents…</p>
        ) : (
          <div className="grid g2">
            <KycDocLink label="Professional certificate" sellerId={seller.id} field="certificate" storedUrl={detail?.documents?.barCouncilDoc} />
            <KycDocLink label="Selfie" sellerId={seller.id} field="selfie" storedUrl={detail?.documents?.selfieUrl} />
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }} className="muted">
          Identity document (manual review)
        </div>
        {detailLoading ? (
          <p className="small muted">⏳ Loading…</p>
        ) : (
          <div className="grid g2">
            <KycDocLink label="Identity document" sellerId={seller.id} field="identity-document" storedUrl={detail?.identityVerification?.documentUrl} />
            <div>
              <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Status</div>
              <Badge tone={
                detail?.identityVerification?.status === 'APPROVED' ? 'green' :
                detail?.identityVerification?.status === 'REJECTED' ? 'red' :
                detail?.identityVerification?.status === 'PENDING'  ? 'amber' : 'grey'
              }>
                {detail?.identityVerification?.status || 'Not submitted'}
              </Badge>
              {detail?.identityVerification?.status === 'REJECTED' && detail?.identityVerification?.rejectionReason && (
                <div className="small muted" style={{ marginTop: 6 }}>Reason: {detail.identityVerification.rejectionReason}</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }} className="muted">Compliance & payout readiness</div>
        {detailLoading ? (
          <p className="small muted">⏳ Loading…</p>
        ) : (
          <DetailGrid items={[
            ['T&C accepted', detail?.compliance?.tcAccepted ? 'Yes ✓' : 'No ✗'],
            ['Digital signature', detail?.documents?.digitalSignature || '— not signed —'],
            ['Bank account', detail?.banking?.bankAccountLast4 ? `****${detail.banking.bankAccountLast4}` : 'Not on file'],
            ['IFSC', detail?.banking?.ifsc || 'Not on file'],
            ['PAN on file', detail?.banking?.panOnFile ? 'Yes ✓' : 'No ✗'],
          ]} />
        )}
      </div>

      {!canManage && (
        <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          🔒 Your role has read-only access to seller KYC/badge actions.
        </div>
      )}

      {canManage && seller.kycStatus === 'APPROVED' && (
        <Field label="Badge (drives commission split)">
          <select className="control" value={seller.badge} onChange={handleBadgeChange} disabled={badgeSaving}>
            {BADGES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
      )}

      {canManage && (
        seller.kycStatus === 'PENDING' ||
        seller.kycStatus === 'APPROVED' ||
        detail?.identityVerification?.status === 'PENDING'
      ) && (
        <Field label="Reason" hint="Required to reject or suspend (either KYC or the identity document).">
          <input className="control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" />
        </Field>
      )}

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Delete this partner account?"
        description={`"${seller.name}" will be soft-deleted — every listing/property/reward record they created stays intact and attributable, but they can no longer log in. This cannot be undone from the UI.`}
        confirmLabel="Delete account"
        loading={loading}
        onConfirm={() => handleAction('delete')}
        onClose={() => setConfirmDelete(false)}
      />
    </Modal>
  )
}

// ─── MAIN SELLERS PAGE ────────────────────────────────────────────────────
export default function Sellers() {
  const { admin } = useAuth()
  const canManage = canManageSellerKyc(admin?.role)
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedSeller, setSelectedSeller] = useState(null)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  // Platform-wide counts. These used to be derived from the loaded array, which
  // was already wrong under a filter and would be badly wrong now that only one
  // page is in memory — so they come from the analytics endpoint instead.
  const [counts, setCounts] = useState(null)
  const LIMIT = 20

  useEffect(() => { loadCounts() }, [])

  const loadCounts = async () => {
    try {
      const d = await getAnalyticsOverview()
      setCounts(d.overview?.users || null)
    } catch {
      setCounts(null)
    }
  }

  useEffect(() => { loadSellers() }, [filter, roleFilter, page])

  const changeFilter = (value) => { setFilter(value); setPage(1) }
  const changeRoleFilter = (value) => { setRoleFilter(value); setPage(1) }

  const loadSellers = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: LIMIT }
      if (filter) params.kycStatus = filter
      if (roleFilter) params.partnerRole = roleFilter
      const data = await getSellers(params)
      setSellers(data.sellers || [])
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load sellers')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleAction = async (action, id, reasonOrBadge) => {
    try {
      if (action === 'approve') await approveSeller(id)
      if (action === 'reject') await rejectSeller(id, reasonOrBadge)
      if (action === 'suspend') await suspendSeller(id, reasonOrBadge)
      if (action === 'unsuspend') await unsuspendSeller(id)
      if (action === 'badge') await updateSellerBadge(id, reasonOrBadge)
      if (action === 'delete') await deleteSeller(id)
      if (action === 'approveIdentity') await approveIdentityDocument(id)
      if (action === 'rejectIdentity') await rejectIdentityDocument(id, reasonOrBadge)
      showToast(`✅ Seller ${action} successfully!`)
      loadSellers()
      loadCounts()
    } catch (err) {
      showToast(`❌ Error: ${err.response?.data?.message || 'Something went wrong'}`)
    }
  }

  // Search filter — client side, scoped to the current page (the backend
  // seller list has no search param).
  const filtered = sellers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search)
  )

  const kycTone = { APPROVED: 'green', PENDING: 'amber', REJECTED: 'red', SUSPENDED: 'red' }
  const badgeTone = { PLATINUM: 'gold', GOLD: 'gold', SILVER: 'blue', BRONZE: 'grey' }

  const columns = [
    {
      key: 'seller',
      header: 'Seller',
      render: (s) => (<><div style={{ fontWeight: 600 }}>{s.name}</div><div className="small muted">{s.phone}</div></>),
    },
    { key: 'partnerRole', header: 'Partner role', render: (s) => <Badge tone={s.partnerRole === 'REPORTER' ? 'amber' : s.partnerRole === 'EXPERT' ? 'blue' : 'grey'}>{s.partnerRole || '—'}</Badge> },
    { key: 'profession', header: 'Profession' },
    { key: 'badge', header: 'Badge', render: (s) => <Badge tone={badgeTone[s.badge] || 'grey'}>{s.badge}</Badge> },
    { key: 'kycStatus', header: 'KYC status', render: (s) => <Badge tone={kycTone[s.kycStatus] || 'grey'}>{s.kycStatus}</Badge> },
    { key: 'totalListings', header: 'Listings' },
    {
      key: 'accuracyScore',
      header: 'Accuracy',
      render: (s) => <span style={{ color: s.accuracyScore >= 95 ? 'var(--green)' : s.accuracyScore >= 90 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>{s.accuracyScore}%</span>,
    },
    { key: 'totalEarnings', header: 'Earnings', render: (s) => <span style={{ color: 'var(--green)', fontWeight: 600 }}>₹{(s.totalEarnings || 0).toLocaleString('en-IN')}</span> },
    {
      key: 'actions',
      header: 'Actions',
      render: (s) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" onClick={() => setSelectedSeller(s)}>View</Button>
          {canManage && s.kycStatus === 'PENDING' && (
            <Button size="sm" variant="soft" onClick={() => handleAction('approve', s.id, '')}>Approve</Button>
          )}
          {canManage && s.kycStatus === 'APPROVED' && (
            <Button size="sm" variant="danger" onClick={() => setSelectedSeller(s)}>Suspend</Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHead title="Seller management" subtitle="KYC approval, badge levels, suspend & monitor all sellers" />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard tone="grey" icon="👥" value={counts?.totalSellers ?? '—'} label="Total sellers" />
        <StatCard tone="green" icon="✅" value={counts?.approvedSellers ?? '—'} label="Approved" />
        <StatCard tone="amber" icon="🟡" value={counts?.pendingSellers ?? '—'} label="Pending KYC" />
        <StatCard tone="red" icon="⛔" value={counts?.suspendedSellers ?? '—'} label="Suspended" />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Filter this page by name or phone…" style={{ flex: 1, minWidth: 220 }} />
        <select className="control" value={filter} onChange={(e) => changeFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All status</option>
          <option value="PENDING">Pending KYC</option>
          <option value="APPROVED">Approved</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <select className="control" value={roleFilter} onChange={(e) => changeRoleFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All partner roles</option>
          <option value="OWNER">Owner</option>
          <option value="REPORTER">Reporter</option>
          <option value="EXPERT">Expert</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={loadSellers} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : filtered}
            getRowKey={(s) => s.id}
            emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading sellers…' : 'No sellers found'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="sellers" />
        </Card>
      )}

      {selectedSeller && (
        <SellerModal key={selectedSeller.id} seller={selectedSeller} onClose={() => setSelectedSeller(null)} onAction={handleAction} canManage={canManage} />
      )}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
