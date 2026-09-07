import type { VerificationRequestStatus } from '../types/api'

const STEPS: { key: string; label: string; reachedAt: VerificationRequestStatus[] }[] = [
  {
    key: 'requested',
    label: 'Requested',
    reachedAt: [
      'OPEN', 'ACCEPTED', 'ADVANCE_PAYMENT_PENDING', 'ADVANCE_PAID', 'IN_PROGRESS',
      'COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED',
    ],
  },
  {
    key: 'accepted',
    label: 'Professional accepted',
    reachedAt: [
      'ACCEPTED', 'ADVANCE_PAYMENT_PENDING', 'ADVANCE_PAID', 'IN_PROGRESS',
      'COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED',
    ],
  },
  {
    key: 'advance',
    label: 'Advance payment',
    reachedAt: ['ADVANCE_PAID', 'IN_PROGRESS', 'COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED'],
  },
  {
    key: 'progress',
    label: 'Verification in progress',
    reachedAt: ['IN_PROGRESS', 'COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED'],
  },
  {
    key: 'completed',
    label: 'Findings submitted',
    reachedAt: ['COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED'],
  },
  { key: 'final', label: 'Final payment', reachedAt: ['FULLY_PAID', 'REPORT_UNLOCKED'] },
  { key: 'unlocked', label: 'Report unlocked', reachedAt: ['REPORT_UNLOCKED'] },
]

/**
 * Vertical progress tracker for the verification lifecycle — ported from
 * apps/buyer's VerificationStepper. Steps reflect the real backend status
 * machine (verification.service.ts): "current" is whichever reached step is
 * last, never a separately maintained index that could drift from status.
 */
export function VerificationStepper({ status }: { status: VerificationRequestStatus }) {
  if (status === 'CANCELLED') {
    return (
      <div className="row" style={{ padding: '8px 0' }}>
        <span style={{ fontSize: 18 }} aria-hidden="true">
          ✋
        </span>
        <span style={{ color: 'var(--cc-red)', fontWeight: 600, fontSize: 13 }}>
          This request was cancelled
        </span>
      </div>
    )
  }

  let currentIndex = -1
  STEPS.forEach((step, i) => {
    if (step.reachedAt.includes(status)) currentIndex = i
  })

  return (
    <ol className="stepper" aria-label="Verification progress">
      {STEPS.map((step, i) => {
        const done = i <= currentIndex
        const isCurrent = i === currentIndex
        const isLast = i === STEPS.length - 1
        return (
          <li key={step.key} className="stepper__row" aria-current={isCurrent ? 'step' : undefined}>
            <div className="stepper__rail">
              <div
                className={`stepper__dot${done ? ' stepper__dot--done' : ''}${isCurrent ? ' stepper__dot--current' : ''}`}
                aria-hidden="true"
              >
                {done && !isCurrent ? '✓' : ''}
              </div>
              {!isLast ? (
                <div className={`stepper__line${done && i < currentIndex ? ' stepper__line--done' : ''}`} />
              ) : null}
            </div>
            <span
              className={`stepper__label${done ? ' stepper__label--done' : ''}${isCurrent ? ' stepper__label--current' : ''}`}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
