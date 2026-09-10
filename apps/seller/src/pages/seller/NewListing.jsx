import { useRef, useState } from 'react'
import { createListing } from '../../api/seller.api'
import { uploadToCloudinary, UploadError } from '../../api/cloudinaryUpload'
import MediaUpload from '../../components/MediaUpload'
import LocationCapture from '../../components/LocationCapture'

// ─── Property type ke hisaab se konse fields dikhne chahiye ───
const PROPERTY_FIELDS = {
  RESIDENTIAL: {
    label: 'Residential',
    icon: '🏠',
    fields: ['colonyApartment', 'flatHouseNo', 'landmark', 'pinCode', 'city', 'tehsil', 'surveyNo', 'khasraNo', 'propertyArea', 'isBuilt'],
  },
  COMMERCIAL: {
    label: 'Commercial',
    icon: '🏢',
    fields: ['colonyApartment', 'flatHouseNo', 'landmark', 'pinCode', 'city', 'tehsil', 'surveyNo', 'khasraNo', 'propertyArea', 'isBuilt'],
  },
  AGRICULTURAL: {
    label: 'Agricultural',
    icon: '🌾',
    fields: ['khasraNo', 'address', 'city', 'tehsil', 'surveyNo'],
  },
  PLOT: {
    label: 'Plot',
    icon: '📐',
    fields: ['colonyApartment', 'flatHouseNo', 'landmark', 'pinCode', 'city', 'tehsil', 'surveyNo', 'khasraNo', 'propertyArea', 'isBuilt'],
  },
  OTHER: {
    label: 'Other',
    icon: '🏗️',
    fields: ['colonyApartment', 'flatHouseNo', 'landmark', 'pinCode', 'city', 'tehsil', 'surveyNo', 'khasraNo', 'propertyArea', 'isBuilt'],
  },
}

const EMPTY_FORM = {
  // Step 1
  propertyType: '',
  address: '',            // Agricultural ke liye purana single address field
  colonyApartment: '',    // Non-agricultural address parts
  flatHouseNo: '',
  landmark: '',
  pinCode: '',
  city: '',
  tehsil: '',
  surveyNo: '',
  khasraNo: '',
  propertyArea: '',
  isBuilt: '',
  // Step 2
  caseExists: '',
  caseNumber: '',
  caseType: '',
  caseStatus: '',
  courtName: '',
  partiesInvolved: '',
  loanDefault: false,
  lenderName: '',
  sellerNotes: '',
  documents: [],
  images: [],
  videos: [],
  latitude: null,
  longitude: null,
  // Step 3
  price: '',
  reportType: 'standard',
}

