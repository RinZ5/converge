// Colour-contrast guard (WCAG 2.1 AA).
//
// The palette shipped six failing pairs, including white text on the pastel
// toast fills at 2.05:1 and 2.22:1 — effectively unreadable. Contrast is a
// property of a *pair*, so it cannot be checked by looking at a token alone;
// this asserts the pairs the UI actually renders.
//
// Run: npm run check:contrast

import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/css/style.css', import.meta.url), 'utf8')

// Read a token out of the light-theme :root blocks, following one level of
// var() indirection, so the test reads the real shipped values.
function token(name: string): string {
  const light = css.slice(0, css.indexOf('.dark {'))
  const direct = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(light)
  if (direct) return direct[1]
  const alias = new RegExp(`--${name}:\\s*var\\(--([a-z0-9-]+)\\)`).exec(light)
  if (alias) return token(alias[1])
  throw new Error(`token --${name} not found or not a plain colour`)
}

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// [label, foreground token, background token, minimum]
// 4.5 for text, 3.0 for large text and non-text UI elements (WCAG 1.4.11).
const PAIRS: [string, string, string, number][] = [
  ['body text on page', 'text-primary', 'bg-cream', 4.5],
  ['secondary text on page', 'text-secondary', 'bg-cream', 4.5],
  ['muted text on page', 'text-muted', 'bg-cream', 4.5],
  ['muted text on card', 'text-muted', 'bg-card', 4.5],
  ['primary button label', 'primary-foreground', 'primary-navy', 4.5],
  ['destructive button label', 'destructive-foreground', 'destructive', 4.5],
  ['success toast label', 'on-accent', 'success', 4.5],
  ['danger toast label', 'on-accent', 'danger', 4.5],
  ['amber fill ink (never white)', 'on-amber', 'accent-amber', 4.5],
  // Not the default event colour any more -- that is a tint now, covered by
  // 'draft block label'. --accent-sage-deep still carries white as the
  // calendar's primary fill (buttons, the now marker).
  ['calendar primary fill label', 'on-accent', 'accent-sage-deep', 4.5],
  // Calendar blocks are painted as a tint with an edge. Two things matter: the
  // label has to read on the tint, and the edge has to separate the block from
  // the card. Both are easy to lose by nudging one step of the ramp.
  ['browse block label 1', 'text-primary', 'cat-1-tint', 4.5],
  ['browse block label 2', 'text-primary', 'cat-2-tint', 4.5],
  ['browse block label 3', 'text-primary', 'cat-3-tint', 4.5],
  ['browse block label 4', 'text-primary', 'cat-4-tint', 4.5],
  ['browse block label 5', 'text-primary', 'cat-5-tint', 4.5],
  ['browse block label 6', 'text-primary', 'cat-6-tint', 4.5],
  ['cart block label', 'on-amber', 'accent-amber-tint', 4.5],
  ['draft block label', 'text-primary', 'draft-fill', 4.5],
  ['draft block edge', 'draft-edge', 'bg-card', 3],
  // The edge has to separate from its own fill too, not just from the card:
  // that is the pair a "make it a bit stronger" tweak to the fill breaks first.
  ['draft edge against its fill', 'draft-edge', 'draft-fill', 3],
  ['cart block edge', 'accent-amber-strong', 'bg-card', 3],
  ['booked block label', 'text-primary', 'bg-subtle', 4.5],
  // Shared and booked blocks both take the neutral edge. --border-strong was
  // the first choice and only reaches 2.22:1, which is what this pair catches.
  ['neutral block edge', 'neutral-600', 'bg-card', 3],
  // Per-teacher browse tones: categorical, and all carry the dark label.
  // The -strong step is the block's border, which is the only thing separating
  // one block from the card behind it, so it answers to 1.4.11's 3:1.
  ['browse block edge 1', 'teacher-1-strong', 'bg-card', 3],
  ['browse block edge 2', 'teacher-2-strong', 'bg-card', 3],
  ['browse block edge 3', 'teacher-3-strong', 'bg-card', 3],
  ['browse block edge 4', 'teacher-4-strong', 'bg-card', 3],
  ['browse block edge 5', 'teacher-5-strong', 'bg-card', 3],
  ['browse block edge 6', 'teacher-6-strong', 'bg-card', 3],
  ['teacher tone 1', 'text-primary', 'teacher-1', 4.5],
  ['teacher tone 2', 'text-primary', 'teacher-2', 4.5],
  ['teacher tone 3', 'text-primary', 'teacher-3', 4.5],
  ['teacher tone 4', 'text-primary', 'teacher-4', 4.5],
  ['teacher tone 5', 'text-primary', 'teacher-5', 4.5],
  ['teacher tone 6', 'text-primary', 'teacher-6', 4.5],
  ['shared browse block', 'text-primary', 'border-medium', 4.5],
  ['success text on its surface', 'success-text', 'success-surface', 4.5],
  ['warning text on its surface', 'warning-text', 'warning-surface', 4.5],
  ['danger text on its surface', 'danger-text', 'danger-surface', 4.5],
  // Subject dots on the roster: marks on the card, so 1.4.11's 3:1, not 4.5.
  // The pair tested is the dot's *ring*, not its pastel fill -- the fill is the
  // teacher-tone step above and sits at ~1.5:1, so the ring is the only thing
  // defining the dot's boundary. Drop the ring and the dot stops being visible.
  ['subject dot 1', 'subject-1', 'bg-card', 3],
  ['subject dot 2', 'subject-2', 'bg-card', 3],
  ['subject dot 3', 'subject-3', 'bg-card', 3],
  ['subject dot 4', 'subject-4', 'bg-card', 3],
  ['subject dot 5', 'subject-5', 'bg-card', 3],
  ['subject dot 6', 'subject-6', 'bg-card', 3],
  ['status dot: active', 'success', 'bg-card', 3],
  ['status dot: deactivated', 'danger', 'bg-card', 3],
  ['warning as UI element', 'warning', 'bg-card', 3],
  ['accent stroke on card', 'accent-amber-strong', 'bg-card', 3],
  ['focus ring on card', 'ring', 'bg-card', 3],
]

const failures: string[] = []
for (const [label, fg, bg, min] of PAIRS) {
  const got = contrast(token(fg), token(bg))
  if (got < min) {
    failures.push(`${label}: --${fg} on --${bg} is ${got.toFixed(2)}:1, needs ${min.toFixed(1)}:1`)
  }
}

// White on amber is 1.77:1. Asserting the trap explicitly keeps someone from
// "fixing" an amber button by reaching for --on-accent.
const whiteOnAmber = contrast(token('on-accent'), token('accent-amber'))
if (whiteOnAmber >= 4.5) {
  failures.push(`--on-accent on --accent-amber now passes (${whiteOnAmber.toFixed(2)}:1) — the
  amber value changed; re-check whether --on-amber is still the right pairing.`)
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} colour pair(s) below WCAG AA:\n`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}

console.log(`✓ ${PAIRS.length} colour pairs meet WCAG AA`)
