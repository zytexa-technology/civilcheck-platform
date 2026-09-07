// ─────────────────────────────────────────────────────────────────────────
//  Icon.jsx  —  CivilCheck Partner Portal icon set
//  File #2 of the redesign.
//
//  RAKHNA:  src/components/Icon.jsx
//
//  Teen cheezein export hoti hain:
//    <Icon name="dash" size={18} />   → generic line icon (stroke = currentColor)
//    <Seal size="sm" />               → gold "seal" logo (shield + tick)
//    <GoogleIcon size={18} />         → colored Google "G"
//
//  Mockup ke ICONS + saare one-off SVGs yahan ek jagah hain, isliye pages
//  ko inline <svg> likhne ki zaroorat nahi padegi.
// ─────────────────────────────────────────────────────────────────────────

// Har icon ka andar ka SVG content (paths). Sab 0 0 24 24 viewBox par bane hain.
const PATHS = {
  // ── sidebar / nav ──
  dash:    <><path d="M3 13h8V3H3zM13 21h8v-6h-8zM13 3v8h8V3zM3 21h8v-4H3z" /></>,
  props:   <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16" /></>,
  add:     <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  chart:   <><path d="M3 3v18h18M8 14v4M13 10v8M18 6v12" /></>,
  bell:    <><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>,
  user:    <><circle cx="12" cy="8" r="4" /><path d="M5 20c1.5-4 12-4 14 0" /></>,
  feed:    <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
  wallet:  <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M16 12h3" /></>,
  trophy:  <><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0zM7 4H4v2a3 3 0 003 3M17 4h3v2a3 3 0 01-3 3" /></>,
  inbox:   <><path d="M4 4h16v12H8l-4 4z" /></>,
  file:    <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></>,
  money:   <><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
  vmoney:  <><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
  settle:  <><path d="M3 10l9-6 9 6M5 10v9M19 10v9M9 19v-6M15 19v-6M3 21h18" /></>,
  star:    <><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L3 7.7l5.4-.8z" /></>,
  shield:  <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></>,

  // ── shield with tick (seal / verification) ──
  shieldCheck: <><path d="M9 12l2 2 4-4" /><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></>,
  // Verification Marketplace nav item (Phase 3) — same glyph as shieldCheck,
  // kept as its own key so the nav's `<Icon name={sectionId} />` convention
  // (section id doubles as icon name) doesn't need a special case.
  vreq: <><path d="M9 12l2 2 4-4" /><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></>,

  // ── one-off UI icons ──
  check:    <><path d="M20 6L9 17l-5-5" /></>,
  mobile:   <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M10 18h4" /></>,
  logout:   <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></>,
  menu:     <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  chevronDown: <><path d="M6 9l6 6 6-6" /></>,
  clock:    <><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="9" /></>,
  lock:     <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  plus:     <><path d="M12 5v14M5 12h14" /></>,
  eye:      <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  heart:    <><path d="M20.8 5.6a5 5 0 00-7 0L12 7.3l-1.8-1.7a5 5 0 10-7 7L12 21l8.8-8.4a5 5 0 000-7z" /></>,
  bookmark: <><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></>,
  image:    <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 15l5-4 3 2 4-4 6 5" /></>,
}

/**
 * Generic line icon. `stroke` currentColor use karta hai — parent ka color inherit hoga.
 * @param {string} name   PATHS ka koi bhi key (e.g. "dash", "bell", "check")
 * @param {number} size   pixels (default 18)
 * @param {number} stroke stroke-width (default 2; ticks ke liye 2.6/3 pass karo)
 */
export function Icon({ name, size = 18, stroke = 2, style, ...rest }) {
  const content = PATHS[name]
  if (!content) {
    // Prod build me silent — sirf dev me missing-icon warning dikhao
    if (import.meta.env.DEV) console.warn(`Icon: "${name}" naam ka icon nahi mila`)
    return null
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      {...rest}
    >
      {content}
    </svg>
  )
}

/**
 * Gold "Seal" logo — CivilCheck ki pehchaan (shield + tick, dashed ring).
 * `.seal` class GlobalStyles se aati hai.
 * @param {string} size  "sm" | "md" | "lg"  (default "md")
 */
export function Seal({ size = 'md', className = '', style }) {
  const sizeClass = size === 'sm' ? 'seal sm' : size === 'lg' ? 'seal lg' : 'seal'
  return (
    <div className={`${sizeClass} ${className}`.trim()} style={style}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4" />
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      </svg>
    </div>
  )
}

/**
 * Google "G" — multi-color, isliye alag component (currentColor use nahi karta).
 */
export function GoogleIcon({ size = 18, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.1-11.3-7.5l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.6 35.9 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  )
}

export default Icon