export default function NewListing() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [busy, setBusy]   = useState(false)   // submit chal raha hai
  const [error, setError] = useState('')      // backend error message
  const [done, setDone]   = useState(false)   // success screen

  // Uploaded documents — real Cloudinary URLs, not names. { url, mock, name }[]
  const [docFiles, setDocFiles] = useState([])
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docError, setDocError] = useState('')
  const fileInputRef = useRef(null)

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleDocFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // re-selecting the same file must re-fire onChange
    if (!file) return
    setUploadingDoc(true)
    setDocError('')
    try {
      const { url, mock } = await uploadToCloudinary(file, 'listing-document')
      const entry = { url, mock, name: file.name }
      setDocFiles((list) => [...list, entry])
      setForm((f) => ({ ...f, documents: [...f.documents, url] }))
    } catch (err) {
      setDocError(err instanceof UploadError
        ? err.message
        : (err?.response?.data?.message || 'Upload fail ho gaya — dobara try karein'))
    } finally {
      setUploadingDoc(false)
    }
  }

  const removeDocFile = (i) => {
    setDocFiles((list) => list.filter((_, idx) => idx !== i))
    setForm((f) => ({ ...f, documents: f.documents.filter((_, idx) => idx !== i) }))
  }

  const selectedType = PROPERTY_FIELDS[form.propertyType]
  const isAgricultural = form.propertyType === 'AGRICULTURAL'

  const showField = (fieldName) => {
    if (!selectedType) return false
    return selectedType.fields.includes(fieldName)
  }

  const nextStep = () => { if (step < 3) setStep(step + 1) }
  const prevStep = () => { if (step > 1) setStep(step - 1) }
  // Form fields ko backend createListing ke contract me convert karo
  const buildPayload = () => {
    // propertyType: backend enum me OTHER nahi hai → nearest PLOT
    const pt = form.propertyType === 'OTHER' ? 'PLOT' : form.propertyType

    // Non-agri: address parts ko ek string me jodo
    const address = isAgricultural
      ? form.address.trim()
      : [form.flatHouseNo, form.colonyApartment, form.landmark, form.pinCode]
          .map(x => (x || '').trim()).filter(Boolean).join(', ')

    // area / construction status backend schema me nahi — notes me capture kar lo
    const extra = []
    if (!isAgricultural && form.propertyArea) extra.push(`Area: ${form.propertyArea}`)
    if (!isAgricultural && form.isBuilt)      extra.push(form.isBuilt === 'built' ? 'Bana hua' : 'Khali land')
    const sellerNotes = [form.sellerNotes.trim(), extra.join(' \u2022 ')].filter(Boolean).join(' | ')

    const caseExists = form.caseExists === 'true'

    return {
      address,
      surveyNumber: form.surveyNo || undefined,
      khasraNumber: form.khasraNo || undefined,
      propertyType: pt,
      city: form.city.trim(),
      tehsil: form.tehsil.trim(),
      caseExists,
      caseNumber:      caseExists ? (form.caseNumber || undefined) : undefined,
      caseType:        caseExists ? (form.caseType || undefined) : undefined,
      caseStatus:      caseExists ? (form.caseStatus || undefined) : undefined,
      courtName:       caseExists ? (form.courtName || undefined) : undefined,
      partiesInvolved: caseExists ? (form.partiesInvolved || undefined) : undefined,
      loanDefault: !!form.loanDefault,
      lenderName:  form.loanDefault ? (form.lenderName || undefined) : undefined,
      price: Number(form.price),
      sellerNotes: sellerNotes || undefined,
      documents: form.documents || [],
      images: form.images || [],
      videos: form.videos || [],
      latitude: form.latitude ?? undefined,
      longitude: form.longitude ?? undefined,
      researchDate: new Date().toISOString(),  // aaj ki date (form me field nahi hai)
    }
  }

  const submit = async () => {
    if (busy) return
    if (form.latitude == null || form.longitude == null) {
      setError('Property Location zaroori hai — Step 2 me "Use My Current Location" par click karein')
      return
    }
    setError(''); setBusy(true)
    try {
      const res = await createListing(buildPayload())
      if (res?.success) {
        setDone(true)                          // success screen dikhao
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        setError(res?.message || 'Listing submit nahi hui')
      }
    } catch (err) {
      // 403 = KYC approved nahi, 400 = koi field missing, etc.
      setError(err?.response?.data?.message || 'Listing submit nahi hui \u2014 dobara try karo')
    } finally {
      setBusy(false)
    }
  }

  const resetForm = () => {
    setForm({ ...EMPTY_FORM }); setStep(1); setDone(false); setError('')
    setDocFiles([]); setDocError('')
  }

  const canProceed = () => {
    if (step === 1) {
      if (!form.propertyType) return false
      if (isAgricultural) {
        if (!form.address || !form.city || !form.tehsil) return false
        if (!form.khasraNo) return false
        return true
      }
      if (!form.colonyApartment || !form.flatHouseNo || !form.pinCode || !form.city || !form.tehsil) return false
      if (!form.propertyArea) return false
      if (!form.isBuilt) return false
      return true
    }
    if (step === 2) {
      if (form.caseExists === '') return false
      // Backend requires caseNumber whenever caseExists is true.
      if (form.caseExists === 'true' && !form.caseNumber.trim()) return false
      // Property Discovery flow (Step 2) — every buyer-visible Listing must
      // have a real map pin; the backend now rejects creation without it.
      if (form.latitude == null || form.longitude == null) return false
      return true
    }
    if (step === 3) {
      if (!form.price) return false
      const p = parseInt(form.price)
      // Backend rejects price < 99 or > 4999.
      return p >= 99 && p <= 4999
    }
    return false
  }

  // ── SUCCESS SCREEN ──
  if (done) {
    return (
      <div style={s.card}>
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>{'\u2705'}</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>
            Listing Submit Ho Gayi!
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8, maxWidth: 380, marginInline: 'auto' }}>
            Aapki listing <b style={{ color: 'var(--ink)' }}>Pending Review</b> me hai. Admin verify karega,
            phir yeh "My Listings" me live dikhegi.
          </div>
          <button className="btn btn-primary" onClick={resetForm} style={{ marginTop: 22 }}>
            + Nayi Listing Add Karein
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>New Property Listing</h1>
          <p style={s.subtitle}>Nayi property add karne ke liye 3 simple steps</p>
        </div>
      </div>

      {/* Stepper */}
      <div style={s.stepper}>
        {[
          { n: 1, label: 'Property Details' },
          { n: 2, label: 'Case & Risk Info' },
          { n: 3, label: 'Pricing & Submit' },
        ].map((st, i, arr) => (
          <div key={st.n} style={s.stepItem}>
            <div style={{
              ...s.stepCircle,
              background: step >= st.n ? 'var(--seal)' : 'var(--paper-2)',
              color: step >= st.n ? '#241503' : 'var(--muted)',
              border: step === st.n ? '2px solid var(--seal)' : '1px solid var(--line-2)',
            }}>
              {step > st.n ? '✓' : st.n}
            </div>
            <div style={{
              ...s.stepLabel,
              color: step >= st.n ? 'var(--ink)' : 'var(--muted)',
              fontWeight: step === st.n ? 700 : 500,
            }}>
              {st.label}
            </div>
            {i < arr.length - 1 && (
              <div style={{ ...s.stepLine, background: step > st.n ? 'var(--seal)' : 'var(--line-2)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Form card */}
      <div style={s.card}>

        {/* ── STEP 1: Property Details ── */}
        {step === 1 && (
          <>
            <div style={s.cardHeader}>
              <div style={{ ...s.cardHdIco, background: 'var(--blue-soft)' }}>🏠</div>
              <div>
                <div style={s.cardHdTitle}>Property Details</div>
                <div style={s.cardHdSub}>Pehle property type chunein — phir relevant fields fill karein</div>
              </div>
            </div>

            {/* ── Property Type Selector ── */}
            <div style={s.field}>
              <label style={s.label}>Property Type *</label>
              <div style={s.typeGrid}>
                {Object.entries(PROPERTY_FIELDS).map(([key, val]) => {
                  const active = form.propertyType === key
                  return (
                    <div
                      key={key}
                      onClick={() => {
                        update('propertyType', key)
                        // Type change hone par fields reset karo
                        update('khasraNo', '')
                        update('surveyNo', '')
                        update('address', '')
                        update('colonyApartment', '')
                        update('flatHouseNo', '')
                        update('landmark', '')
                        update('pinCode', '')
                        update('propertyArea', '')
                        update('isBuilt', '')
                      }}
                      style={{
                        ...s.typeCard,
                        borderColor: active ? 'var(--seal)' : 'var(--line-2)',
                        background: active ? 'var(--seal-soft)' : 'var(--surface-2)',
                      }}
                    >
                      <div style={{ fontSize: 26, marginBottom: 6 }}>{val.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: active ? '#7d5a15' : 'var(--ink)' }}>
                        {val.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Conditional Fields — type select karne ke baad dikhenge ── */}
            {form.propertyType && (
              <div style={s.fieldsSection}>
                <div style={s.fieldsSectionHd}>
                  <span style={{ fontSize: 13 }}>
                    {selectedType.icon} {selectedType.label} ke liye required fields
                  </span>
                </div>

                <div style={s.formGrid}>

                  {/* Khasra Number — required for Agricultural, optional for every other type */}
                  {showField('khasraNo') && (
                    <FormField
                      label={isAgricultural ? 'Khasra Number *' : 'Khasra Number (optional)'}
                      placeholder="e.g. 890/2"
                      value={form.khasraNo}
                      onChange={v => update('khasraNo', v)}
                    />
                  )}

                  {/* Full Address — sirf Agricultural mein (purana field) */}
                  {showField('address') && (
                    <FormField
                      label="Full Address *"
                      placeholder="Ghar/Dukan number, street, locality"
                      value={form.address}
                      onChange={v => update('address', v)}
                      fullWidth
                    />
                  )}

                  {/* Colony / Apartment — non-agricultural */}
                  {showField('colonyApartment') && (
                    <FormField
                      label="Colony / Apartment Name *"
                      placeholder="e.g. Shastri Nagar / Sunrise Apartments"
                      value={form.colonyApartment}
                      onChange={v => update('colonyApartment', v)}
                      fullWidth
                    />
                  )}

                  {/* Flat / House Number — non-agricultural */}
                  {showField('flatHouseNo') && (
                    <FormField
                      label="Flat / House Number *"
                      placeholder="e.g. B-204 / 12"
                      value={form.flatHouseNo}
                      onChange={v => update('flatHouseNo', v)}
                    />
                  )}

                  {/* Landmark — non-agricultural */}
                  {showField('landmark') && (
                    <FormField
                      label="Landmark"
                      placeholder="e.g. Near City Hospital"
                      value={form.landmark}
                      onChange={v => update('landmark', v)}
                    />
                  )}

                  {/* Pin Code — non-agricultural */}
                  {showField('pinCode') && (
                    <FormField
                      label="Pin Code *"
                      placeholder="e.g. 302001"
                      value={form.pinCode}
                      onChange={v => update('pinCode', v.replace(/\D/g, '').slice(0, 6))}
                    />
                  )}

                  {/* City */}
                  {showField('city') && (
                    <FormField
                      label="City *"
                      placeholder="e.g. Jaipur"
                      value={form.city}
                      onChange={v => update('city', v)}
                    />
                  )}

                  {/* Tehsil */}
                  {showField('tehsil') && (
                    <FormField
                      label="Tehsil *"
                      placeholder="e.g. Sanganer"
                      value={form.tehsil}
                      onChange={v => update('tehsil', v)}
                    />
                  )}

                  {/* Survey Number — sabke liye */}
                  {showField('surveyNo') && (
                    <FormField
                      label="Survey Number"
                      placeholder="e.g. 1234/B"
                      value={form.surveyNo}
                      onChange={v => update('surveyNo', v)}
                    />
                  )}

                  {/* Property Area — non-agricultural */}
                  {showField('propertyArea') && (
                    <FormField
                      label="Property Area *"
                      placeholder="e.g. 1200 sq ft"
                      value={form.propertyArea}
                      onChange={v => update('propertyArea', v)}
                    />
                  )}

                </div>

                {/* Built or Vacant Land — non-agricultural, yes/no style cards */}
                {showField('isBuilt') && (
                  <div style={{ ...s.field, marginTop: 4 }}>
                    <label style={s.label}>Property Bana Hua Hai Ya Khali Land Hai? *</label>
                    <div style={s.yesNoGrid}>
                      {[
                        { val: 'built',  label: 'Bana Hua Hai', icon: '🏗️', color: 'var(--blue)', soft: 'var(--blue-soft)' },
                        { val: 'vacant', label: 'Khali Land Hai',  icon: '🟫', color: 'var(--verified)', soft: 'var(--verified-soft)' },
                      ].map(opt => {
                        const active = form.isBuilt === opt.val
                        return (
                          <div
                            key={opt.val}
                            onClick={() => update('isBuilt', opt.val)}
                            style={{
                              ...s.yesNoCard,
                              borderColor: active ? opt.color : 'var(--line-2)',
                              background: active ? opt.soft : 'var(--surface-2)',
                            }}
                          >
                            <span style={{ fontSize: 22 }}>{opt.icon}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: active ? opt.color : 'var(--ink)' }}>
                              {opt.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Placeholder jab type select nahi kiya */}
            {!form.propertyType && (
              <div style={s.placeholder}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>👆</div>
                <div style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 14 }}>
                  Upar se property type chunein
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                  Type select karne ke baad relevant fields automatically dikhenge
                </div>
              </div>
            )}
          </>
        )}

        {/* ── STEP 2: Case & Risk Info ── */}
        {step === 2 && (
          <>
            <div style={s.cardHeader}>
              <div style={{ ...s.cardHdIco, background: 'var(--amber-soft)' }}>⚠️</div>
              <div>
                <div style={s.cardHdTitle}>Case & Risk Information</div>
                <div style={s.cardHdSub}>Property ke legal aur financial risks clearly batao</div>
              </div>
            </div>

            {/* Case exists? */}
            <div style={s.field}>
              <label style={s.label}>Kya koi court case hai? *</label>
              <div style={s.yesNoGrid}>
                {[
                  { val: 'true',  label: 'Haan, case hai',  icon: '⚖️', color: 'var(--danger)', soft: 'var(--danger-soft)' },
                  { val: 'false', label: 'Nahi, koi case nahi', icon: '✅', color: 'var(--verified)', soft: 'var(--verified-soft)' },
                ].map(opt => {
                  const active = form.caseExists === opt.val
                  return (
                    <div
                      key={opt.val}
                      onClick={() => update('caseExists', opt.val)}
                      style={{
                        ...s.yesNoCard,
                        borderColor: active ? opt.color : 'var(--line-2)',
                        background: active ? opt.soft : 'var(--surface-2)',
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{opt.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: active ? opt.color : 'var(--ink)' }}>
                        {opt.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Case details — sirf tab dikho jab caseExists = true */}
            {form.caseExists === 'true' && (
              <div style={s.caseSection}>
                <div style={s.caseSectionHd}>⚖️ Case Details</div>
                <div style={s.formGrid}>
                  <FormField label="Case Number *" placeholder="e.g. CS/1234/2024"
                    value={form.caseNumber} onChange={v => update('caseNumber', v)} />
                  <div style={s.field}>
                    <label style={s.label}>Case Type</label>
                    <select className="control" value={form.caseType} onChange={e => update('caseType', e.target.value)}>
                      <option value="">Select...</option>
                      <option value="PARTITION">Partition</option>
                      <option value="TITLE_DISPUTE">Title Dispute</option>
                      <option value="LOAN_DEFAULT">Loan Default</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Case Status</label>
                    <select className="control" value={form.caseStatus} onChange={e => update('caseStatus', e.target.value)}>
                      <option value="">Select...</option>
                      <option value="ACTIVE">Active</option>
                      <option value="STAYED">Stayed</option>
                      <option value="DISPOSED">Disposed</option>
                    </select>
                  </div>
                  <FormField label="Court Name" placeholder="e.g. District Court, Jaipur"
                    value={form.courtName} onChange={v => update('courtName', v)} />
                  <FormField label="Parties Involved" placeholder="Names of parties in case"
                    value={form.partiesInvolved} onChange={v => update('partiesInvolved', v)} />
                </div>
              </div>
            )}

            {/* Loan Default */}
            <div style={{ ...s.field, marginTop: 8 }}>
              <label style={s.label}>Loan Default / Bank Dues?</label>
              <div style={s.yesNoGrid}>
                {[
                  { val: true,  label: 'Haan, dues hain', icon: '🏦', color: 'var(--danger)', soft: 'var(--danger-soft)' },
                  { val: false, label: 'Nahi', icon: '✅', color: 'var(--verified)', soft: 'var(--verified-soft)' },
                ].map(opt => {
                  const active = form.loanDefault === opt.val
                  return (
                    <div
                      key={String(opt.val)}
                      onClick={() => update('loanDefault', opt.val)}
                      style={{
                        ...s.yesNoCard,
                        borderColor: active ? opt.color : 'var(--line-2)',
                        background: active ? opt.soft : 'var(--surface-2)',
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{opt.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: active ? opt.color : 'var(--ink)' }}>
                        {opt.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {form.loanDefault === true && (
              <FormField label="Lender Name" placeholder="Bank / NBFC ka naam"
                value={form.lenderName} onChange={v => update('lenderName', v)} />
            )}

            <FormTextarea label="Seller Notes (Optional)"
              placeholder="Koi aur zaroori information jo buyers ko pata honi chahiye"
              value={form.sellerNotes} onChange={v => update('sellerNotes', v)} rows={3} />

            {/* Documents — real Cloudinary upload, same pattern as seller/KYC.jsx */}
            <div style={s.field}>
              <label style={s.label}>Supporting Documents</label>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleDocFile} />
              <div style={s.uploadBox} onClick={() => !uploadingDoc && fileInputRef.current?.click()}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
                <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}>
                  {uploadingDoc ? 'Uploading…' : 'Click to upload'}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                  PDF, JPG, PNG — max 10MB each
                </div>
              </div>
              {docError && (
                <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{docError}</div>
              )}
              {docFiles.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {docFiles.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '7px 10px' }}>
                      <span style={{ color: 'var(--verified, #137a56)' }}>✓</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                      {!d.mock && <a href={d.url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue, #2b5c8f)' }}>view</a>}
                      <button type="button" onClick={() => removeDocFile(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12.5 }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              {docFiles.some((d) => d.mock) && (
                <div style={{ fontSize: 11.5, color: 'var(--amber, #B67A12)', marginTop: 6 }}>
                  ⚠️ Cloudinary mock mode — koi real file store nahi hui abhi (production credentials chahiye).
                </div>
              )}
            </div>

            {/* Property media — Phase 2 */}
            <MediaUpload
              purposePrefix="listing"
              images={form.images}
              videos={form.videos}
              onImagesChange={(images) => update('images', images)}
              onVideosChange={(videos) => update('videos', videos)}
            />

            {/* Location pin — Phase 2 (Google Maps integration foundation) */}
            <LocationCapture
              latitude={form.latitude}
              longitude={form.longitude}
              onCapture={(lat, lng) => { update('latitude', lat); update('longitude', lng) }}
            />
          </>
        )}

        {/* ── STEP 3: Pricing ── */}
        {step === 3 && (
          <>
            <div style={s.cardHeader}>
              <div style={{ ...s.cardHdIco, background: 'var(--seal-soft)' }}>💰</div>
              <div>
                <div style={s.cardHdTitle}>Pricing & Submit</div>
                <div style={s.cardHdSub}>Report ki price set karo aur submit karo</div>
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Report Type</label>
              <div style={s.priceGrid}>
                {[
                  { id: 'basic',    name: 'Basic',    price: 199, desc: 'Quick overview' },
                  { id: 'standard', name: 'Standard', price: 299, desc: 'Detailed report' },
                  { id: 'premium',  name: 'Premium',  price: 499, desc: 'Full investigation' },
                ].map(p => {
                  const active = form.reportType === p.id
                  return (
                    <div key={p.id}
                      onClick={() => { update('reportType', p.id); update('price', String(p.price)) }}
                      style={{
                        ...s.priceCard,
                        borderColor: active ? 'var(--seal)' : 'var(--line-2)',
                        background: active ? 'var(--seal-soft)' : 'var(--surface-2)',
                      }}>
                      <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontFamily: 'var(--disp)', fontSize: 28, fontWeight: 600, color: active ? '#7d5a15' : 'var(--ink)', marginTop: 6 }}>
                        ₹{p.price}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{p.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <FormField label="Custom Price (₹) *" placeholder="299" type="number"
              value={form.price} onChange={v => update('price', v.replace(/\D/g, ''))} />
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -10, marginBottom: 16 }}>
              ₹99 – ₹4999 ke beech honi chahiye
            </div>

            {/* Summary */}
            <div style={s.summary}>
              <div style={{ fontFamily: 'var(--disp)', fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>
                📋 Summary Preview
              </div>
              <SummaryRow label="Property Type" value={PROPERTY_FIELDS[form.propertyType]?.label || '—'} />
              {isAgricultural ? (
                <SummaryRow label="Address" value={form.address || '—'} />
              ) : (
                <>
                  <SummaryRow label="Colony / Apartment" value={form.colonyApartment || '—'} />
                  <SummaryRow label="Flat / House No." value={form.flatHouseNo || '—'} />
                  {form.landmark && <SummaryRow label="Landmark" value={form.landmark} />}
                  <SummaryRow label="Pin Code" value={form.pinCode || '—'} />
                </>
              )}
              <SummaryRow label="City" value={form.city || '—'} />
              <SummaryRow label="Tehsil" value={form.tehsil || '—'} />
              {form.surveyNo && <SummaryRow label="Survey No." value={form.surveyNo} />}
              {form.khasraNo  && <SummaryRow label="Khasra No." value={form.khasraNo} />}
              {!isAgricultural && form.propertyArea && <SummaryRow label="Property Area" value={form.propertyArea} />}
              {!isAgricultural && form.isBuilt && (
                <SummaryRow label="Construction Status" value={form.isBuilt === 'built' ? '🏗️ Bana Hua Hai' : '🟫 Khali Land Hai'} />
              )}
              <SummaryRow label="Case Exists" value={form.caseExists === 'true' ? '⚖️ Yes' : '✅ No'} />
              {form.caseExists === 'true' && <SummaryRow label="Case Number" value={form.caseNumber || '—'} />}
              <SummaryRow label="Price" value={form.price ? `₹${form.price}` : '—'} highlight />
            </div>
          </>
        )}

        {/* Error banner */}
        {error && (
          <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)', color: 'var(--danger)', borderRadius: 9, padding: '11px 14px', fontSize: 13, fontWeight: 600, marginTop: 16 }}>
            {'\u26a0\ufe0f'} {error}
          </div>
        )}

        {/* Navigation */}
        <div style={s.navRow}>
          <button className="btn btn-ghost" onClick={prevStep} disabled={step === 1}>
            ← Back
          </button>
          {step < 3 ? (
            <button className="btn btn-primary" onClick={nextStep} disabled={!canProceed()}>
              Next Step →
            </button>
          ) : (
            <button className="btn btn-primary" onClick={submit} disabled={!canProceed() || busy}>
              {busy ? 'Submit ho raha hai…' : '✓ Submit Listing'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Reusable Components ───
function FormField({ label, placeholder, value, onChange, type = 'text', fullWidth }) {
  return (
    <div style={{ ...s.field, gridColumn: fullWidth ? '1 / -1' : 'auto' }}>
      <label style={s.label}>{label}</label>
      <input className="control" type={type} placeholder={placeholder}
        value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function FormTextarea({ label, placeholder, value, onChange, rows = 3 }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <textarea className="control" placeholder={placeholder} rows={rows}
        value={value} onChange={e => onChange(e.target.value)} style={{ resize: 'vertical' }} />
    </div>
  )
}

function SummaryRow({ label, value, highlight }) {
  return (
    <div style={s.summaryRow}>
      <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
      <span style={{ color: highlight ? '#7d5a15' : 'var(--ink)', fontSize: 13, fontWeight: highlight ? 700 : 600 }}>
        {value}
      </span>
    </div>
  )
}

const s = {
  headerRow:    { marginBottom: 24 },
  title:        { fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 600, color: 'var(--ink)' },
  subtitle:     { color: 'var(--muted)', fontSize: 14, marginTop: 4 },
  stepper:      { display: 'flex', alignItems: 'center', marginBottom: 24, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '18px 20px', gap: 8, flexWrap: 'wrap' },
  stepItem:     { display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 200px', minWidth: 0 },
  stepCircle:   { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0, transition: 'all .2s' },
  stepLabel:    { fontSize: 13, whiteSpace: 'nowrap' },
  stepLine:     { flex: 1, height: 2, minWidth: 20, transition: 'background .3s' },
  card:         { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 24 },
  cardHeader:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--line)' },
  cardHdIco:    { width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  cardHdTitle:  { fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' },
  cardHdSub:    { fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  typeGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 },
  typeCard:     { border: '2px solid', borderRadius: 10, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', transition: 'all .15s' },
  fieldsSection:   { marginTop: 20, background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 18 },
  fieldsSectionHd: { color: 'var(--seal)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 16 },
  formGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 },
  field:        { marginBottom: 16 },
  label:        { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 7, fontWeight: 600 },
  placeholder:  { textAlign: 'center', padding: '36px 20px', border: '2px dashed var(--line-2)', borderRadius: 10, marginTop: 16 },
  yesNoGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  yesNoCard:    { border: '2px solid', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'all .15s' },
  caseSection:  { background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)', borderRadius: 10, padding: 16, marginBottom: 16 },
  caseSectionHd:{ color: 'var(--danger)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 },
  uploadBox:    { border: '2px dashed var(--line-2)', borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface-2)' },
  priceGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
  priceCard:    { border: '2px solid', borderRadius: 10, padding: 16, cursor: 'pointer', transition: 'all .15s' },
  summary:      { background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 18, marginTop: 8 },
  summaryRow:   { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' },
  navRow:       { display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line)' },
}