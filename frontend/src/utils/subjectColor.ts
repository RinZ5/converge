// Subject -> categorical tone for the roster's subject dots.
//
// The tone is keyed off the subject's position in the canonical list from
// GET /subjects, ordered by id. Id order, not name order, is what keeps the
// mapping stable: sorting by name would recolour half the subjects the moment
// someone adds "Biology", because every later name shifts a slot.
//
// Bookings only ever carry a subject *name*, never its id (see RosterSession),
// so the lookup has to be by name.

export const SUBJECT_TONE_COUNT = 6

export type SubjectToneMap = ReadonlyMap<string, number>

// Returns 1-based tone numbers matching --subject-1 .. --subject-6 in style.css.
export function buildSubjectTones(subjects: { id: number; name: string }[]): SubjectToneMap {
  const tones = new Map<string, number>()
  const ordered = [...subjects].sort((a, b) => a.id - b.id)

  let slot = 0
  for (const subject of ordered) {
    // A duplicate name would otherwise burn a slot and shift everything after
    // it; the first one wins and the tone stays put.
    if (tones.has(subject.name)) continue
    tones.set(subject.name, (slot % SUBJECT_TONE_COUNT) + 1)
    slot += 1
  }

  return tones
}

// null for a name that is not in the canonical list -- a booking can carry the
// "Subject #12" fallback for a subject that no longer exists, and inventing a
// colour for it would claim a grouping that is not real.
export function subjectTone(tones: SubjectToneMap, name: string): number | null {
  return tones.get(name) ?? null
}

// The dot is drawn as a pastel fill inside a ring of the deeper step of the
// same hue. The pastel alone is ~1.5:1 against the card, so the ring is what
// actually makes the dot visible; they are always used together.
export function subjectToneVar(tone: number | null): string | undefined {
  return tone === null ? undefined : `var(--subject-${tone})`
}

export function subjectToneSoftVar(tone: number | null): string | undefined {
  return tone === null ? undefined : `var(--subject-${tone}-soft)`
}
