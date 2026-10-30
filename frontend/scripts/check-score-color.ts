// Score-colour guard.
//
// The bar beside a booking option is the only thing carrying the score visually,
// so the ends and the midpoint have to land on the palette tokens exactly, and
// an out-of-range or missing score must not produce an invalid colour.
//
// Run: npm run check:score

import assert from 'node:assert/strict'
import { clampScore, scoreColor } from '../src/utils/scoreColor.ts'

// --- the three anchors ----------------------------------------------------
assert.equal(scoreColor(100), 'color-mix(in oklab, var(--success) 100%, var(--warning))')
assert.equal(scoreColor(50), 'color-mix(in oklab, var(--success) 0%, var(--warning))')
assert.equal(scoreColor(0), 'color-mix(in oklab, var(--warning) 0%, var(--danger))')

// --- it bends through warning instead of mixing red straight into green ---
assert.match(scoreColor(75), /var\(--success\) 50%, var\(--warning\)/)
assert.match(scoreColor(25), /var\(--warning\) 50%, var\(--danger\)/)

// --- nothing outside the palette, ever ------------------------------------
for (const score of [-40, 0, 1, 49, 50, 51, 99, 100, 140, Number.NaN]) {
  const css = scoreColor(score)
  assert.match(css, /^color-mix\(in oklab, var\(--[a-z]+\) \d+(\.\d+)?%, var\(--[a-z]+\)\)$/, `score ${score} produced ${css}`)
  assert.ok(!css.includes('#'), 'the ramp must never emit a raw colour')
}

// --- out of range is pinned, not wrapped ----------------------------------
assert.equal(clampScore(140), 100)
assert.equal(clampScore(-40), 0)
assert.equal(clampScore(Number.NaN), 0, 'a missing score reads as the worst, not as invalid CSS')
assert.equal(scoreColor(140), scoreColor(100))
assert.equal(scoreColor(-40), scoreColor(0))

console.log('✓ score ramp stays on palette tokens across the whole range')
