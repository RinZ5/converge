export interface CapacityBooking {
  branch_id: number
  start_time: string
  end_time: string
}

export interface CapacitySpan {
  start: number
  end: number
  occupancy: number
}

export const fullCapacitySpans = (
  branchId: number,
  capacity: number,
  bookings: CapacityBooking[]
): CapacitySpan[] => {
  if (capacity < 1) return []

  const changes = new Map<number, number>()
  for (const booking of bookings) {
    if (booking.branch_id !== branchId) continue
    const start = new Date(booking.start_time).getTime()
    const end = new Date(booking.end_time).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    changes.set(start, (changes.get(start) ?? 0) + 1)
    changes.set(end, (changes.get(end) ?? 0) - 1)
  }

  const times = [...changes.keys()].sort((a, b) => a - b)
  const spans: CapacitySpan[] = []
  let occupancy = 0
  for (let i = 0; i < times.length - 1; i++) {
    const start = times[i]
    occupancy += changes.get(start) ?? 0
    const end = times[i + 1]
    if (occupancy >= capacity && end > start) spans.push({ start, end, occupancy })
  }
  return spans
}

export const overlapsFullCapacity = (
  spans: CapacitySpan[],
  startTime: string,
  endTime: string
): boolean => {
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false
  return spans.some((span) => start < span.end && end > span.start)
}

// ---------------------------------------------------------------------------
// Editing a branch's capacity.
//
// The wire format packs two ideas into one integer: -1 means unlimited, any
// positive number is a cap. A form cannot edit that directly — switching to
// "unlimited" would throw away the number the user typed — so the editor keeps
// mode and limit apart and converts at the boundary.
// ---------------------------------------------------------------------------

export const UNLIMITED = -1

export type CapacityMode = 'unlimited' | 'limited'

export interface CapacityDraft {
  mode: CapacityMode
  limit: string
}

export const draftFromCapacity = (capacity: number): CapacityDraft =>
  capacity === UNLIMITED
    ? { mode: 'unlimited', limit: '' }
    : { mode: 'limited', limit: String(capacity) }

// null means "not a capacity the API will accept", which the caller reports
// rather than sending. The backend enforces the same rule (-1 or > 0).
export const capacityFromDraft = (draft: CapacityDraft): number | null => {
  if (draft.mode === 'unlimited') return UNLIMITED
  const trimmed = draft.limit.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < 1) return null
  return value
}

export const describeCapacity = (capacity: number): string =>
  capacity === UNLIMITED ? 'Unlimited' : `Max ${capacity}`

// An invalid draft counts as changed: the Save control has to stay reachable so
// the person can be told what is wrong, instead of silently doing nothing.
export const isCapacityChanged = (capacity: number, draft: CapacityDraft): boolean =>
  capacityFromDraft(draft) !== capacity
