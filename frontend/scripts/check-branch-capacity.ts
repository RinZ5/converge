import assert from 'node:assert/strict'
import {
  capacityFromDraft,
  describeCapacity,
  draftFromCapacity,
  fullCapacitySpans,
  isCapacityChanged,
  overlapsFullCapacity,
} from '../src/utils/branchCapacity.ts'

const bookings = [
  { branch_id: 1, start_time: '2026-06-01T09:00:00Z', end_time: '2026-06-01T11:00:00Z' },
  { branch_id: 1, start_time: '2026-06-01T10:00:00Z', end_time: '2026-06-01T12:00:00Z' },
  { branch_id: 2, start_time: '2026-06-01T10:00:00Z', end_time: '2026-06-01T12:00:00Z' },
]

assert.deepEqual(fullCapacitySpans(1, -1, bookings), [])

const full = fullCapacitySpans(1, 2, bookings)
assert.deepEqual(full, [
  {
    start: Date.parse('2026-06-01T10:00:00Z'),
    end: Date.parse('2026-06-01T11:00:00Z'),
    occupancy: 2,
  },
])
assert.equal(overlapsFullCapacity(full, '2026-06-01T10:30:00Z', '2026-06-01T11:30:00Z'), true)
assert.equal(overlapsFullCapacity(full, '2026-06-01T11:00:00Z', '2026-06-01T12:00:00Z'), false)

console.log('branch capacity checks passed')

// --- capacity editing: -1 and "unlimited" are the same thing on the wire ----
{
  assert.deepEqual(draftFromCapacity(-1), { mode: 'unlimited', limit: '' })
  assert.deepEqual(draftFromCapacity(30), { mode: 'limited', limit: '30' })

  assert.equal(capacityFromDraft({ mode: 'unlimited', limit: '' }), -1)
  // Switching to unlimited must not be blocked by whatever is left in the box.
  assert.equal(capacityFromDraft({ mode: 'unlimited', limit: 'nonsense' }), -1)
  assert.equal(capacityFromDraft({ mode: 'limited', limit: ' 30 ' }), 30)

  for (const bad of ['', '0', '-5', '2.5', 'abc']) {
    assert.equal(
      capacityFromDraft({ mode: 'limited', limit: bad }),
      null,
      `limit ${JSON.stringify(bad)} must be rejected, not sent`
    )
  }

  assert.equal(describeCapacity(-1), 'Unlimited')
  assert.equal(describeCapacity(30), 'Max 30')

  assert.equal(isCapacityChanged(-1, { mode: 'unlimited', limit: '' }), false)
  assert.equal(isCapacityChanged(30, { mode: 'limited', limit: '30' }), false)
  assert.equal(isCapacityChanged(30, { mode: 'unlimited', limit: '' }), true)
  assert.equal(isCapacityChanged(-1, { mode: 'limited', limit: '10' }), true)
  // Invalid stays "changed" so Save can report the problem.
  assert.equal(isCapacityChanged(30, { mode: 'limited', limit: '' }), true)
}

console.log('branch capacity editing checks passed')
