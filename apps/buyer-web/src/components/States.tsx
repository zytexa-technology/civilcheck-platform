import { Button } from './Button'

export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="state-block" role="status" aria-live="polite">
      <span className="spinner gold-text" style={{ width: 22, height: 22 }} aria-hidden="true" />
      {label ? <span className="muted">{label}</span> : null}
    </div>
  )
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: string
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="state-block">
      <span className="state-block__icon" aria-hidden="true">
        {icon}
      </span>
      <h3 className="state-block__title">{title}</h3>
      {description ? <p className="state-block__desc">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-block" role="alert">
      <span className="state-block__icon" aria-hidden="true">
        ⚠️
      </span>
      <h3 className="state-block__title">Something went wrong</h3>
      <p className="state-block__desc">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function InlineNotice({ message, tone = 'info' }: { message: string; tone?: 'info' | 'warn' }) {
  return (
    <div className={`notice ${tone === 'warn' ? 'notice--warn' : ''}`.trim()} role="status">
      {message}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="property-card" aria-hidden="true">
      <div className="skeleton" style={{ aspectRatio: '16 / 10' }} />
      <div style={{ padding: 14 }} className="stack">
        <div className="skeleton" style={{ height: 12, width: '70%' }} />
        <div className="skeleton" style={{ height: 12, width: '40%' }} />
      </div>
    </div>
  )
}
