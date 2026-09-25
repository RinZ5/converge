// A booking score is 0-100. The bar beside an option encodes it as a colour so
// the ranking reads at a glance, without a fifth line of text in the row.
//
// The ramp interpolates between palette tokens rather than fixed hex values, so
// it follows the theme (including the dark one) and stays inside the palette.
// A straight red-to-green mix passes through a muddy middle, so it bends
// through --warning at the midpoint.
export const SCORE_MIN = 0
export const SCORE_MAX = 100
const MIDPOINT = 50

export const clampScore = (score: number): number => {
  if (!Number.isFinite(score)) return SCORE_MIN
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, score))
}

export const scoreColor = (score: number): string => {
  const value = clampScore(score)
  const ratio = value >= MIDPOINT ? ((value - MIDPOINT) / MIDPOINT) * 100 : (value / MIDPOINT) * 100
  const [from, to] =
    value >= MIDPOINT ? ['var(--success)', 'var(--warning)'] : ['var(--warning)', 'var(--danger)']
  return `color-mix(in oklab, ${from} ${ratio}%, ${to})`
}
