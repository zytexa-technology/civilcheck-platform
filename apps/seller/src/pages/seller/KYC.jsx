// ─────────────────────────────────────────────────────────────────────────
//  seller/KYC.jsx  —  Profile & KYC   (light theme, partner portal)
//
//  Pehle ye page purane DARK dashboard ka tha — colors hardcoded (#111318,
//  #0a0c10, 'Crimson Pro' etc.) the, isliye light portal me kaala box +
//  gayab heading dikh rahi thi (see MyListings.jsx, jo pehle migrate hui).
//  Ab poora design system use karta hai: Card / PageHead / Chip / Field /
//  .docrow / .control aur CSS variables (var(--ink), var(--line)...).
//
//  Pure visual migration — saari real logic (Cloudinary upload, profile
//  save, KYC status fetch) bilkul waise hi hai.
//
//  Identity verification is manual admin-reviewed identity-document upload.
//  See identityVerificationStatus below.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getSellerProfile, updateSellerProfile, getKycStatus,
  uploadCertificate, uploadIdentityDocument, getKycDocumentSignedUrl,
} from '../../api/seller.api'
import { uploadToCloudinary, UploadError } from '../../api/cloudinaryUpload'
import { Card, Chip, PageHead, Field } from '../../components/ui'
import { Icon } from '../../components/Icon'

// Profession-aware document label — the same upload slot/field, just
// labeled for what's actually relevant to review, rather than a
// Lawyer/Civil-Engineer-centric "Bar Council / CE Certificate" label shown
// to every profession regardless. Not a claim that any specific document is
// legally mandatory — descriptive guidance only.
const CERT_LABEL_BY_PROFESSION = {
  LAWYER: 'Bar Council enrollment proof',
  CIVIL_ENGINEER: 'Engineering qualification / professional certificate',
  TEHSIL_EXPERT: 'Relevant qualification / professional / experience proof',
  PROPERTY_CONSULTANT: 'Relevant qualification / professional / experience proof',
}

