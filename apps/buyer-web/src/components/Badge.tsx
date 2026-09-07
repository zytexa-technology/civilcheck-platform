import type { Tone } from '../lib/format'

/** Small status chip used on cards, list rows and report headers. */
export function Badge({ tone, label }: { tone: Tone; label?: string }) {
  return (
    <span className="pill" style={{ background: tone.bg, color: tone.color }}>
      {label ?? tone.label}
    </span>
  )
}

/** Compact overlay tag (e.g. "Owner" / "Expert") on top of media. */
export function Tag({ children }: { children: string }) {
  return <span className="tag">{children}</span>
}
