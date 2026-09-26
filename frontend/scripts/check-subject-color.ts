// Subject-tone mapping guard.
//
// The tone is what makes the dot mean something: the same subject has to get
// the same colour in all three places it is rendered, and has to keep it when
// the subject list grows. Both properties are easy to break by "tidying" the
// mapping into a name sort or a hash.
//
// Run: npm run check:color

import {
  buildSubjectTones,
  subjectTone,
  subjectToneSoftVar,
  subjectToneVar,
  SUBJECT_TONE_COUNT,
} from '../src/utils/subjectColor.ts'
import { readFileSync } from 'node:fs'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const SEED = [
  { id: 1, name: 'Mathematics' },
  { id: 2, name: 'Physics' },
  { id: 3, name: 'English' },
  { id: 4, name: 'History' },
  { id: 5, name: 'Computer Science' },
  { id: 6, name: 'Art' },
]

console.log('subject tones')

const tones = buildSubjectTones(SEED)

check('every seeded subject gets a tone', SEED.every((s) => subjectTone(tones, s.name) !== null))

const assigned = SEED.map((s) => subjectTone(tones, s.name))
check(
  'the six seeded subjects are all different colours',
  new Set(assigned).size === SEED.length,
  `got ${assigned.join(',')}`
)

check(
  'tones stay inside --subject-1..6',
  assigned.every((t) => t !== null && t >= 1 && t <= SUBJECT_TONE_COUNT)
)

// Id order, not name order. Under a name sort Art would be first and take
// tone 1; under id order Mathematics does.
check('ordered by id, not by name', subjectTone(tones, 'Mathematics') === 1, `Art=${subjectTone(tones, 'Art')}`)

// The stability property: adding a subject must not repaint the existing ones.
const grown = buildSubjectTones([...SEED, { id: 7, name: 'Biology' }])
check(
  'adding a subject leaves the existing tones alone',
  SEED.every((s) => subjectTone(grown, s.name) === subjectTone(tones, s.name))
)

check('input order does not matter', (() => {
  const shuffled = buildSubjectTones([...SEED].reverse())
  return SEED.every((s) => subjectTone(shuffled, s.name) === subjectTone(tones, s.name))
})())

check('wraps past six rather than running off the ramp', (() => {
  const many = buildSubjectTones(
    Array.from({ length: 13 }, (_, i) => ({ id: i + 1, name: `S${i + 1}` }))
  )
  const all = Array.from({ length: 13 }, (_, i) => subjectTone(many, `S${i + 1}`))
  return all.every((t) => t !== null && t >= 1 && t <= SUBJECT_TONE_COUNT) && all[6] === 1
})())

check(
  'an unknown subject gets no colour instead of a wrong one',
  subjectTone(tones, 'Subject #99') === null &&
    subjectToneVar(null) === undefined &&
    subjectToneSoftVar(null) === undefined
)

check(
  'a duplicate name does not burn a slot',
  (() => {
    const dup = buildSubjectTones([
      { id: 1, name: 'Mathematics' },
      { id: 2, name: 'Mathematics' },
      { id: 3, name: 'Physics' },
    ])
    return subjectTone(dup, 'Physics') === 2
  })()
)

// The var() names have to exist, in both themes, or the dot renders transparent.
const css = readFileSync(new URL('../src/css/style.css', import.meta.url), 'utf8')
const dark = css.slice(css.indexOf('.dark {'))
const light = css.slice(0, css.indexOf('.dark {'))

// The dot needs both steps, and both have to follow the theme. They are not
// redefined under .dark -- they alias the shared ramp, which is, so asserting
// they appear in the dark block would only re-break this the next time the
// ramp is tidied. What matters is that they exist and that they alias it.
const aliasesRamp = (name: string): boolean =>
  new RegExp(`--${name}:\\s*var\\(--cat-\\d-(?:fill|edge)\\)`).test(light)

for (let i = 1; i <= SUBJECT_TONE_COUNT; i += 1) {
  check(
    `--subject-${i} and --subject-${i}-soft follow the shared ramp`,
    aliasesRamp(`subject-${i}`) && aliasesRamp(`subject-${i}-soft`)
  )
  check(
    `both helpers point at tone ${i}`,
    subjectToneVar(i) === `var(--subject-${i})` &&
      subjectToneSoftVar(i) === `var(--subject-${i}-soft)`
  )
}

// The whole point of the ring: the pastel fill is the same step as the teacher
// tones, which the contrast guard already records as failing 3:1 on the card.
check(
  'the pastel fill is a different step from the ring',
  Array.from({ length: SUBJECT_TONE_COUNT }, (_, i) => i + 1).every(
    (i) => subjectToneVar(i) !== subjectToneSoftVar(i)
  )
)

// The ramp now feeds two consumers. A tone class that loses its CSS rule, or a
// --teacher-N-strong that never gets defined, fails silently: the calendar
// block just goes back to a flat fill with an invisible border.
console.log('\ncategorical ramp')
for (let i = 1; i <= SUBJECT_TONE_COUNT; i += 1) {
  check(
    `--cat-${i}-fill / --cat-${i}-edge exist in both themes`,
    light.includes(`--cat-${i}-fill:`) &&
      light.includes(`--cat-${i}-edge:`) &&
      dark.includes(`--cat-${i}-fill:`) &&
      dark.includes(`--cat-${i}-edge:`)
  )
  check(`--teacher-${i} and --teacher-${i}-strong follow it too`, aliasesRamp(`teacher-${i}`) && aliasesRamp(`teacher-${i}-strong`))
  check(`--cat-${i}-tint exists in both themes`, light.includes(`--cat-${i}-tint:`) && dark.includes(`--cat-${i}-tint:`))
  check(`.browse-tone-${i} paints an edge`, /border-color/.test(
    css.slice(css.indexOf(`.browse-tone-${i} {`), css.indexOf(`.browse-tone-${i} {`) + 80)
  ))
}

// Every event kind on the grid draws its own edge. A missing rule here is the
// bug that left the booked and cart blocks flat while the browse blocks had an
// outline -- it shows up only on screen, never in a type or lint error.
for (const cls of ['browse-tone-shared', 'booked-event', 'cart-event']) {
  check(`.${cls} paints an edge`, /border-color/.test(
    css.slice(css.indexOf(`.${cls} {`), css.indexOf(`.${cls} {`) + 80)
  ))
}

// --border-strong reads as the obvious neutral edge and is only 2.22:1 against
// the card. check:contrast owns the ratio; this owns the mistake.
check(
  'no event edge falls back to --border-strong',
  !/\.(?:browse-tone-shared|booked-event|cart-event) \{\s*border-color: var\(--border-strong\)/.test(css)
)

if (failures > 0) {
  console.error(`\n${failures} subject-tone check(s) failed`)
  process.exit(1)
}
console.log('\nall subject-tone checks passed')
