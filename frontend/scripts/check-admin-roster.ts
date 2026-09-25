// Admin roster grouping guard.
//
// The dashboard answers "which students does this teacher teach" by grouping
// bookings per counterpart. The failure that matters is a student appearing once
// per session instead of once per person, which is what the page showed before.
//
// Run: npm run check:roster

import assert from 'node:assert/strict'
import {
  buildEntry,
  groupByCounterpart,
  matchesSearch,
  nextSessionOf,
  subjectsFromBookings,
} from '../src/utils/roster.ts'
import type { Booking } from '../src/types/booking.ts'
import type { RosterMode } from '../src/utils/roster.ts'

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: 1,
    teacher_id: 10,
    teacher_name: 'Alice',
    branch_id: 1,
    branch_name: 'Siam',
    subject_id: 5,
    subject_name: 'Math',
    start_time: '2026-10-05T09:00:00Z',
    end_time: '2026-10-05T10:00:00Z',
    student_id: 100,
    student_name: 'Bob',
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  }) as Booking

const NOW = new Date('2026-10-01T00:00:00Z').getTime()

// --- happy path: repeat sessions collapse into one person ------------------
{
  const people = groupByCounterpart(
    [
      booking({ id: 1, start_time: '2026-10-07T09:00:00Z', end_time: '2026-10-07T10:00:00Z' }),
      booking({ id: 2, start_time: '2026-10-05T09:00:00Z', end_time: '2026-10-05T10:00:00Z' }),
      booking({ id: 3, student_id: 200, student_name: 'Carol', subject_name: 'Physics' }),
    ],
    'teachers'
  )

  assert.equal(people.length, 2, 'two distinct students, not three sessions')
  const bob = people.find((p) => p.name === 'Bob')!
  assert.equal(bob.sessions.length, 2, 'Bob keeps both sessions')
  assert.deepEqual(
    bob.sessions.map((s) => s.id),
    [2, 1],
    'sessions sorted chronologically, not insertion order'
  )
  assert.deepEqual(bob.subjects, ['Math'], 'repeated subject is not duplicated')
  assert.deepEqual(
    people.map((p) => p.name),
    ['Bob', 'Carol'],
    'people sorted by name'
  )
}

// --- mirror: students mode groups by teacher, subjects come from bookings --
{
  const rows = [
    booking({ id: 1, teacher_id: 10, teacher_name: 'Alice', subject_name: 'Math' }),
    booking({ id: 2, teacher_id: 11, teacher_name: 'Zoe', subject_name: 'Physics' }),
  ]
  const people = groupByCounterpart(rows, 'students' satisfies RosterMode)

  assert.deepEqual(
    people.map((p) => p.name),
    ['Alice', 'Zoe'],
    'students mode groups by teacher'
  )
  assert.deepEqual(
    subjectsFromBookings(rows),
    ['Math', 'Physics'],
    'a student’s subjects are derived from their bookings'
  )
}

// --- edge: missing names fall back instead of rendering blank --------------
{
  const [person] = groupByCounterpart(
    [booking({ student_name: undefined, subject_name: undefined, branch_name: undefined })],
    'teachers'
  )
  assert.equal(person.name, 'Student #100')
  assert.deepEqual(person.subjects, ['Subject #5'])
  assert.deepEqual(person.branches, ['Branch #1'])
}

// --- edge: nextSession ignores past and unparseable dates -----------------
{
  const people = groupByCounterpart(
    [
      booking({ id: 1, start_time: '2026-09-01T09:00:00Z', end_time: '2026-09-01T10:00:00Z' }),
      booking({ id: 2, start_time: 'not-a-date', end_time: 'not-a-date' }),
      booking({ id: 3, start_time: '2026-10-09T09:00:00Z', end_time: '2026-10-09T10:00:00Z' }),
      booking({ id: 4, start_time: '2026-10-03T09:00:00Z', end_time: '2026-10-03T10:00:00Z' }),
    ],
    'teachers'
  )
  const next = nextSessionOf(people, NOW)
  assert.equal(next?.id, 4, 'earliest future session wins; past and invalid skipped')

  assert.equal(nextSessionOf([], NOW), null, 'no people means no next session')
  const onlyPast = groupByCounterpart(
    [booking({ start_time: '2026-09-01T09:00:00Z', end_time: '2026-09-01T10:00:00Z' })],
    'teachers'
  )
  assert.equal(nextSessionOf(onlyPast, NOW), null, 'all-past means no next session')
}

// --- edge: a teacher with no bookings is still an entry --------------------
{
  const entry = buildEntry(10, 'Alice', ['Math'], [], 'teachers', NOW)
  assert.equal(entry.classCount, 0)
  assert.deepEqual(entry.people, [])
  assert.equal(entry.nextSession, null)
  assert.deepEqual(entry.subjects, ['Math'], 'assigned subjects survive with zero bookings')
}

// --- search reaches the counterpart, which is the reverse lookup -----------
{
  const entry = buildEntry(10, 'Alice', ['Math'], [booking({})], 'teachers', NOW)
  assert.equal(matchesSearch(entry, ''), true, 'empty term matches everything')
  assert.equal(matchesSearch(entry, 'ali'), true, 'matches entry name')
  assert.equal(matchesSearch(entry, 'MATH'), true, 'match is case-insensitive')
  assert.equal(matchesSearch(entry, 'bob'), true, 'matches a student of this teacher')
  assert.equal(matchesSearch(entry, 'zzz'), false)
}

console.log('✓ admin roster grouping behaves')
