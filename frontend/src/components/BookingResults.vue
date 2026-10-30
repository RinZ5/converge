<script setup lang="ts">
  import { computed } from 'vue'
  import { CalendarX, Loader2, Sparkles } from '@lucide/vue'
  import { rangesOverlap } from '../utils/dateValidation'
  import { useBranchCapacity } from '../composables/useBranchCapacity'
  import { scoreColor } from '../utils/scoreColor'
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'
  import type { BookingAlternative, BookingResponse, CartItem } from '../types'

  interface Props {
    suggestions: BookingResponse | null
    showDetailedResults: boolean
    isEvaluating: boolean
    cartItems: CartItem[]
  }

  const props = defineProps<Props>()

  const emit = defineEmits<{
    (
      e: 'confirmBooking',
      teacherId: number,
      teacherName: string,
      startTime: string,
      endTime: string
    ): void
  }>()

  const { isAtCapacity } = useBranchCapacity()

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

  const dayFormat = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const timeFormat = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // Always showing the date makes a slot that landed in a later week obvious on
  // its own, which is what the old "(next week)" suffix was there to say.
  const formatRange = (startTime: string, endTime: string): string => {
    const start = new Date(startTime)
    if (Number.isNaN(start.getTime())) return 'Unknown time'
    const end = new Date(endTime)
    const until = Number.isNaN(end.getTime()) ? '' : `–${timeFormat.format(end)}`
    return `${dayFormat.format(start)} · ${timeFormat.format(start)}${until}`
  }

  // The cart is the only record of what has been taken. The old version also
  // kept a local Set of "booked" keys, which stayed set even when adding to the
  // cart failed -- the row then claimed to be booked when nothing was.
  const isInCart = (option: BookingAlternative): boolean =>
    props.cartItems.some(
      (item) =>
        item.teacher_id === option.teacher_id &&
        rangesOverlap(
          new Date(option.start_time),
          new Date(option.end_time),
          new Date(item.start_time),
          new Date(item.end_time)
        )
    )

  interface Option {
    key: string
    alternative: BookingAlternative
    isExact: boolean
    inCart: boolean
    atCapacity: boolean
  }

  interface SlotGroup {
    key: string
    label: string
    status: string
    hasExact: boolean
    options: Option[]
  }

  // exact_match and alternatives are the same shape, so they render through one
  // list instead of two near-identical blocks with two sets of styles.
  const groups = computed<SlotGroup[]>(() => {
    const results = props.suggestions?.results ?? []
    return results.map((result, index) => {
      const raw: { alternative: BookingAlternative; isExact: boolean }[] = []
      if (result.exact_match) raw.push({ alternative: result.exact_match, isExact: true })
      for (const alternative of result.alternatives ?? []) raw.push({ alternative, isExact: false })

      const options = raw.map(({ alternative, isExact }) => ({
        key: `${alternative.teacher_id}-${alternative.start_time}`,
        alternative,
        isExact,
        inCart: isInCart(alternative),
        atCapacity: isAtCapacity(alternative.start_time, alternative.end_time),
      }))

      const slot = result.slot
      return {
        key: `${slot.day_of_week}-${slot.start}-${index}`,
        label: `${DAY_NAMES[slot.day_of_week] ?? '?'} ${slot.start}–${slot.end}`,
        hasExact: Boolean(result.exact_match),
        status: result.exact_match
          ? 'Exact match'
          : options.length > 0
            ? `${options.length} alternative${options.length === 1 ? '' : 's'}`
            : 'No teacher available',
        options,
      }
    })
  })

  const matchedCount = computed(() => groups.value.filter((g) => g.options.length > 0).length)

  const handleAdd = (option: Option) => {
    if (option.inCart) return
    const { teacher_id, teacher_name, start_time, end_time } = option.alternative
    emit('confirmBooking', teacher_id, teacher_name, start_time, end_time)
  }
</script>

