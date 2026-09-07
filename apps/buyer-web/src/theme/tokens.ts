// ─────────────────────────────────────────────────────────────────────────────
// CivilCheck Buyer Web — design tokens.
//
// Mirrors apps/buyer/src/theme/index.ts (the mobile app's dark-only palette)
// so the web marketplace reads as the same product, not a reskin. Values are
// also published as CSS custom properties in ./global.css — use the CSS
// variables (var(--cc-gold), etc.) in component stylesheets, and reach for
// this file only where a hex value is needed in JS (e.g. a computed health-
// bar or risk-banner colour).
// ─────────────────────────────────────────────────────────────────────────────

export const colors = {
  bg: '#0a0c10',
  surface: '#111318',
  surface2: '#171b23',
  surface3: '#1d2230',
  border: '#222736',
  border2: '#2a3045',

  text: '#e6e9f0',
  muted: '#7b8299',
  dim: '#3d4560',

  gold: '#f0a500',
  goldDim: 'rgba(240,165,0,0.1)',
  goldBorder: 'rgba(240,165,0,0.3)',
  goldGlow: 'rgba(240,165,0,0.22)',

  green: '#23c55e',
  greenDim: 'rgba(35,197,94,0.1)',
  greenBorder: 'rgba(35,197,94,0.3)',

  red: '#f04444',
  redDim: 'rgba(240,68,68,0.1)',
  redBorder: 'rgba(240,68,68,0.3)',

  amber: '#f5a000',
  amberDim: 'rgba(245,160,0,0.1)',
  amberBorder: 'rgba(245,160,0,0.3)',

  blue: '#4f8ef7',
  blueDim: 'rgba(79,142,247,0.1)',
  blueBorder: 'rgba(79,142,247,0.3)',

  violet: '#9b6ef7',
  violetDim: 'rgba(155,110,247,0.12)',
  violetBorder: 'rgba(155,110,247,0.3)',

  onGold: '#000000',
  scrim: 'rgba(10,12,16,0.88)',
  hairline: 'rgba(255,255,255,0.08)',
} as const

export type Colors = typeof colors
