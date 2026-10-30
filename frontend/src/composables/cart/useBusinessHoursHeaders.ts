import { watch, type Ref } from 'vue'
import type FullCalendar from '@fullcalendar/vue3'
import type { BusinessHoursInput } from '@fullcalendar/vue3'

type CalendarRef = Ref<InstanceType<typeof FullCalendar> | null>

interface BusinessHourItem {
  daysOfWeek: number[]
  startTime?: string
  endTime?: string
  start?: string
  end?: string
}

function hasAvailabilityForDay(
  dayOfWeek: number,
  businessHours: BusinessHoursInput | undefined
): boolean {
  const businessHoursArray = (
    Array.isArray(businessHours) ? businessHours : []
  ) as BusinessHourItem[]
  return businessHoursArray.some((hour) =>
    Array.isArray(hour.daysOfWeek) ? hour.daysOfWeek.includes(dayOfWeek) : false
  )
}

export function useBusinessHoursHeaders(
  calendarRef: CalendarRef,
  getBusinessHours: () => BusinessHoursInput | undefined
) {
  const handleDayHeaderDidMount = (info: { el: HTMLElement }) => {
    const businessHours = getBusinessHours()
    if (!businessHours) return

    const headerDate = new Date(info.el.getAttribute('data-date') || '')
    if (hasAvailabilityForDay(headerDate.getDay(), businessHours)) {
      info.el.classList.add('has-availability')
    }
  }

  // No setOption('businessHours') here. This watcher used to push the prop
  // straight onto the calendar API, which silently won over the businessHours
  // value declared in Calendar.vue's options -- two writers for one option, and
  // the imperative one always landed last. Gating the painting on `editable`
  // therefore did nothing while this line existed. The option is declarative
  // now; this watcher only keeps the header class in sync.
  watch(getBusinessHours, (newBusinessHours) => {
    const api = calendarRef.value?.getApi()
    if (!api) return

    const headerEls = api.el.querySelectorAll('.fc-col-header-cell') as NodeListOf<HTMLElement>
    headerEls.forEach((headerEl) => {
      const dateStr = headerEl.getAttribute('data-date')
      if (!dateStr) return
      const dayOfWeek = new Date(dateStr).getDay()
      headerEl.classList.toggle(
        'has-availability',
        hasAvailabilityForDay(dayOfWeek, newBusinessHours)
      )
    })
  })

  return { handleDayHeaderDidMount }
}
