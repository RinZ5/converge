<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { Trash2, X } from '@lucide/vue'
  import FullCalendar from '@fullcalendar/vue3'
  import { Button } from '@/components/ui/button'
  import timeGridPlugin from '@fullcalendar/vue3/timegrid'
  import interactionPlugin from '@fullcalendar/vue3/interaction'
  // v7 ships no styling of its own. The theme plugin is the JS half; its three
  // stylesheets are imported from style.css so they load before the bridge that
  // re-points their variables at the Soft Sage tokens.
  import themePlugin from '@fullcalendar/vue3/themes/classic'
  import { useCalendarResponsive } from '../composables/cart/useCalendarResponsive'
  import { useCalendarEventSync } from '../composables/cart/useCalendarEventSync'
  import { useBusinessHoursHeaders } from '../composables/cart/useBusinessHoursHeaders'
  import { useCalendarInteraction } from '../composables/cart/useCalendarInteraction'
  import type {
    EventInput,
    EventClickInfo,
    BusinessHoursInput,
    CalendarOptions,
    DatesSetInfo,
  } from '@fullcalendar/vue3'

  interface Props {
    editable?: boolean
    businessHours?: BusinessHoursInput
    constraint?: string
    modelValue?: EventInput[]
    additionalEvents?: EventInput[]

    showHeader?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    editable: false,
    businessHours: undefined,
    constraint: undefined,
    modelValue: () => [],
    additionalEvents: () => [],
    showHeader: true,
  })
  const emit = defineEmits<{
    'update:modelValue': [value: EventInput[]]
    'event-click': [info: EventClickInfo]

    'dates-set': [range: { start: Date; end: Date }]
  }>()

  const calendarRef = ref<InstanceType<typeof FullCalendar> | null>(null)

  const { isMobile, dayHeaderFormat, initialView, longPressDelay } =
    useCalendarResponsive(calendarRef)

  const { handleDayHeaderDidMount } = useBusinessHoursHeaders(
    calendarRef,
    () => props.businessHours
  )

  const minutesOfDay = (time: string): number => {
    const [hours, mins] = time.split(':').map(Number)
    return (hours || 0) * 60 + (mins || 0)
  }

  const isWithinConstraint = (start: Date, end: Date): boolean => {
    if (props.constraint !== 'businessHours') return true

    const windows = props.businessHours

    if (!Array.isArray(windows)) return windows === true

    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = end.getHours() * 60 + end.getMinutes()

    return windows.some((window) => {
      const days = window.daysOfWeek
      if (Array.isArray(days) && !days.includes(start.getDay())) return false
      if (!window.startTime || !window.endTime) return false
      return (
        startMinutes >= minutesOfDay(String(window.startTime)) &&
        endMinutes <= minutesOfDay(String(window.endTime))
      )
    })
  }

  const {
    selectedEventId,
    handleContainerClick,
    handleDeleteButtonClick,
    handleDateSelect,
    handleSelectAllow,
    handleEventAllow,
    handleSlotClick,
    handleEventClick,
    handleEventDrop,
    handleEventResize,
    handleEventDidMount,
    handleEventWillUnmount,
  } = useCalendarInteraction({
    calendarRef,
    isMobile,
    isEditable: () => props.editable,
    getModelValue: () => props.modelValue ?? [],
    getAdditionalEvents: () => props.additionalEvents ?? [],
    onUpdate: (events) => emit('update:modelValue', events),
    onEventClick: (info) => emit('event-click', info),
    isSlotAllowed: isWithinConstraint,
  })

  useCalendarEventSync(calendarRef, () => props.modelValue)
  useCalendarEventSync(
    calendarRef,
    () => props.additionalEvents,
    (event) => ({
      ...event,
      editable: false,
    }),
    true
  )

  // 24-hour, matching every other time on screen. The old formatter produced
  // "9-10 AM" here while the rest of the app showed 09:00-10:00.
  const timeFormat = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const formatTimeRange = (start: Date, end: Date): string =>
    `${timeFormat.format(start)}\u2013${timeFormat.format(end)}`

  // A browse block only has room for the time once it is taller than an hour.
  const BROWSE_TIME_MIN_MS = 60 * 60 * 1000

  const showsBrowseTime = (start: Date | null, end: Date | null): boolean =>
    Boolean(start && end && end.getTime() - start.getTime() > BROWSE_TIME_MIN_MS)

  const canRemove = (eventProps?: Record<string, unknown>): boolean =>
    !eventProps?.isCartItem && !eventProps?.isBooked && !eventProps?.isSuggestion

  const CALENDAR_DEFAULT_OPTIONS = {
    height: '100%',
    expandRows: true,
    weekends: true,
    allDaySlot: false,
    selectMirror: true,
    dayMaxEvents: true,
    nowIndicator: true,
    slotMinTime: '08:00',
    slotMaxTime: '19:00',
    slotDuration: '00:30:00',
    snapDuration: '01:00:00',
    dayHeaderDidMount: handleDayHeaderDidMount,
    selectMinDistance: 5,
    eventOverlap: false,
  } as const

  const calendarOptions = computed(() => ({
    plugins: [themePlugin, timeGridPlugin, interactionPlugin],
    ...CALENDAR_DEFAULT_OPTIONS,
    headerToolbar: props.showHeader
      ? ({ left: 'prev', center: 'title', right: 'next' } as const)
      : (false as const),
    initialView: initialView.value,
    editable: props.editable,
    selectable: props.editable,
    eventDurationEditable: props.editable,
    eventResizableFromStart: props.editable,
    displayEventTime: false,
    eventDidMount: handleEventDidMount,
    eventWillUnmount: handleEventWillUnmount,
    businessHours: props.businessHours,
    eventConstraint: props.constraint,
    selectConstraint: props.constraint,
    selectAllow: handleSelectAllow,
    eventAllow: handleEventAllow,
    select: handleDateSelect,
    dateClick: handleSlotClick,
    eventClick: handleEventClick,
    eventDrop: handleEventDrop,
    eventResize: handleEventResize,
    datesSet: (arg: DatesSetInfo) => emit('dates-set', { start: arg.start, end: arg.end }),
    dayHeaderFormat: dayHeaderFormat.value,
    longPressDelay: longPressDelay.value,
    eventLongPressDelay: longPressDelay.value,
    selectLongPressDelay: longPressDelay.value,
  }))

  const setOption = <K extends keyof CalendarOptions>(key: K, value: CalendarOptions[K]) => {
    const api = calendarRef.value?.getApi()
    if (api) {
      api.setOption(key, value)
    }
  }

  defineExpose({ setOption })
