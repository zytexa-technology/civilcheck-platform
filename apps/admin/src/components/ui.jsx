// ─────────────────────────────────────────────────────────────────────────
//  ui.jsx — CivilCheck Admin shared building blocks.
//
//  Pairs with styles/GlobalStyles.jsx's CSS classes/tokens. Every admin page
//  should compose from these instead of hand-rolled inline style objects —
//  that inconsistency (a slightly different badge/card/table per page) was
//  the actual problem this file exists to fix.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'

// ─── CARD ──────────────────────────────────────────────────────────────────
export function Card({ children, flat = false, className = '', style, ...rest }) {
  return (
    <div className={`${flat ? 'card-flat' : 'card'} ${className}`.trim()} style={style} {...rest}>
      {children}
    </div>
  )
}

// ─── STAT CARD ─────────────────────────────────────────────────────────────
export function StatCard({ icon, tone = 'gold', value, label, trend, trendDirection = 'up' }) {
  return (
    <div className="card stat">
      <div className="top">
        <div className={`ic badge ${tone}`} style={{ borderRadius: 10, padding: 0, width: 36, height: 36 }}>
          {icon}
        </div>
        {trend && <span className={`trend ${trendDirection}`}>{trend}</span>}
      </div>
      <div className="n">{value}</div>
      <div className="l">{label}</div>
    </div>
  )
}

// ─── BADGE ─────────────────────────────────────────────────────────────────
// tone: "green" | "amber" | "red" | "blue" | "violet" | "gold" | "grey"
export function Badge({ tone = 'grey', children, style }) {
  return <span className={`badge ${tone}`} style={style}>{children}</span>
}

// ─── PAGE HEAD ─────────────────────────────────────────────────────────────
export function PageHead({ title, subtitle, right }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

// ─── SECTION TITLE ─────────────────────────────────────────────────────────
export function SectionTitle({ children, right, style }) {
  return (
    <div className="section-title" style={style}>
      <h3>{children}</h3>
      {right}
    </div>
  )
}

// ─── BUTTON ────────────────────────────────────────────────────────────────
// variant: "primary" | "ghost" | "soft" | "danger" | "danger-solid"
export function Button({ variant = 'ghost', size, block, children, style, ...rest }) {
  const cls = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', block ? 'btn-block' : ''].filter(Boolean).join(' ')
  return (
    <button className={cls} style={style} {...rest}>
      {children}
    </button>
  )
}

// ─── FORM FIELD ────────────────────────────────────────────────────────────
export function Field({ label, required, optional, hint, children }) {
  return (
    <div className="field">
      {label && (
        <label>
          {label}{' '}
          {required && <span className="req">*</span>}
          {optional && <span className="opt">(optional)</span>}
        </label>
      )}
      {children}
      {hint && <div className="small muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}

// ─── SEARCH INPUT ──────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search…', style, ...rest }) {
  return (
    <div className="searchbox" style={style}>
      <span className="sic">🔍</span>
      <input
        className="control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
    </div>
  )
}

// ─── TABS ──────────────────────────────────────────────────────────────────
export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs">
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value
        const label = typeof opt === 'string' ? opt : opt.label
        return (
          <button
            key={val}
            className={`tab-btn ${value === val ? 'on' : ''}`}
            onClick={() => onChange(val)}
            type="button"
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ─── FILTER PILLS (e.g. status filter row) ─────────────────────────────────
export function PillFilter({ value, onChange, options }) {
  return (
    <div className="pillbar">
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value
        const label = typeof opt === 'string' ? opt : opt.label
        return (
          <button
            key={String(val)}
            className={`pill-filter ${value === val ? 'on' : ''}`}
            onClick={() => onChange(val)}
            type="button"
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ─── STATES: loading / empty / error ───────────────────────────────────────
export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state-block">
      <div className="spinner" />
      <p style={{ marginTop: 6 }}>{label}</p>
    </div>
  )
}

export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="state-block">
      <div className="ic">{icon}</div>
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="state-block">
      <div className="ic">⚠️</div>
      <h4>Couldn't load this</h4>
      <p>{message}</p>
      {onRetry && <Button variant="ghost" size="sm" onClick={onRetry} style={{ marginTop: 6 }}>Try again</Button>}
    </div>
  )
}

// ─── SKELETON ──────────────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16, style, rounded }) {
  return <div className="skel" style={{ width, height, borderRadius: rounded ?? 8, ...style }} />
}

export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 16 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={14} width={c === 0 ? '22%' : `${100 / cols}%`} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── RESPONSIVE TABLE ──────────────────────────────────────────────────────
// Desktop: a normal <table>. Below 900px (GlobalStyles' .tbl-wrap/.tbl-cards
// breakpoint): the same rows render as stacked key/value cards instead —
// no horizontal scrolling of a data table on a phone.
//
// columns: [{ key, header, render?(row) }]
// getRowKey: (row) => string
export function ResponsiveTable({ columns, rows, getRowKey, onRowClick, emptyState }) {
  if (!rows || rows.length === 0) {
    return emptyState ?? <EmptyState title="No results" />
  }

  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tbl-cards">
        {rows.map((row) => (
          <div
            key={getRowKey(row)}
            className="card-flat"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{ padding: 14, cursor: onRowClick ? 'pointer' : undefined }}
          >
            {columns.map((col, i) => (
              <div
                key={col.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '7px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <span className="small muted" style={{ flexShrink: 0 }}>{col.header}</span>
                <span style={{ textAlign: 'right', fontSize: 13 }}>{col.render ? col.render(row) : row[col.key]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ─── PAGINATION ────────────────────────────────────────────────────────────
export function Pagination({ page, totalPages, total, onChange, noun = 'rows' }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <span className="small muted">Page {page} of {totalPages} · {total} {noun}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" size="sm" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>← Prev</Button>
        <Button variant="ghost" size="sm" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>Next →</Button>
      </div>
    </div>
  )
}

// ─── MODAL ─────────────────────────────────────────────────────────────────
export function Modal({ open, title, subtitle, onClose, footer, size, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-wrap">
      <div className="modal-bg" onClick={onClose} />
      <div className={`modal ${size ? size : ''}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <div className="small muted" style={{ marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close" style={{ display: 'grid', placeItems: 'center', fontSize: 18 }}>
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

// ─── CONFIRM DIALOG ────────────────────────────────────────────────────────
// Imperative-friendly wrapper for dangerous actions (block/delete/reject).
// <ConfirmDialog open={...} tone="danger" title="Delete this admin?"
//   description="This cannot be undone." confirmLabel="Delete"
//   onConfirm={...} onClose={...} />
export function ConfirmDialog({ open, tone = 'danger', title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onClose, loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'danger-solid' : 'primary'} onClick={onConfirm} disabled={loading}>
          {loading ? 'Working…' : confirmLabel}
        </Button>
      </>
    }>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>{description}</p>
    </Modal>
  )
}

// ─── TOAST ─────────────────────────────────────────────────────────────────
// Controlled — every existing page already owns a `[toast, setToast]` state
// pair and calls this the same way; only the visual styling changed here.
export const Toast = ({ message, onDismiss }) => {
  if (!message) return null
  return (
    <div className="toast show" role="status" aria-live="polite">
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>
          ✕
        </button>
      )}
    </div>
  )
}
