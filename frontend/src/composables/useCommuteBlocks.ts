import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useBookingStore } from '../stores/bookingStore'
import { useCartStore } from '../stores/cartStore'
import { useCommute } from './useCommute'
import { subtractSpans, type Span } from '../utils/intervals'
import { commuteSpansForBranch, type CommuteEngagement } from '../utils/commuteAvailability'
import type { EventInput } from '@fullcalendar/vue3'

export function useCommuteBlocks() {
  const store = useBookingStore()
  const cartStore = useCartStore()
  const { confirmedBookings, selectedTeacherId, selectedBranchId } = storeToRefs(store)
  const { cartItems } = storeToRefs(cartStore)
  const { commuteMinutes } = useCommute()

  const engagements = computed<CommuteEngagement[]>(() => {
    const teacherId = selectedTeacherId.value
    if (teacherId === null) return []

    const rows: CommuteEngagement[] = []
    const add = (branchId: number, startTime: string, endTime: string) => {
      const start = new Date(startTime).getTime()
      const end = new Date(endTime).getTime()
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
      rows.push({ start, end, branchId })
    }

    for (const booking of confirmedBookings.value) {
      if (booking.teacher_id === teacherId) {
        add(booking.branch_id, booking.start_time, booking.end_time)
      }
    }
    for (const item of cartItems.value) {
      if (item.teacher_id === teacherId) {
        add(item.branch_id, item.start_time, item.end_time)
      }
    }
    return rows
  })

  const commuteSpans = computed<Span[]>(() => {
    const minutes = commuteMinutes.value
    const branchId = selectedBranchId.value
    if (!minutes || branchId === null) return []

    const booked = engagements.value.map((e) => ({ start: e.start, end: e.end }))
    return commuteSpansForBranch(engagements.value, branchId, minutes).flatMap((span) =>
      subtractSpans(span, booked)
    )
  })

  const commuteConstraints = computed<EventInput[]>(() =>
    commuteSpans.value.map((span) => ({
      id: `commute-${span.start}-${span.end}`,
      title: 'Commute',
      start: new Date(span.start).toISOString(),
      end: new Date(span.end).toISOString(),
      editable: false,
      // A background event: it is ambient "you cannot book here" context, never
      // clickable, so it should not take a lane away from the blocks that are.
      // The hatching in .commute-unavailable is what carries the meaning; the
      // theme renders a background event's own fill at 15% opacity underneath.
      //
      // overlapsBlockingEvent keys off extendedProps.isCommute, not off how the
      // event is displayed, so this still blocks selection.
      display: 'background',
      color: 'var(--accent-coral)',
      className: 'commute-unavailable',
      extendedProps: { isCommute: true },
    }))
  )

  return { commuteConstraints, commuteSpans }
}
