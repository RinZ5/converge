<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { ChevronLeft, ChevronRight, Trash2, X } from '@lucide/vue'
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
    /** What the empty grid looks like underneath the events.
     *
     *  - `none`   nothing is shaded; every hour is the card surface.
     *  - `hours`  the hours `businessHours` does NOT cover are shaded. What an
     *             unshaded hour means depends on whose hours were passed in:
     *             one teacher's, and it reads per-teacher; the union of
     *             several, and it only says somebody is free.
     *  - `full`   the whole grid is shaded, so nothing but the events reads as
     *             available. For the union case, where the shading can be
     *             trusted (nobody is free) but the gaps cannot (somebody is,
     *             and the blocks already say who). */
    backdrop?: 'none' | 'hours' | 'full'
    additionalEvents?: EventInput[]

    showHeader?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    editable: false,
    businessHours: undefined,
    constraint: undefined,
    modelValue: () => [],
    backdrop: 'none',
    additionalEvents: () => [],
    showHeader: true,
  })
  const emit = defineEmits<{
    'update:modelValue': [value: EventInput[]]
    'event-click': [info: EventClickInfo]

    'dates-set': [range: { start: Date; end: Date }]
  }>()

  // Held in a const so its identity is stable for the life of the component: a
  // fresh [] on every recompute would make the options object differ on every
  // render, which is exactly the churn the computed exists to avoid.
  const NO_BUSINESS_HOURS: BusinessHoursInput = []

  // One minute at midnight, every day: nothing inside the 08:00-19:00 window
  // this calendar shows.
  //
  // FullCalendar paints the *inverse* of the business ranges, and it derives
  // that inverse by walking the parsed business-hours instances -- so an empty
  // set yields no instances, nothing to invert, and nothing painted. "Shade
  // everything" therefore cannot be said as "there are no business hours"; it
  // has to be said as "the business hours are somewhere you cannot see".
  const BUSINESS_HOURS_OFFSCREEN: BusinessHoursInput = [
    { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '00:01' },
  ]

  const calendarRef = ref<InstanceType<typeof FullCalendar> | null>(null)

  const { isMobile, dayHeaderFormat, initialView, longPressDelay } =
    useCalendarResponsive(calendarRef)

  // The toolbar is ours, not FullCalendar's. The classic theme renders the
  // title at 24px/700 -- page-heading size for the label on a prev/next
  // control -- and its buttons are solid filled blocks styled through twelve
  // hashed class names, so buttonClass can only be replaced wholesale, never
  // adjusted. Driving the calendar through its API instead gives the same
  // Button component the rest of the app uses.
  const viewTitle = ref('')

  const goPrev = () => calendarRef.value?.getApi().prev()
  const goNext = () => calendarRef.value?.getApi().next()

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
    // Two options one letter apart, and they do unrelated things. eventOverlap
    // is a drag/drop rule: whether a slot may be dropped on top of another.
    // slotEventOverlap is a layout rule: v7 defaults it to true, which stacks
    // overlapping blocks with an offset so the later one covers the earlier
    // one's right edge. Two teachers free over the same hours are exactly the
    // case this view exists to show, so the blocks share the column width
    // instead and none of them is hidden.
    eventOverlap: false,
    slotEventOverlap: false,
    // Our class, not the theme's, for the hours nobody is free. See
    // .calendar-off-hours in style.css for why it is not just a heavier
    // --fc-classic-faint.
    nonBusinessHoursClass: 'calendar-off-hours',
  } as const

  const calendarOptions = computed(() => ({
    plugins: [themePlugin, timeGridPlugin, interactionPlugin],
    ...CALENDAR_DEFAULT_OPTIONS,
    headerToolbar: false as const,
    initialView: initialView.value,
    editable: props.editable,
    selectable: props.editable,
    eventDurationEditable: props.editable,
    eventResizableFromStart: props.editable,
    displayEventTime: false,
    eventDidMount: handleEventDidMount,
    eventWillUnmount: handleEventWillUnmount,
    // What gets shaded is the caller's call, not something inferred here. It
    // was tied to `editable`, which is right for the booking calendar and wrong
    // for the guest page: there the band is the only thing showing availability
    // at all, so keying off `editable` blanked the page.
    //
    // The businessHours prop is still read regardless of the backdrop:
    // useBusinessHoursHeaders and isWithinConstraint use it directly, whatever
    // ends up painted.
    //
    // An empty array, not `undefined` and not `false`. undefined reads as
    // "option not given" and the calendar keeps whatever was set last, which
    // left the previous teacher's band painted after going back to All
    // teachers. `false` is a different shape from the value this option
    // normally carries; an empty array is the same shape and paints nothing.
    businessHours:
      props.backdrop === 'full'
        ? BUSINESS_HOURS_OFFSCREEN
        : props.backdrop === 'hours'
          ? (props.businessHours ?? NO_BUSINESS_HOURS)
          : NO_BUSINESS_HOURS,
    eventConstraint: props.constraint,
    selectConstraint: props.constraint,
    selectAllow: handleSelectAllow,
    eventAllow: handleEventAllow,
    select: handleDateSelect,
    dateClick: handleSlotClick,
    eventClick: handleEventClick,
    eventDrop: handleEventDrop,
    eventResize: handleEventResize,
    datesSet: (arg: DatesSetInfo) => {
      viewTitle.value = arg.view.title
      emit('dates-set', { start: arg.start, end: arg.end })
    },
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
    class="calendar-container bg-card border-border flex h-full flex-col overflow-x-hidden overflow-y-auto rounded-2xl border tabular-nums shadow-[var(--shadow-card)] [-webkit-tap-highlight-color:transparent] **:[-webkit-tap-highlight-color:transparent] md:overflow-y-hidden"
    @click="handleContainerClick"
  >
    <div
      v-if="showHeader"
      class="border-border flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2"
    >
      <Button variant="outline" size="icon-sm" aria-label="Previous" @click="goPrev">
        <ChevronLeft />
      </Button>
      <span class="text-sm font-medium">{{ viewTitle }}</span>
      <Button variant="outline" size="icon-sm" aria-label="Next" @click="goNext">
        <ChevronRight />
      </Button>
    </div>

    <!-- min-h-0 so this can actually shrink inside the flex column; the
         calendar asks for height 100% of it. -->
    <div class="min-h-0 flex-1">
      <FullCalendar ref="calendarRef" :options="calendarOptions">
        <!-- Rendered as a slot rather than an HTML string built in script: Vue
           escapes the teacher name for us (the old path hand-rolled escapeHtml),
           and the classes live here, so Tailwind reaches them and the matching
           :deep() rules are no longer needed. The event-delete-btn class stays
           because useCalendarInteraction finds the button with closest(). -->
        <template #eventContent="arg">
          <!-- Centred, like the booked blocks. Pinned to the top-left the label
             floated in the corner of a tall block with nothing to balance it,
             which read as a rendering slip rather than a choice. -->
          <div
            v-if="arg.event.extendedProps?.isBrowse"
            class="flex h-full w-full max-w-full flex-col items-center justify-center gap-px overflow-hidden text-center"
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

          <!-- Centred and sized like the booked blocks. The span carried no
               size class at all, so it inherited the theme root's 16px -- the
               one label on the grid rendered at body-copy size, against 12px
               on Booked and 11px on the browse blocks. The select mirror is
               rendered through the same event pipeline (it is the same render
               props with isMirror set), so the block drawn under the cursor
               while dragging should pick this up too. -->
          <div v-else class="group relative flex h-full max-w-full items-center justify-center">
            <span class="max-w-full truncate text-xs font-medium">
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
    </div>
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
