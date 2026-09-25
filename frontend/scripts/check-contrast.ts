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
  ['success text on its surface', 'success-text', 'success-surface', 4.5],
  ['warning text on its surface', 'warning-text', 'warning-surface', 4.5],
  ['danger text on its surface', 'danger-text', 'danger-surface', 4.5],
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