<template>
  <!-- Rendered inside SmartPath's CardContent, so the sections are bordered
       blocks rather than Cards; nesting a Card here would double the chrome. -->
  <div class="flex flex-col gap-4">
    <div
      v-if="isEvaluating"
      class="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm"
    >
      <Loader2 class="size-4 animate-spin" />
      Finding available teachers…
    </div>

    <template v-else-if="showDetailedResults && suggestions">
      <p class="text-sm">
        <template v-if="matchedCount > 0">
          Found teachers for
          <span class="font-medium">{{ matchedCount }}</span>
          of {{ groups.length }} time window{{ groups.length === 1 ? '' : 's' }}.
        </template>
        <template v-else>No teachers available for the selected time windows.</template>
      </p>

      <div v-if="groups.length === 0" class="flex flex-col items-center gap-2 py-8 text-center">
        <CalendarX class="text-muted-foreground size-6" />
        <p class="text-sm font-medium">No teachers available</p>
        <p class="text-muted-foreground text-sm">
          Try adjusting your preferred days or times and search again.
        </p>
      </div>

      <!-- One bordered list with tinted group headers, rather than bordered
           option boxes nested inside a divided list inside a card: three levels
           of boxing read as clutter, and the separation was doing the job twice. -->
      <div v-else class="border-border divide-border divide-y overflow-hidden rounded-lg border">
        <template v-for="group in groups" :key="group.key">
          <div
            class="bg-muted/50 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2"
          >
            <span class="text-xs font-semibold tracking-wide uppercase">{{ group.label }}</span>
            <span
              class="text-xs"
              :class="group.hasExact ? 'text-success-text font-medium' : 'text-muted-foreground'"
            >
              {{ group.status }}
            </span>
          </div>

          <p v-if="group.options.length === 0" class="text-muted-foreground px-3 py-3 text-sm">
            No teacher is free near this window.
          </p>

          <div
            v-for="option in group.options"
            :key="option.key"
            class="flex items-start gap-3 px-3 py-3"
          >
            <!-- The score as a colour: green at 100 through amber to red at 0.
                 An exact match scores 100, so it reads fully green without
                 needing a separate highlight. -->
            <span
              class="mt-0.5 w-1 shrink-0 self-stretch rounded-full"
              :style="{ backgroundColor: scoreColor(option.alternative.score) }"
              aria-hidden="true"
            ></span>

            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="text-sm font-medium">{{ option.alternative.teacher_name }}</span>
                <Badge variant="outline" class="font-normal tabular-nums">
                  Score {{ option.alternative.score }}
                </Badge>
                <Badge
                  v-if="option.atCapacity"
                  class="border-warning-border bg-warning-surface text-warning-text font-normal"
                  :title="`This branch is already at capacity at this time \u2014 another room is needed.`"
                >
                  At capacity
                </Badge>
              </div>

              <!-- The time offered is the answer, so it is not muted xs text. -->
              <span class="text-sm tabular-nums">
                {{ formatRange(option.alternative.start_time, option.alternative.end_time) }}
              </span>

              <span v-if="option.alternative.reasons?.length" class="text-muted-foreground text-xs">
                {{ option.alternative.reasons.join(' \u00b7 ') }}
              </span>
            </div>

            <Button
              size="sm"
              class="shrink-0 self-center"
              :variant="option.inCart ? 'outline' : 'default'"
              :disabled="option.inCart"
              @click="handleAdd(option)"
            >
              {{ option.inCart ? 'In cart' : 'Add to cart' }}
            </Button>
          </div>
        </template>
      </div>
    </template>

    <div v-else class="flex flex-col items-center gap-2 py-8 text-center">
      <Sparkles class="text-muted-foreground size-6" />
      <p class="text-sm font-medium">No results yet</p>
      <p class="text-muted-foreground text-sm">
        Add your preferred time windows and search to see matching teachers here.
      </p>
    </div>
  </div>
</template>
