// ─────────────────────────────────────────────────────────────────────────────
// CivilCheck Buyer — design tokens.
//
// Light-only by design (converted from the original dark palette — see git
// history for the previous dark values). Every screen must pull colours from
// this file rather than inlining hexes, so this single palette swap is what
// re-themes the whole app.
// ─────────────────────────────────────────────────────────────────────────────

export const colors = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surface2: '#F5F6F8',
  surface3: '#EEF0F3',
  border: '#E4E7EC',
  border2: '#D0D5DD',

  text: '#12141C',
  muted: '#5B6472',
  dim: '#98A2B3',

  gold: '#f0a500',
  /* Darker text-safe variant of gold — gold itself is a button/icon/border
     fill colour; as text on light surfaces it fails contrast (~2:1). This
     keeps the same accent family with real contrast (~6:1 on white). */
  goldText: '#92400e',
  goldDim: 'rgba(240,165,0,0.12)',
  goldBorder: 'rgba(240,165,0,0.35)',
  goldGlow: 'rgba(240,165,0,0.25)',

  green: '#16A34A',
  greenDim: 'rgba(22,163,74,0.12)',
  greenBorder: 'rgba(22,163,74,0.35)',

  red: '#DC2626',
  redDim: 'rgba(220,38,38,0.12)',
  redBorder: 'rgba(220,38,38,0.35)',

  amber: '#D97706',
  amberDim: 'rgba(217,119,6,0.12)',
  amberBorder: 'rgba(217,119,6,0.35)',

  blue: '#2563EB',
  blueDim: 'rgba(37,99,235,0.1)',
  blueBorder: 'rgba(37,99,235,0.3)',

  violet: '#7C3AED',
  violetDim: 'rgba(124,58,237,0.12)',
  violetBorder: 'rgba(124,58,237,0.3)',

  /** Text/icons that sit on a gold fill. */
  onGold: '#000000',
  /** Scrim behind the locked-report overlay — deliberately dark regardless of
   * theme, same as any modal backdrop, so the "locked" blur reads clearly. */
  scrim: 'rgba(10,12,16,0.82)',
  hairline: 'rgba(16,24,40,0.06)',
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
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  glow: {
    shadowColor: '#f0a500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
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