</script>

<template>
  <div
    class="calendar-container bg-card border-border h-full overflow-x-hidden overflow-y-auto rounded-2xl border tabular-nums shadow-[var(--shadow-card)] [-webkit-tap-highlight-color:transparent] **:[-webkit-tap-highlight-color:transparent] md:overflow-y-hidden"
    @click="handleContainerClick"
  >
    <FullCalendar ref="calendarRef" :options="calendarOptions">
      <!-- Rendered as a slot rather than an HTML string built in script: Vue
           escapes the teacher name for us (the old path hand-rolled escapeHtml),
           and the classes live here, so Tailwind reaches them and the matching
           :deep() rules are no longer needed. The event-delete-btn class stays
           because useCalendarInteraction finds the button with closest(). -->
      <template #eventContent="arg">
        <div
          v-if="arg.event.extendedProps?.isBrowse"
          class="flex w-full max-w-full flex-col items-stretch justify-start gap-px overflow-hidden"
        >
          <span class="text-2xs truncate leading-tight font-semibold">
            {{ arg.event.extendedProps.browseLabel }}
          </span>
          <span
            v-if="showsBrowseTime(arg.event.start, arg.event.end)"
            class="truncate text-[0.625rem] leading-tight opacity-75"
          >
            {{ formatTimeRange(arg.event.start, arg.event.end) }}
          </span>
        </div>

        <div
          v-else-if="arg.event.extendedProps?.isBooked"
          class="flex h-full max-w-full items-center justify-center"
        >
          <span class="truncate text-xs font-medium">{{ arg.event.title || 'Booked' }}</span>
        </div>

        <div v-else class="group relative h-full max-w-full">
          <span class="block max-w-full truncate">
            {{
              arg.event.start && arg.event.end
                ? formatTimeRange(arg.event.start, arg.event.end)
                : ''
            }}
          </span>

          <button
            v-if="canRemove(arg.event.extendedProps)"
            type="button"
            class="event-delete-btn text-danger hover:bg-card focus-visible:ring-ring absolute top-0.5 right-0.5 flex size-[18px] items-center justify-center rounded-full border-none bg-[color-mix(in_srgb,var(--bg-card)_90%,transparent)] p-0 opacity-0 transition-[opacity,transform] group-hover:opacity-100 hover:scale-110 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none max-[767px]:size-[22px] max-[767px]:opacity-100"
            aria-label="Remove this time slot"
            title="Remove this time slot"
          >
            <X class="size-[11px] max-[767px]:size-[13px]" :stroke-width="2.5" />
          </button>
        </div>
      </template>
    </FullCalendar>
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <Button
        v-if="selectedEventId && isMobile"
        class="bg-danger text-on-accent hover:bg-danger fixed bottom-8 left-1/2 z-30 -translate-x-1/2 rounded-2xl px-6 py-3.5 shadow-lg [-webkit-tap-highlight-color:transparent] active:scale-[0.96]"
        @click="handleDeleteButtonClick($event, selectedEventId)"
      >
        <Trash2 />
        Delete
      </Button>
    </Transition>
  </div>
</template>

<style scoped>
  /* Everything here used to reach into FullCalendar's DOM by class name. v7
     emits hashed names, so only two things are still expressible in CSS, and
     both key off state on an element we do not render. The rest moved into the
     eventContent slot or onto our own event classes in style.css. */

  /* Hover reveal lives on the slot wrapper as group-hover. This rule only
     covers the selected case, whose class we add ourselves. */
  :deep(.event-selected .event-delete-btn) {
    opacity: 1;
  }

  /* Our own selection marker, applied by useCalendarInteraction. It used to
     borrow FullCalendar's .fc-event-selected class, which no longer exists. */
  :deep(.event-selected) {
    box-shadow: 0 0 0 2px var(--accent-sage);
    z-index: 10 !important;
  }
</style>
