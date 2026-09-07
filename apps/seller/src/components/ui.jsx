// ─────────────────────────────────────────────────────────────────────────
//  ui.jsx  —  CivilCheck Partner Portal shared building blocks
//  File #3 of the redesign.
//
//  RAKHNA:  src/components/ui.jsx
//
//  Har role page inhi pieces ko reuse karega:
//    <Card>…</Card>                       — white surface card
//    <StatCard icon color value label />  — 4-up stat tiles
//    <Chip tone="green">Approved</Chip>   — status pills
//    <PageHead title subtitle />          — page heading
//    <SectionTitle right={…}>Heading</…>  — section heading + action
//    <Field label required>…</Field>      — form field wrapper
//    <Modal open title onClose footer />  — dialog
//    toast('message')  +  <ToastHost />   — global toast (Layout me ek baar mount)
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { Icon } from './Icon'

// ─── CARD ──────────────────────────────────────────────────────────────────
export function Card({ children, className = '', style, ...rest }) {
  return (
    <div className={`card ${className}`.trim()} style={style} {...rest}>
      {children}
    </div>
  )
}

// ─── STAT CARD ─────────────────────────────────────────────────────────────
// Mockup: statCard(ic,color,n,l,trend)
// `color+'22'` = us color ka halka background (hex alpha 0x22 ≈ 13%).
export function StatCard({ icon, color = '#2b5c8f', value, label, trend }) {
  return (
    <div className="card stat">
      <div className="top">
        <div className="ic" style={{ background: color + '22', color }}>
          <Icon name={icon} size={19} />
        </div>
        {trend && <span className="trend" style={{ color: 'var(--verified)' }}>{trend}</span>}
      </div>
      <div className="n">{value}</div>
      <div className="l">{label}</div>
    </div>
  )
}

// ─── CHIP ──────────────────────────────────────────────────────────────────
// tone: "green" | "amber" | "red" | "ink" | "seal" | "blue"
export function Chip({ tone = 'ink', children, style }) {
  return <span className={`chip ${tone}`} style={style}>{children}</span>
}

// ─── PAGE HEAD ─────────────────────────────────────────────────────────────
export function PageHead({ title, subtitle, right }) {
  return (
    <div className="page-head" style={right ? { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 } : undefined}>
      <div>
        <h2 className="dev">{title}</h2>
        {subtitle && <p className="dev">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

// ─── SECTION TITLE ─────────────────────────────────────────────────────────
// <SectionTitle right={<button…>View all</button>}>Recent Properties</SectionTitle>
export function SectionTitle({ children, right, style }) {
  return (
    <div className="section-title" style={style}>
      <h3 className="dev">{children}</h3>
      {right}
    </div>
  )
}

// ─── FORM FIELD ────────────────────────────────────────────────────────────
// <Field label="Full Name" required>…input/select/textarea…</Field>
// <Field label="Email" optional>…</Field>
export function Field({ label, required, optional, children }) {
  return (
    <div className="field">
      <label>
        {label}{' '}
        {required && <span className="req">*</span>}
        {optional && <span className="opt">(optional)</span>}
      </label>
      {children}
    </div>
  )
}

// ─── PAGINATION ────────────────────────────────────────────────────────────
// Renders nothing when everything already fits on one page.
export function Pagination({ page, totalPages, total, onChange, noun = 'items' }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
      <span className="small muted">Page {page} of {totalPages} · {total} {noun}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-light btn-sm" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>
          ← Prev
        </button>
        <button className="btn btn-light btn-sm" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
          Next →
        </button>
      </div>
    </div>
  )
}

// ─── MODAL ─────────────────────────────────────────────────────────────────
// Controlled: page apna `open` state rakhta hai.
// <Modal open={show} title="Upload Report" onClose={()=>setShow(false)}
//        footer={<><button…>Cancel</button><button…>Submit</button></>}>
//   …body…
// </Modal>
export function Modal({ open, title, onClose, footer, children }) {
  // Escape se close + background scroll lock
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-wrap open">
      <div className="modal-bg" onClick={onClose} />
      <div className="modal">
        <div className="modal-head">
          <h2 className="dev">{title}</h2>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--paper-2)', fontSize: 18 }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

// ─── TOAST ─────────────────────────────────────────────────────────────────
// Mockup jaisa hi imperative API. Kisi bhi file me:
//     import { toast } from '../components/ui'
//     toast('Submitted — Pending Review')
//
// Aur Layout me EK BAAR <ToastHost /> mount karna hota hai (File #5 me hoga).
let _emit = null

export function toast(message) {
  if (_emit) _emit(message)
  else if (typeof console !== 'undefined') console.log('[toast]', message)
}

export function ToastHost() {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    _emit = (m) => {
      setMsg(m)
      setShow(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setShow(false), 2400)
    }
    return () => { _emit = null; clearTimeout(timer.current) }
  }, [])

  return <div className={`toast ${show ? 'show' : ''}`}>{msg}</div>
}