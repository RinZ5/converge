<script setup lang="ts">
  import { ref, computed, watch, onMounted } from 'vue'
  import { CalendarOff, Eye, Loader2, UserX, X } from '@lucide/vue'
  import { useBooking } from '../../composables/useBooking'
  import { useBookingContext } from '../../composables/useBookingContext'
  import { useGenderFilterWarning } from '../../composables/useGenderFilterWarning'
  import {
    useBrowseEvents,
    type BrowseTeacher,
    type VisibleRange,
  } from '../../composables/useBrowseEvents'
  import { useCart } from '../../composables/useCart'
  import { useCommute } from '../../composables/useCommute'
  import { useCommuteBlocks } from '../../composables/useCommuteBlocks'
  import { useBranchCapacity } from '../../composables/useBranchCapacity'
  import { useNotification } from '../../composables/useNotification'
  import { useNumberSelect, useEnumSelect, NONE } from '../../composables/useSelectProxy'
  import { genderLabel } from '../../utils/gender'
  import Calendar from '../Calendar.vue'
  import CalendarDisabledOverlay from '../CalendarDisabledOverlay.vue'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
  import { Label } from '@/components/ui/label'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import type { EventClickInfo } from '@fullcalendar/vue3'

  const {
    events,
    businessHours,
    isAvailabilityLoaded,
    allEvents,
    genderFilteredTeachers,
    isLoadingTeachers,
    selectedSubjectId,
    selectedBranchId,
    selectedTeacherId,
    requiredGender,
  } = useBooking()

  const { contextBlocker, contextComplete } = useBookingContext()
  const { isEmptyFromGenderFilter } = useGenderFilterWarning({ notify: false })

  const visibleRange = ref<VisibleRange | null>(null)
  const { browseEvents } = useBrowseEvents(() => visibleRange.value)
  const { addSlotToCart } = useCart()
  const { loadCommuteMinutes } = useCommute()
  const { commuteConstraints } = useCommuteBlocks()
  const { capacityEvents, hasCapacityWarnings } = useBranchCapacity()
  const { showSuccess } = useNotification()

  const teacherValue = useNumberSelect(selectedTeacherId)
  const genderValue = useEnumSelect(requiredGender)

  const isAddingToCart = ref(false)
  const pendingTeachers = ref<BrowseTeacher[] | null>(null)

  const calendarState = computed<'locked' | 'browse' | 'editable'>(() => {
    if (!contextComplete.value) return 'locked'
    return selectedTeacherId.value === null ? 'browse' : 'editable'
  })

  const selectedTeacher = computed(
    () => genderFilteredTeachers.value.find((t) => t.id === selectedTeacherId.value) ?? null
  )

  // Browse mode with nothing to browse. The grid renders empty and, because
  // the business-hours band is not painted while browsing, entirely white --
  // which is the same picture as "every hour is free". The banner above it made
  // that worse by stating it was showing when every matching teacher is free,
  // of a set with no members in it.
  const hasNoMatchingTeachers = computed(
    () =>
      calendarState.value === 'browse' &&
      !isLoadingTeachers.value &&
      genderFilteredTeachers.value.length === 0
  )

  const noTeacherMessage = computed(() => {
    const gender = requiredGender.value
    if (!isEmptyFromGenderFilter.value || !gender) return 'No teacher teaches this subject yet'
    return `No ${genderLabel(gender)} teacher teaches this subject`
  })

  const noTeacherHint = computed(() =>
    isEmptyFromGenderFilter.value
      ? 'Try a different gender preference.'
      : 'Pick a different subject above.'
  )

  const hasAvailability = computed(
    () => Array.isArray(businessHours.value) && businessHours.value.length > 0
  )

  const showsNoAvailability = computed(
    () => calendarState.value === 'editable' && isAvailabilityLoaded.value && !hasAvailability.value
  )

  const isAwaitingAvailability = computed(
    () => calendarState.value === 'editable' && !isAvailabilityLoaded.value
  )

  const canAddToBooking = computed(
    () => calendarState.value === 'editable' && events.value.length > 0 && !isAddingToCart.value
  )

  // Booked blocks come off the grid while browsing. useBrowseEvents already
  // subtracts booked time from each teacher's availability, so the slot is
  // absent from the free blocks either way -- and with slotEventOverlap off, a
  // nameless "Booked" card takes a lane away from the blocks that can actually
  // be clicked. Once a teacher is picked it is their own schedule, nothing
  // competes for the width, and it explains why a slot cannot be selected.
  const calendarEvents = computed(() =>
    calendarState.value === 'browse'
      ? allEvents.value.filter((event) => !event.extendedProps?.isBooked)
      : allEvents.value
  )

  const additionalEvents = computed(() => [
    ...(calendarState.value === 'browse' ? browseEvents.value : []),
    ...(calendarState.value === 'editable' ? commuteConstraints.value : []),
    ...capacityEvents.value,
  ])

  watch(calendarState, (state) => {
    if (state !== 'browse') pendingTeachers.value = null
  })

  const pickTeacher = (teacher: BrowseTeacher) => {
    selectedTeacherId.value = teacher.id
    pendingTeachers.value = null
    showSuccess(`Now booking with ${teacher.name} — drag the calendar to select times`, 4000)
  }

  const handleEventClick = (info: EventClickInfo) => {
    const props = info.event.extendedProps
    if (!props?.isBrowse) return

    const teachers = props.teachers as BrowseTeacher[]
    if (teachers.length === 1) {
      pickTeacher(teachers[0])
      return
    }
    pendingTeachers.value = teachers
  }

  onMounted(loadCommuteMinutes)

  const addToBooking = () => {
    const teacher = selectedTeacher.value
    if (!teacher || !canAddToBooking.value) return

    isAddingToCart.value = true
    try {
      const slots = [...events.value]
      slots.forEach((slot) => {
        addSlotToCart(
          teacher.id,
          teacher.name,
          slot.start as string,
          slot.end as string,
          selectedSubjectId.value ?? undefined,
          selectedBranchId.value ?? undefined
        )
      })
      events.value = []
      showSuccess(`Added ${slots.length} slot${slots.length === 1 ? '' : 's'} to the cart`, 3000)
    } finally {
      isAddingToCart.value = false
    }
  }
