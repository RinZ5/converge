// Design-token guard.
//
// The palette is defined once in src/css/style.css and exposed as tokens. A raw
// hex value or an off-palette rgba() anywhere else silently forks the palette:
// that is how the app ended up carrying Tailwind's default greys and a stray
// indigo (#3e4c7a) alongside Soft Sage, so changing a colour in one place
// stopped changing it everywhere.
//
// Run: npm run check:tokens

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = new URL('../src', import.meta.url).pathname
// The palette itself is allowed to hold literal colours - it is the source.
const PALETTE_FILE = 'css/style.css'
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g
// Palette-derived alphas. These encode a colour that IS in the palette, so they
// are tolerated; anything else in rgba() is a fork.
const ALLOWED_RGBA = [
  /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/, // black shadows
  /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/, // white overlays
  /rgba\(\s*157\s*,\s*180\s*,\s*160\s*,/, // --accent-sage
  /rgba\(\s*168\s*,\s*201\s*,\s*184\s*,/, // --accent-mint
  /rgba\(\s*232\s*,\s*165\s*,\s*152\s*,/, // --accent-coral
  /rgba\(\s*245\s*,\s*199\s*,\s*191\s*,/, // --accent-coral-light
  /rgba\(\s*244\s*,\s*185\s*,\s*66\s*,/, // --accent-gold
  /rgba\(\s*45\s*,\s*74\s*,\s*62\s*,/, // --primary-navy
]
const RGBA = /rgba\([^)]*\)/g

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|ts|css)$/.test(entry)) out.push(full)
  }
  return out
}

const failures: string[] = []

for (const file of walk(SRC)) {
  const rel = relative(SRC, file)
  if (rel === PALETTE_FILE) continue

  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    const at = `src/${rel}:${index + 1}`

    for (const hex of line.match(HEX) ?? []) {
      failures.push(`${at}  raw hex ${hex} — use a token from style.css`)
    }
    for (const rgba of line.match(RGBA) ?? []) {
      if (ALLOWED_RGBA.some((allowed) => allowed.test(rgba))) continue
      failures.push(`${at}  off-palette ${rgba} — use color-mix(in srgb, var(--token) N%, transparent)`)
    }
  })
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} hardcoded colour(s) outside the palette:\n`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log('✓ no hardcoded colours outside src/css/style.css')
