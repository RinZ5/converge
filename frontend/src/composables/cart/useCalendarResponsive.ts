import { computed, watch, type Ref } from 'vue'
import type FullCalendar from '@fullcalendar/vue3'
import { useScreenSize } from '../useScreenSize'

type CalendarRef = Ref<InstanceType<typeof FullCalendar> | null>

export function useCalendarResponsive(calendarRef: CalendarRef) {
  const { screenWidth, isMobile, isDesktop } = useScreenSize()

  const dayHeaderFormat = computed(() => {
    if (isMobile.value) {
      return { weekday: 'long' as const, day: 'numeric' as const }
    }
    if (!isDesktop.value) {
      return { weekday: 'short' as const, day: 'numeric' as const }
    }
    return { weekday: 'long' as const, day: 'numeric' as const }
  })

  const initialView = computed(() => (isMobile.value ? 'timeGridDay' : 'timeGridWeek'))

  const longPressDelay = computed(() => (isMobile.value ? 400 : 50))

  // dayHeaderFormat and the three long-press delays are declared in
  // Calendar.vue's options off these same computeds, so setting them again here
  // only re-applied the value they already had -- and left the option with two
  // writers, which is what made the businessHours bug so hard to see.
  //
  // changeView stays: initialView is read once at mount, so switching between
  // the day and week views really does need the imperative call.
  watch(screenWidth, () => {
    const api = calendarRef.value?.getApi()
    if (!api) return
    if (api.view.type !== initialView.value) {
      api.changeView(initialView.value)
    }
  })

  return { isMobile, dayHeaderFormat, initialView, longPressDelay }
}
