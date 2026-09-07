// ─────────────────────────────────────────────────────────────────────────────
// CivilCheck Buyer — design tokens.
//
// The app is dark-only by design (the HTML prototype it was built from is), so
// there is no light palette here. Every screen must pull colours from this file
// rather than inlining hexes.
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

  /** Text/icons that sit on a gold fill. */
  onGold: '#000000',
  /** Scrim behind the locked-report overlay. */
  scrim: 'rgba(10,12,16,0.88)',
  hairline: 'rgba(255,255,255,0.08)',
} as const

// `md` was missing from the original theme while HomeScreen referenced
// radius.md in two places — those styles silently rendered square corners.
export const radius = {
  sm: 9,
  md: 12,
  lg: 14,
  xl: 20,
  pill: 100,
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const

/** Horizontal gutter every screen shares. */
export const SCREEN_PADDING = spacing.lg

// React Native has no CSS box-shadow — iOS reads shadowColor/Offset/Opacity/
// Radius, Android reads elevation alone. Every elevated surface in the app
// should pull from here rather than hand-rolling a slightly different shadow
// per screen.
export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#f0a500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
} as const

export const typography = {
  screenTitle: { fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  cardTitle: { fontSize: 13.5, fontWeight: '600' },
  body: { fontSize: 12.5, fontWeight: '400' },
  meta: { fontSize: 11, fontWeight: '400' },
  micro: { fontSize: 10, fontWeight: '400' },
} as const

export type Colors = typeof colors