</script>

<template>
  <Card>
    <CardContent class="flex flex-col gap-4 py-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-2">
          <Label for="v3-gender">
            Gender preference
            <span class="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Select v-model="genderValue">
            <!-- aria-invalid, not a red class: SelectTrigger already styles the
                 invalid state, and this way the control is announced as invalid
                 rather than only looking it. -->
            <SelectTrigger id="v3-gender" class="w-full" :aria-invalid="isEmptyFromGenderFilter">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NONE">Any</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="lgbtq+">LGBTQ+</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex flex-col gap-2">
          <Label for="v3-teacher">Teacher</Label>
          <Select v-model="teacherValue" :disabled="isLoadingTeachers || !contextComplete">
            <SelectTrigger id="v3-teacher" class="w-full">
              <SelectValue
                :placeholder="isLoadingTeachers ? 'Loading teachers…' : 'All teachers'"
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NONE">All teachers</SelectItem>
              <SelectItem
                v-for="teacher in genderFilteredTeachers"
                :key="teacher.id"
                :value="String(teacher.id)"
              >
                {{ teacher.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div
        v-if="calendarState === 'locked'"
        class="border-border flex min-h-[20rem] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed"
      >
        <CalendarOff class="text-muted-foreground size-7" />
        <p class="text-sm font-medium">{{ contextBlocker }}</p>
        <p class="text-muted-foreground text-xs">
          Availability appears once the details above are set.
        </p>
      </div>

      <div v-else class="flex flex-col gap-3">
        <div
          v-if="calendarState === 'browse' && !hasNoMatchingTeachers"
          class="border-border bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-xs"
        >
          <Eye class="size-4 shrink-0" />
          <span>
            Read-only — showing when every matching teacher is free. Pick a teacher above, or click
            a block below, to start selecting times.
          </span>
        </div>

        <div
          v-if="hasCapacityWarnings"
          class="text-foreground flex items-center gap-2 rounded-md border border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/10 px-3 py-2 text-xs"
        >
          <span
            class="size-2 shrink-0 rounded-full bg-[var(--accent-coral)]"
            aria-hidden="true"
          ></span>
          <span>
            At-capacity times are shaded. Booking is allowed, but another room may be required.
          </span>
        </div>

        <div class="relative">
          <!-- expandRows shares the container height across the 22 half-hour rows of
               the 08:00-19:00 window, so this height is what sets the row height:
               44rem gave each hour ~60px, more than a one-line block needs. 36rem
               puts an hour at ~48px and the smallest bookable slot at ~24px, still
               room for its label. -->
          <!-- No border or radius here: Calendar paints its own card surface, so
               this box only sets the height. It used to add a second border at a
               different radius around the one the calendar already draws. -->
          <div class="h-[30rem] lg:h-[36rem]">
            <!-- Replacing the grid, not covering it: an empty week here carries
                 no information the reader needs, and reads as availability it
                 does not have. -->
            <CalendarDisabledOverlay
              v-if="hasNoMatchingTeachers"
              :icon="UserX"
              :message="noTeacherMessage"
              :hint="noTeacherHint"
            />
            <!-- Browsing, businessHours is the union over every matching
                 teacher, so an unshaded hour would only mean "somebody is
                 free" -- and the blocks already say who, in the same place.
                 The grid is shaded end to end instead, leaving the blocks as
                 the only thing that reads as available. Once a teacher is
                 picked the hours are one person's and the band means something
                 per-teacher, so it comes back. -->
            <Calendar
              v-else
              :model-value="calendarEvents"
              :additional-events="additionalEvents"
              :editable="calendarState === 'editable'"
              :backdrop="calendarState === 'editable' ? 'hours' : 'full'"
              :show-header="false"
              :business-hours="businessHours"
              constraint="businessHours"
              @update:model-value="events = $event"
              @event-click="handleEventClick"
              @dates-set="visibleRange = $event"
            />
          </div>
          <div
            v-if="pendingTeachers"
            class="bg-background/80 absolute inset-0 z-20 flex items-center justify-center rounded-2xl p-4"
          >
            <Card class="w-full max-w-xs">
              <CardContent class="flex flex-col gap-2 py-4">
                <div class="flex items-center justify-between">
                  <p class="text-sm font-medium">Which teacher?</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Cancel teacher selection"
                    @click="pendingTeachers = null"
                  >
                    <X class="size-4" />
                  </Button>
                </div>
                <Button
                  v-for="teacher in pendingTeachers"
                  :key="teacher.id"
                  variant="outline"
                  class="justify-start"
                  @click="pickTeacher(teacher)"
                >
                  {{ teacher.name }}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <div
          v-if="isAwaitingAvailability"
          class="border-border text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <Loader2 class="size-4 animate-spin" />
          Loading availability…
        </div>

        <div
          v-if="showsNoAvailability"
          class="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {{ selectedTeacher?.name ?? 'This teacher' }} has no availability submitted yet, so there
          are no bookable hours. Pick a different teacher.
        </div>

        <div class="flex items-center justify-between gap-3">
          <p class="text-muted-foreground text-sm">
            <template v-if="calendarState === 'editable'">
              {{ events.length }} slot{{ events.length === 1 ? '' : 's' }} selected
            </template>
            <template v-else-if="hasNoMatchingTeachers"
              >Nothing to book with these filters</template
            >
            <template v-else>Select a teacher to start booking</template>
          </p>
          <Button :disabled="!canAddToBooking" @click="addToBooking">
            <Loader2 v-if="isAddingToCart" class="size-4 animate-spin" />
            Add to booking
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
