// Single-writer guard for FullCalendar options.
//
// Calendar.vue declares the calendar's options reactively. A composable that
// also calls api.setOption('<same key>', ...) becomes a second writer, and the
// imperative one lands last -- so the declarative value is silently discarded.
//
// That is not hypothetical: useBusinessHoursHeaders pushed the raw prop onto
// `businessHours` while Calendar.vue was deliberately passing an empty list
// while browsing. Three attempts at fixing the declarative side had no effect,
// because none of them was ever the value that reached the calendar. Nothing
// caught it -- both writers type-check, and the result is only visible on
// screen.
//
// Run: npm run check:calendar

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = new URL('../src', import.meta.url).pathname
const CALENDAR = 'components/Calendar.vue'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|ts)$/.test(entry)) out.push(full)
  }
  return out
}

const calendarSource = readFileSync(join(SRC, CALENDAR), 'utf8')

// The keys of the object literal returned by `calendarOptions`.
const optionsBlock = calendarSource.slice(
  calendarSource.indexOf('const calendarOptions = computed'),
  calendarSource.indexOf('const setOption =')
)
const declared = new Set(
  [...optionsBlock.matchAll(/^\s{4}([a-zA-Z]+):/gm)].map((match) => match[1])
)

// CALENDAR_DEFAULT_OPTIONS is spread into the same object, so its keys count too.
const defaultsBlock = calendarSource.slice(
  calendarSource.indexOf('const CALENDAR_DEFAULT_OPTIONS'),
  calendarSource.indexOf('const calendarOptions = computed')
)
for (const match of defaultsBlock.matchAll(/^\s{4}([a-zA-Z]+):/gm)) {
  declared.add(match[1])
}

if (declared.size < 10) {
  console.error(`Only found ${declared.size} declared options — the parser has drifted.`)
  process.exit(1)
}

const failures: string[] = []

for (const file of walk(SRC)) {
  const rel = relative(SRC, file)
  // Calendar.vue owns the declarations, and its exposed setOption() helper takes
  // the key as a variable, so it never names one of these directly.
  if (rel === CALENDAR) continue

  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      // A comment naming the call is not a call. The note left where the
      // businessHours writer used to be would otherwise trip this itself.
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return

      const match = /setOption\(\s*['"]([a-zA-Z]+)['"]/.exec(line)
      if (match && declared.has(match[1])) {
        failures.push(
          `src/${rel}:${index + 1}  setOption('${match[1]}') — Calendar.vue already declares this option`
        )
      }
    })
}

console.log(`checked ${declared.size} declared calendar options`)

if (failures.length > 0) {
  console.error('\nTwo writers for one FullCalendar option:\n')
  for (const failure of failures) console.error(`  ${failure}`)
  console.error('\nSet it in Calendar.vue\'s options, or stop declaring it there.')
  process.exit(1)
}

console.log('no option has a second, imperative writer')