export default function KYC() {
  const { seller, refreshSeller } = useAuth()
  const [editMode, setEditMode]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState('')
  const [kycData, setKycData]     = useState(null)
  const [loading, setLoading]     = useState(true)

  // ── Document upload ──────────────────────────────────────────────────────
  const certInput   = useRef(null)
  const selfieInput = useRef(null)
  const [certFile, setCertFile]     = useState(null)   // { url, mock, name }
  const [selfieFile, setSelfieFile] = useState(null)
  const [uploading, setUploading]   = useState('')     // '' | 'cert' | 'selfie'
  const [submitting, setSubmitting] = useState(false)
  const [docMsg, setDocMsg]         = useState('')
  const [docErr, setDocErr]         = useState('')

  // ── Identity document (manual review) ────────────────────────────────────
  const idDocInput = useRef(null)
  const [idDocFile, setIdDocFile]           = useState(null)   // { url, mock, name }
  const [idDocUploading, setIdDocUploading] = useState(false)
  const [idDocSubmitting, setIdDocSubmitting] = useState(false)
  const [idDocMsg, setIdDocMsg] = useState('')
  const [idDocErr, setIdDocErr] = useState('')

  // Editable profile fields
  const [profile, setProfile] = useState({
    fullName:    '',
    mobile:      '',
    profession:  '',
    bankAccount: '',
    ifsc:        '',
  })

  // Professional evidence — read-only here (set at Expert signup, not
  // editable on this page; KYC hardening).
  const [professionalInfo, setProfessionalInfo] = useState({ licenseNumber: '', yearsOfExperience: null })

  // Load real data on mount
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [profileRes, kycRes] = await Promise.all([
        getSellerProfile(),
        getKycStatus(),
      ])
      const s = profileRes.seller
      setProfile({
        fullName:    s.name     || '',
        mobile:      s.phone    || '',
        profession:  s.profession || '',
        bankAccount: s.bankAccount || '',
        ifsc:        s.ifsc     || '',
      })
      setProfessionalInfo({
        licenseNumber: s.licenseNumber || '',
        yearsOfExperience: s.yearsOfExperience ?? null,
      })
      setKycData(kycRes)
    } catch (err) {
      console.error('KYC load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await updateSellerProfile({
        name:        profile.fullName,
        bankAccount: profile.bankAccount,
        ifsc:        profile.ifsc,
      })
      setSaveMsg('✅ Profile updated!')
      setEditMode(false)
      await refreshSeller()
    } catch (err) {
      setSaveMsg('❌ Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  // ── Document upload ──────────────────────────────────────────────────────
  const handleFile = async (e, kind) => {
    const file = e.target.files?.[0]
    e.target.value = ''            // re-selecting the same file must re-fire
    if (!file) return

    setUploading(kind)
    setDocErr('')
    setDocMsg('')
    try {
      const purpose = kind === 'cert' ? 'kyc-certificate' : 'kyc-selfie'
      const { url, mock } = await uploadToCloudinary(file, purpose)
      const entry = { url, mock, name: file.name }
      if (kind === 'cert') setCertFile(entry)
      else setSelfieFile(entry)
    } catch (err) {
      setDocErr(err instanceof UploadError
        ? err.message
        : (err?.response?.data?.message || 'Upload fail ho gaya — dobara try karein'))
    } finally {
      setUploading('')
    }
  }

  const submitDocuments = async () => {
    if (!certFile) { setDocErr('Certificate zaroori hai'); return }
    setSubmitting(true)
    setDocErr('')
    setDocMsg('')
    try {
      await uploadCertificate(certFile.url, selfieFile?.url)
      setDocMsg('✅ Documents submit ho gaye — admin 24-48 hours mein review karega')
      setCertFile(null)
      setSelfieFile(null)
      await Promise.all([loadData(), refreshSeller()])
    } catch (err) {
      setDocErr(err?.response?.data?.message || 'Submit nahi hua — dobara try karein')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Identity document (manual review) ────────────────────────────────────
  const handleIdDocFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''            // re-selecting the same file must re-fire
    if (!file) return

    setIdDocUploading(true)
    setIdDocErr('')
    setIdDocMsg('')
    try {
      const { url, mock } = await uploadToCloudinary(file, 'kyc-identity-document')
      setIdDocFile({ url, mock, name: file.name })
    } catch (err) {
      setIdDocErr(err instanceof UploadError
        ? err.message
        : (err?.response?.data?.message || 'Upload fail ho gaya — dobara try karein'))
    } finally {
      setIdDocUploading(false)
    }
  }

  const submitIdentityDocument = async () => {
    if (!idDocFile) { setIdDocErr('Identity document zaroori hai'); return }
    setIdDocSubmitting(true)
    setIdDocErr('')
    setIdDocMsg('')
    try {
      await uploadIdentityDocument(idDocFile.url)
      setIdDocMsg('✅ Identity document submit ho gaya — admin 24-48 hours mein review karega')
      setIdDocFile(null)
      await refreshKyc()
    } catch (err) {
      setIdDocErr(err?.response?.data?.message || 'Submit nahi hua — dobara try karein')
    } finally {
      setIdDocSubmitting(false)
    }
  }

  const refreshKyc = async () => {
    await Promise.all([loadData(), refreshSeller()])
  }

  const initials = profile.fullName
    ? profile.fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  // /seller/kyc/status is the fresher source — it reflects an upload or an
  // admin review decision immediately, while the cached AuthContext seller
  // can still be a page-load old. Fall back to the cached copy when it has
  // not loaded yet.
  const kycStatus       = kycData?.kycStatus      ?? seller?.kycStatus      ?? 'PENDING'
  // Main-KYC (professional credentials) rejection reason — distinct from
  // identityDocumentRejectionReason below, which tracks the separate
  // identity-document review track.
  const kycRejectionReason = kycData?.kycRejectionReason ?? seller?.kycRejectionReason ?? null
  const badge           = kycData?.badge          ?? seller?.badge          ?? 'BRONZE'
  const accuracy        = kycData?.accuracyScore  ?? seller?.accuracyScore  ?? 100
  const barCouncilDoc   = kycData?.barCouncilDoc  ?? seller?.barCouncilDoc  ?? null
  // Identity document verification (manual admin review). null = never
  // submitted; PENDING/APPROVED/REJECTED once it has been. Never derived
  // from the legacy aadhaarVerified flag, which is no longer live (see
  // schema.prisma).
  const identityVerificationStatus   = kycData?.identityVerificationStatus   ?? seller?.identityVerificationStatus   ?? null
  const identityDocumentUrl          = kycData?.identityDocumentUrl         ?? seller?.identityDocumentUrl          ?? null
  const identityDocumentRejectionReason = kycData?.identityDocumentRejectionReason ?? seller?.identityDocumentRejectionReason ?? null
  const badgeEmoji  = badge === 'PLATINUM' ? '💎' : badge === 'GOLD' ? '🥇' : badge === 'SILVER' ? '🥈' : '🥉'
  const badgeLabel  = badge.charAt(0) + badge.slice(1).toLowerCase()

  if (loading) return (
    <Card style={{ padding: 48, textAlign: 'center' }}>
      <p className="muted dev">⏳ Loading profile...</p>
    </Card>
  )

  return (
    <>
      <PageHead
        title="Profile & KYC"
        subtitle="Manage your identity verification and professional credentials"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Chip tone={kycStatus === 'APPROVED' ? 'green' : kycStatus === 'REJECTED' ? 'red' : 'amber'}>
              {kycStatus === 'APPROVED' ? '✓ KYC Approved' : kycStatus === 'REJECTED' ? '✗ KYC Rejected' : '⏳ KYC Pending'}
            </Chip>
            <Chip tone="seal">{badgeEmoji} {badgeLabel} Seller</Chip>
          </div>
        }
      />

      <div style={S.mainGrid}>
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Personal Information */}
          <Card>
            <CardHead
              icon="👤" tint="var(--blue-soft)" title="Personal Information"
              right={
                <button
                  className="btn btn-light btn-sm"
                  onClick={() => editMode ? handleSave() : setEditMode(true)}
                  disabled={saving}
                >
                  {saving ? '⏳ Saving...' : editMode ? '💾 Save' : '✏️ Edit'}
                </button>
              }
            />

            <div style={S.cardBd}>
              {/* Avatar row */}
              <div style={S.avatarRow}>
                <div className="avatar lg">{initials}</div>
                <div>
                  <div className="dev" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{profile.fullName || '—'}</div>
                  <div className="small muted dev" style={{ marginTop: 2 }}>{profile.profession}</div>
                  <div className="xs" style={{ color: 'var(--seal)', marginTop: 4, fontWeight: 600 }}>{badgeEmoji} {badgeLabel} Seller</div>
                </div>
              </div>

              {saveMsg && <InlineMsg tone={saveMsg.startsWith('✅') ? 'ok' : 'err'}>{saveMsg}</InlineMsg>}

              <div className="row">
                <Field label="Full Name">
                  <input
                    className="control"
                    value={profile.fullName}
                    disabled={!editMode}
                    onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  />
                </Field>
                <Field label="Mobile">
                  <input className="control" value={`+91 ${profile.mobile}`} disabled />
                </Field>
              </div>

              <Field label="Profession">
                <input className="control" value={profile.profession} disabled />
              </Field>

              {(professionalInfo.licenseNumber || professionalInfo.yearsOfExperience != null) && (
                <div className="row">
                  <Field label="License / Registration Number">
                    <input className="control" value={professionalInfo.licenseNumber || '—'} disabled />
                  </Field>
                  <Field label="Years of Experience">
                    <input className="control" value={professionalInfo.yearsOfExperience ?? '—'} disabled />
                  </Field>
                </div>
              )}

              {editMode && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn btn-light btn-sm" onClick={() => { setEditMode(false); setSaveMsg('') }}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* KYC Steps — real status from backend */}
          <Card>
            <CardHead icon="🛡️" tint="var(--seal-soft)" title="KYC Verification Steps" sub="Complete all steps to start listing properties" />
            <div style={S.cardBd}>
              {[
                {
                  title: 'Mobile OTP Verification',
                  done: true,
                  desc: `+91 ${profile.mobile} — Verified`,
                },
                {
                  title: 'Identity Document Verification',
                  done: identityVerificationStatus === 'APPROVED',
                  desc:
                    identityVerificationStatus === 'APPROVED' ? 'Identity document reviewed and approved by our team.' :
                    identityVerificationStatus === 'REJECTED' ? 'Identity document was rejected — see below to resubmit.' :
                    identityVerificationStatus === 'PENDING'  ? 'Identity document submitted — admin review pending.' :
                    'Identity document not yet submitted — upload it below.',
                },
                {
                  title: 'Professional Certificate Uploaded',
                  done: !!barCouncilDoc,
                  desc: barCouncilDoc
                    ? 'Certificate submitted for review.'
                    : `${CERT_LABEL_BY_PROFESSION[profile.profession] || 'Professional certificate'} abhi upload nahi hua — neeche upload karo.`,
                },
                {
                  title: 'KYC Approval',
                  done: kycStatus === 'APPROVED',
                  desc:
                    kycStatus === 'APPROVED' ? 'KYC fully verified — listings create kar sakte hain' :
                    kycStatus === 'REJECTED' ? 'KYC was rejected — upload a new certificate below to resubmit.' :
                    'KYC pending — admin review ka wait karo',
                },
                {
                  title: 'Bank Account Linked',
                  done: !!(seller?.bankAccount && seller?.ifsc),
                  desc: seller?.bankAccount
                    ? `Account ···· ${seller.bankAccount.slice(-4)} · IFSC: ${seller.ifsc}`
                    : 'Bank account link nahi hai — neeche add karo',
                },
              ].map((step, i) => (
                <div key={i} style={{
                  ...S.kycStep,
                  background: step.done ? 'var(--verified-soft)' : 'var(--amber-soft)',
                }}>
                  <div style={{
                    ...S.kycStepNum,
                    background: step.done ? 'var(--verified)' : 'var(--seal)',
                    color: step.done ? '#fff' : '#241503',
                  }}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="dev" style={S.kycTitle}>{step.title}</div>
                    <div className="dev" style={S.kycDesc}>{step.desc}</div>
                  </div>
                  <Chip tone={step.done ? 'green' : 'amber'}>{step.done ? '✓ Done' : '⏳ Pending'}</Chip>
                </div>
              ))}
            </div>
          </Card>

          {/* Documents — real Cloudinary signed upload */}
          <Card>
            <CardHead icon="📄" tint="var(--blue-soft)" title="Verification Documents" sub={`${CERT_LABEL_BY_PROFESSION[profile.profession] || 'Professional certificate'} aur ek selfie — PDF ya image, max 10MB`} />
            <div style={S.cardBd}>
              {kycStatus === 'REJECTED' && (
                <InlineMsg tone="err">
                  ✗ Your KYC application was rejected{kycRejectionReason ? ` — ${kycRejectionReason}` : ''}.
                  Upload a new certificate below to resubmit — your application will automatically
                  return to the review queue.
                </InlineMsg>
              )}
              {docErr && <InlineMsg tone="err">❌ {docErr}</InlineMsg>}
              {docMsg && <InlineMsg tone="ok">{docMsg}</InlineMsg>}

              {/* Already-submitted certificate */}
              {barCouncilDoc && !certFile && (
                <InlineMsg tone="ok">
                  ✓ Certificate submitted —{' '}
                  <ViewSignedDocLink field="certificate" style={{ color: 'var(--verified)', textDecoration: 'underline' }} />
                  . Naya upload karne se purana replace ho jayega.
                </InlineMsg>
              )}

              <input ref={certInput} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={(e) => handleFile(e, 'cert')} />
              <input ref={selfieInput} type="file" accept=".jpg,.jpeg,.png" style={{ display: 'none' }} onChange={(e) => handleFile(e, 'selfie')} />

              <DocSlot
                label={CERT_LABEL_BY_PROFESSION[profile.profession] || 'Professional certificate'}
                required
                picked={certFile}
                busy={uploading === 'cert'}
                onPick={() => certInput.current?.click()}
                onClear={() => setCertFile(null)}
              />
              <DocSlot
                label="Selfie (identity match)"
                picked={selfieFile}
                busy={uploading === 'selfie'}
                onPick={() => selfieInput.current?.click()}
                onClear={() => setSelfieFile(null)}
              />

              {(certFile?.mock || selfieFile?.mock) && (
                <InlineMsg tone="warn">
                  ⚠️ Cloudinary mock mode — koi real file store nahi hui. Ye sirf local
                  testing ke liye placeholder URL hai; production credentials chahiye.
                </InlineMsg>
              )}

              <button
                className="btn btn-primary"
                style={{ opacity: (!certFile || submitting) ? 0.5 : 1, marginTop: 4 }}
                onClick={submitDocuments}
                disabled={!certFile || submitting}
              >
                {submitting ? 'Submitting...' : 'Submit for Review'}
              </button>
            </div>
          </Card>

          {/* Identity Document — manual admin review */}
          <Card>
            <CardHead icon="🆔" tint="var(--seal-soft)" title="Identity Document Verification" sub="Upload a government ID (e.g. Aadhaar) — a CivilCheck admin manually reviews it" />
            <div style={S.cardBd}>
              {idDocErr && <InlineMsg tone="err">❌ {idDocErr}</InlineMsg>}
              {idDocMsg && <InlineMsg tone="ok">{idDocMsg}</InlineMsg>}

              {identityVerificationStatus === 'APPROVED' ? (
                <InlineMsg tone="ok" style={{ marginBottom: 0 }}>
                  ✓ Identity document verified by admin
                  {identityDocumentUrl && (
                    <>
                      {' · '}
                      <ViewSignedDocLink field="identity-document" style={{ color: 'var(--verified)', textDecoration: 'underline' }} />
                    </>
                  )}
                </InlineMsg>
              ) : (
                <>
                  {identityVerificationStatus === 'PENDING' && (
                    <InlineMsg tone="warn" style={{ marginBottom: 12 }}>
                      ⏳ Submitted — admin review pending (24-48 hours).
                      {identityDocumentUrl && (
                        <>
                          {' '}
                          <ViewSignedDocLink field="identity-document" label="view submitted document" style={{ color: 'inherit', textDecoration: 'underline' }} />
                        </>
                      )}
                    </InlineMsg>
                  )}
                  {identityVerificationStatus === 'REJECTED' && (
                    <InlineMsg tone="err" style={{ marginBottom: 12 }}>
                      ✗ Rejected{identityDocumentRejectionReason ? ` — ${identityDocumentRejectionReason}` : ''}. Please upload a clearer document below.
                    </InlineMsg>
                  )}

                  <p className="small muted dev" style={{ lineHeight: 1.6, marginBottom: 14 }}>
                    This is reviewed manually by our team — it does not use any government
                    verification API, only a human check of the document you upload.
                  </p>

                  <input ref={idDocInput} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleIdDocFile} />

                  <DocSlot
                    label="Identity document (e.g. Aadhaar)"
                    required
                    picked={idDocFile}
                    busy={idDocUploading}
                    onPick={() => idDocInput.current?.click()}
                    onClear={() => setIdDocFile(null)}
                  />

                  {idDocFile?.mock && (
                    <InlineMsg tone="warn">
                      ⚠️ Cloudinary mock mode — koi real file store nahi hui. Ye sirf local
                      testing ke liye placeholder URL hai; production credentials chahiye.
                    </InlineMsg>
                  )}

                  <button
                    className="btn btn-primary"
                    style={{ opacity: (!idDocFile || idDocSubmitting) ? 0.5 : 1, marginTop: 4 }}
                    onClick={submitIdentityDocument}
                    disabled={!idDocFile || idDocSubmitting}
                  >
                    {idDocSubmitting ? 'Submitting...' : 'Submit for Review'}
                  </button>
                </>
              )}
            </div>
          </Card>

          {/* Bank Details */}
          <Card>
            <CardHead
              icon="🏦" tint="var(--verified-soft)" title="Bank Account for Settlements"
              right={<button className="btn btn-light btn-sm" onClick={() => setEditMode(true)}>✏️ Update</button>}
            />
            <div style={S.cardBd}>
              <div className="row">
                <Field label="Account Number">
                  <input
                    className="control"
                    value={editMode ? profile.bankAccount : (profile.bankAccount ? `•••• ${profile.bankAccount.slice(-4)}` : '—')}
                    disabled={!editMode}
                    onChange={(e) => setProfile({ ...profile, bankAccount: e.target.value })}
                    placeholder="Account number"
                  />
                </Field>
                <Field label="IFSC Code">
                  <input
                    className="control"
                    value={profile.ifsc}
                    disabled={!editMode}
                    onChange={(e) => setProfile({ ...profile, ifsc: e.target.value.toUpperCase() })}
                    placeholder="IFSC code"
                  />
                </Field>
              </div>
              {seller?.bankAccount && (
                <InlineMsg tone="ok" style={{ marginTop: 12, marginBottom: 0 }}>
                  ✓ Bank account linked · Settlements every Monday
                </InlineMsg>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Performance Score — real data */}
          <Card>
            <CardHead icon="📊" tint="var(--seal-soft)" title="Performance Score" />
            <div style={S.cardBd}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--disp)', fontSize: 42, fontWeight: 800, color: 'var(--seal)' }}>{accuracy}%</div>
                <div className="xs muted">Accuracy Score</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                {[
                  { label: 'Accuracy', value: `${accuracy}%`, pct: accuracy, color: 'var(--verified)' },
                ].map(m => (
                  <div key={m.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="muted">{m.label}</span>
                      <span style={{ fontWeight: 600, color: m.color }}>{m.value}</span>
                    </div>
                    <div style={S.progressBar}>
                      <div style={{ ...S.progressFill, width: `${m.pct}%`, background: m.color }} />
                    </div>
                  </div>
                ))}
              </div>

              {accuracy < 95 && (
                <div className="xs muted dev" style={S.scoreNote}>
                  ⚠️ Gold badge ke liye 95% accuracy chahiye. Accurate listings se score badhega.
                </div>
              )}
            </div>
          </Card>

          {/* Compliance */}
          <Card>
            <CardHead icon="⚠️" tint="var(--amber-soft)" title="Compliance" />
            <div style={{ ...S.cardBd, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={S.complianceRow}>
                <span className="muted">KYC Status</span>
                <span style={{ color: kycStatus === 'APPROVED' ? 'var(--verified)' : 'var(--seal)', fontWeight: 600 }}>
                  {kycStatus}
                </span>
              </div>
              <div style={S.complianceRow}>
                <span className="muted">Badge Level</span>
                <span style={{ color: 'var(--seal)', fontWeight: 600 }}>{badgeEmoji} {badgeLabel}</span>
              </div>
              <div className="divider" style={{ margin: '2px 0' }} />
              <div className="muted dev" style={{ lineHeight: 1.6 }}>
                Platform spot-checks <strong style={{ color: 'var(--ink)' }}>10% of listings</strong>. Three accuracy violations = permanent ban.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

// ─── CARD HEADER ───────────────────────────────────────────────────────────
// Icon-box + title(+subtitle) + optional right-aligned action — the same
// header shape every card on this page uses.
const CardHead = ({ icon, tint, title, sub, right }) => (
  <div style={S.cardHd}>
    <div style={{ ...S.cardHdIco, background: tint }}>{icon}</div>
    <div style={{ flex: 1 }}>
      <div className="dev" style={S.cardHdTitle}>{title}</div>
      {sub && <div className="xs muted dev" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
    {right}
  </div>
)

// ─── INLINE MESSAGE ─────────────────────────────────────────────────────────
const InlineMsg = ({ tone = 'ok', children, style }) => {
  const tones = {
    ok:   { background: 'var(--verified-soft)', color: 'var(--verified)' },
    err:  { background: 'var(--danger-soft)',   color: 'var(--danger)' },
    warn: { background: 'var(--amber-soft)',    color: '#8a5c0e' },
  }
  return (
    <div className="small" style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 12, lineHeight: 1.55, ...tones[tone], ...style }}>
      {children}
    </div>
  )
}

// ─── DOCUMENT SLOT ────────────────────────────────────────────────────────
// One row per document: pick → uploaded (with a link to what was actually
// stored) → clear. Nothing here reports success until Cloudinary has returned
// a URL, so a failed upload can never look like a completed one.
// ─── VIEW SIGNED DOCUMENT LINK ──────────────────────────────────────────────
// KYC document security hardening — certificate/selfie/identity-document
// are now `type: authenticated` in Cloudinary, so the raw stored URL is no
// longer directly viewable. This fetches a fresh, short-lived signed URL on
// click, then opens it in a new tab. field: 'certificate' | 'identity-document'.
function ViewSignedDocLink({ field, label = 'view', style }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { url } = await getKycDocumentSignedUrl(field)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Could not open — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <a href="#" onClick={handleClick} style={{ ...style, opacity: busy ? 0.6 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
        {busy ? 'opening…' : label}
      </a>
      {error && <span className="xs" style={{ color: 'var(--danger)', marginLeft: 6 }}>{error}</span>}
    </>
  )
}

const DocSlot = ({ label, required, picked, busy, onPick, onClear }) => (
  <div className="docrow">
    <div className="ic"><Icon name="file" size={16} /></div>
    <div className="nm dev">
      {label}{required && <span className="req"> *</span>}
      {picked ? (
        <div className="xs" style={{ color: 'var(--verified)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ✓ {picked.name}
          {!picked.mock && (
            <>
              {' · '}
              <a href={picked.url} target="_blank" rel="noreferrer" style={{ color: 'var(--verified)', textDecoration: 'underline' }}>view</a>
            </>
          )}
        </div>
      ) : (
        <div className="xs muted" style={{ marginTop: 3 }}>
          {busy ? 'Uploading...' : 'Koi file select nahi hui'}
        </div>
      )}
    </div>
    {picked ? (
      <button className="chip ink up" onClick={onClear} disabled={busy}>Remove</button>
    ) : (
      <button className="chip ink up" onClick={onPick} disabled={busy}>
        {busy ? '...' : 'Choose file'}
      </button>
    )}
  </div>
)

const S = {
  mainGrid: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18, alignItems: 'start' },
  cardHd: { padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 },
  cardHdIco: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 },
  cardHdTitle: { fontSize: 14, fontWeight: 600, color: 'var(--ink)' },
  cardBd: { padding: 18 },
  avatarRow: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 },
  kycStep: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, marginBottom: 10, border: '1px solid var(--line)' },
  kycStepNum: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 },
  kycTitle: { fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 3 },
  kycDesc: { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 },
  progressBar: { height: 6, background: 'var(--paper-2)', borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99, transition: 'width .4s' },
  scoreNote: { marginTop: 14, padding: 10, background: 'var(--paper-2)', borderRadius: 9, lineHeight: 1.5 },
  complianceRow: { display: 'flex', justifyContent: 'space-between' },
}
