import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`.trim()}>{children}</div>
}

export function SectionCard({
  icon,
  title,
  children,
  className = '',
}: {
  icon: string
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`card card--section ${className}`.trim()}>
      <div className="card__head">
        <span className="card__icon" aria-hidden="true">
          {icon}
        </span>
        <h3 className="card__title">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export function DetailRow({
  label,
  value,
  valueColor,
  children,
}: {
  label: string
  value?: string
  valueColor?: string
  children?: ReactNode
}) {
  return (
    <div className="detail-row">
      <span className="detail-row__label">{label}</span>
      {children ?? (
        <span className="detail-row__value" style={valueColor ? { color: valueColor } : undefined}>
          {value ?? '—'}
        </span>
      )}
    </div>
  )
}

export function InfoGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="info-grid">
      {items.map((item) => (
        <div key={item.label}>
          <div className="info-grid__label">{item.label}</div>
          <div className="info-grid__value">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="spread" style={{ marginBottom: 14 }}>
      <h2 className="section-title">{children}</h2>
      {action}
    </div>
  )
}
