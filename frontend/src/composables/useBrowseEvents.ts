import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useBookingStore } from '../stores/bookingStore'
import { useCartStore } from '../stores/cartStore'
import { subtractSpans, type Span } from '../utils/intervals'
import type { EventInput } from '@fullcalendar/vue3'

export interface BrowseTeacher {
  id: number
  name: string
}

export interface BrowseGroup {
  start: Date
  end: Date
  teachers: BrowseTeacher[]
}

export interface VisibleRange {
  start: Date
  end: Date
}

const MIN_REMAINDER_MS = 30 * 60 * 1000

// Every teacher's free time used to be the same colour, so telling two of them
// apart meant reading the label. Keyed off the id rather than the position in
// the list, so a teacher keeps their colour as the list is filtered.
const TEACHER_TONES = 6

const toneIndexFor = (teacherId: number): number => (Math.abs(teacherId) % TEACHER_TONES) + 1

// The tint, not the full tone: the block is a pastel wash and the tone class
// supplies the edge. Painting --teacher-N here gave a solid chip.
const toneFor = (teacherId: number): string => `var(--teacher-${toneIndexFor(teacherId)}-tint)`

const normalizeTime = (value: string): string => {
  const [hours = '', minutes = '00'] = value.split(':')
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
}

const atTimeOnDate = (date: Date, time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number)
  const result = new Date(date)
  result.setHours(hours, minutes, 0, 0)
  return result
}

export function useBrowseEvents(getRange: () => VisibleRange | null) {
  const store = useBookingStore()
  const cartStore = useCartStore()
  const { availabilityCache, genderFilteredTeachers, confirmedBookings } = storeToRefs(store)
  const { cartItems } = storeToRefs(cartStore)

  const busyByTeacher = computed<Map<number, Span[]>>(() => {
    const map = new Map<number, Span[]>()

    const add = (teacherId: number, startTime: string, endTime: string) => {
      const start = new Date(startTime).getTime()
      const end = new Date(endTime).getTime()
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
      const list = map.get(teacherId)
      if (list) list.push({ start, end })
      else map.set(teacherId, [{ start, end }])
    }

    for (const booking of confirmedBookings.value) {
      add(booking.teacher_id, booking.start_time, booking.end_time)
    }
    for (const item of cartItems.value) {
      add(item.teacher_id, item.start_time, item.end_time)
    }

    return map
  })

  const browseGroups = computed<BrowseGroup[]>(() => {
    const range = getRange()
    if (!range) return []

    const groups = new Map<string, BrowseGroup>()

    for (const teacher of genderFilteredTeachers.value) {
      const slots = availabilityCache.value.get(teacher.id)
      if (!slots) continue

      const busy = busyByTeacher.value.get(teacher.id) ?? []

      for (const slot of slots) {
        const startTime = normalizeTime(slot.start)
        const endTime = normalizeTime(slot.end)

        const cursor = new Date(range.start)
        cursor.setHours(0, 0, 0, 0)

        while (cursor < range.end) {
          if (cursor.getDay() === slot.day_of_week) {
            const occurrenceStart = atTimeOnDate(cursor, startTime)
            const occurrenceEnd = atTimeOnDate(cursor, endTime)

            if (occurrenceEnd > occurrenceStart) {
              const free = subtractSpans(
                { start: occurrenceStart.getTime(), end: occurrenceEnd.getTime() },
                busy
              ).filter((piece) => piece.end - piece.start >= MIN_REMAINDER_MS)

              for (const piece of free) {
                const key = `${piece.start}-${piece.end}`
                let group = groups.get(key)
                if (!group) {
                  group = {
                    start: new Date(piece.start),
                    end: new Date(piece.end),
                    teachers: [],
                  }
                  groups.set(key, group)
                }
                if (!group.teachers.some((t) => t.id === teacher.id)) {
                  group.teachers.push({ id: teacher.id, name: teacher.name })
                }
              }
            }
          }
          cursor.setDate(cursor.getDate() + 1)
        }
      }
    }

    return [...groups.values()]
  })

  const browseEvents = computed<EventInput[]>(() =>
    browseGroups.value.map((group) => {
      const label =
        group.teachers.length === 1 ? group.teachers[0].name : `${group.teachers.length} teachers`

      const solo = group.teachers.length === 1 ? group.teachers[0] : null

      return {
        id: `browse-${group.start.getTime()}-${group.end.getTime()}`,
        title: label,
        start: group.start.toISOString(),
        end: group.end.toISOString(),
        editable: false,
        // A block shared by several teachers gets a neutral: no one tone can
        // stand for all of them, and the label already says how many.
        color: solo ? toneFor(solo.id) : 'var(--bg-subtle)',
        contrastColor: 'var(--text-primary)',
        // The tone class carries the block's edge. `color` above can only set
        // one value, and the theme paints the fill and the border from it, so
        // the darker edge has to come from a class. v7 takes a string here,
        // not an array.
        className: `browse-event browse-tone-${solo ? toneIndexFor(solo.id) : 'shared'}`,
        extendedProps: {
          isBrowse: true,
          browseLabel: label,
          teachers: group.teachers,
        },
      }
    })
  )

  return { browseGroups, browseEvents }
}
