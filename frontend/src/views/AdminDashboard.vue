<script setup lang="ts">
  import { ref, computed, watch, onMounted } from 'vue'
  import { CalendarPlus, ChevronDown, Loader2, MapPin, Search, Settings, User } from '@lucide/vue'
  import PageLayout from '../components/PageLayout.vue'
  import { useAdminRoster, type RosterMode } from '../composables/useAdminRoster'
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'

  const { mode, search, entries, allEntries, counts, isLoading, loadError, load } = useAdminRoster()

  const MODES: { value: RosterMode; label: string }[] = [
    { value: 'teachers', label: 'Teachers' },
    { value: 'students', label: 'Students' },
  ]

  const expanded = ref<Set<number>>(new Set())

  const isOpen = (id: number) => expanded.value.has(id)

  const toggle = (id: number) => {
    const next = new Set(expanded.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expanded.value = next
  }

  watch(mode, () => {
    expanded.value = new Set()
  })

  const pluralize = (word: string, count: number, plural?: string): string =>
    count === 1 ? word : (plural ?? `${word}s`)

  const entryNoun = computed(() => (mode.value === 'teachers' ? 'teacher' : 'student'))
  const peopleNoun = computed(() => (mode.value === 'teachers' ? 'student' : 'teacher'))

  const noSubjectsLabel = computed(() =>
    mode.value === 'teachers' ? 'No subjects assigned' : 'No subjects booked yet'
  )

  const noPeopleLabel = computed(() =>
    mode.value === 'teachers'
      ? 'No students booked with this teacher yet.'
      : 'No classes booked for this student yet.'
  )

  const stats = computed(() => [
    { label: 'Teachers', value: counts.value.teachers },
    { label: 'Students', value: counts.value.students },
    { label: 'Subjects', value: counts.value.subjects },
    { label: 'Booked classes', value: counts.value.classes },
  ])

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

  const formatSlot = (startTime: string, endTime: string): string => {
    const start = new Date(startTime)
    if (Number.isNaN(start.getTime())) return 'Unknown time'
    const end = new Date(endTime)
    const until = Number.isNaN(end.getTime()) ? '' : `–${timeFormat.format(end)}`
    return `${dayFormat.format(start)} · ${timeFormat.format(start)}${until}`
  }

  const isPast = (endTime: string): boolean => {
    const end = new Date(endTime).getTime()
    return Number.isFinite(end) && end < Date.now()
  }

  onMounted(load)
</script>

<template>
  <PageLayout title="Admin Dashboard">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <Card>
        <CardContent>
          <dl class="grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:gap-y-0 sm:divide-x">
            <div
              v-for="stat in stats"
              :key="stat.label"
              class="flex flex-col sm:px-5 sm:first:pl-0"
            >
              <dt class="text-muted-foreground text-xs">{{ stat.label }}</dt>
              <dd class="text-2xl leading-tight font-semibold tabular-nums">{{ stat.value }}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        <div class="bg-muted inline-flex w-fit shrink-0 rounded-md p-0.5" role="tablist">
          <button
            v-for="option in MODES"
            :key="option.value"
            type="button"
            role="tab"
            :aria-selected="mode === option.value"
            class="focus-visible:ring-ring/50 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3"
            :class="
              mode === option.value
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="mode = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <div class="relative flex-1">
          <Search
            class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <input
            v-model="search"
            type="search"
            :aria-label="`Search ${entryNoun}s`"
            class="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border py-1 pr-3 pl-9 text-sm shadow-xs outline-none focus-visible:ring-3"
            :placeholder="`Search by name, subject, or ${peopleNoun}`"
          />
        </div>

        <div class="flex gap-2">
          <RouterLink to="/manage" class="flex-1 sm:flex-none">
            <Button variant="outline" class="w-full">
              <Settings />
              Manage
            </Button>
          </RouterLink>
          <RouterLink to="/booking" class="flex-1 sm:flex-none">
            <Button class="w-full">
              <CalendarPlus />
              Book a session
            </Button>
          </RouterLink>
        </div>
      </div>

      <Card v-if="isLoading">
        <CardContent class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <Loader2 class="size-4 animate-spin" />
          Loading roster…
        </CardContent>
      </Card>

      <Card v-else-if="loadError" class="border-destructive/30">
        <CardContent class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-destructive text-sm">{{ loadError }}</p>
          <Button variant="outline" @click="load">Retry</Button>
        </CardContent>
      </Card>

      <Card v-else-if="allEntries.length === 0">
        <CardContent class="text-muted-foreground text-center text-sm">
          No {{ entryNoun }}s yet.
        </CardContent>
      </Card>

      <Card v-else-if="entries.length === 0">
        <CardContent class="text-muted-foreground text-center text-sm">
          No {{ entryNoun }}s match “{{ search }}”.
        </CardContent>
      </Card>

      <template v-else>
        <Card class="gap-0 overflow-hidden py-0">
          <CardContent class="divide-border divide-y px-0">
            <div v-for="entry in entries" :key="entry.id">
              <button
                type="button"
                class="hover:bg-muted/40 flex w-full items-start gap-3 px-4 py-3 text-left transition-colors sm:px-6"
                :aria-expanded="isOpen(entry.id)"
                @click="toggle(entry.id)"
              >
                <ChevronDown
                  class="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform"
                  :class="{ 'rotate-180': isOpen(entry.id) }"
                />

                <span class="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span class="truncate text-sm font-medium">{{ entry.name }}</span>
                  <span v-if="entry.subjects.length" class="flex flex-wrap gap-1">
                    <Badge
                      v-for="subject in entry.subjects"
                      :key="subject"
                      variant="secondary"
                      class="font-normal"
                    >
                      {{ subject }}
                    </Badge>
                  </span>
                  <span v-else class="text-muted-foreground text-xs">{{ noSubjectsLabel }}</span>
                </span>

                <span class="flex shrink-0 flex-col items-end gap-1">
                  <span v-if="entry.classCount === 0" class="text-muted-foreground text-sm">
                    No classes
                  </span>
                  <span v-else class="text-sm tabular-nums">
                    {{ entry.people.length }}
                    <span class="text-muted-foreground">
                      {{ pluralize(peopleNoun, entry.people.length) }} ·
                    </span>
                    {{ entry.classCount }}
                    <span class="text-muted-foreground">
                      {{ pluralize('class', entry.classCount, 'classes') }}
                    </span>
                  </span>
                  <span
                    v-if="entry.nextSession"
                    class="text-muted-foreground hidden text-xs tabular-nums sm:block"
                  >
                    Next {{ formatSlot(entry.nextSession.startTime, entry.nextSession.endTime) }}
                  </span>
                </span>
              </button>

              <div
                v-if="isOpen(entry.id)"
                class="border-border bg-muted/20 border-t px-4 py-3 sm:px-6"
              >
                <p v-if="entry.people.length === 0" class="text-muted-foreground text-sm">
                  {{ noPeopleLabel }}
                </p>

                <ul v-else class="flex flex-col gap-2">
                  <li
                    v-for="person in entry.people"
                    :key="person.id"
                    class="bg-card border-border flex flex-col gap-1.5 rounded-md border px-3 py-2"
                  >
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <User class="text-muted-foreground size-3.5 shrink-0" />
                      <span class="text-sm font-medium">{{ person.name }}</span>
                      <Badge
                        v-for="subject in person.subjects"
                        :key="subject"
                        variant="outline"
                        class="font-normal"
                      >
                        {{ subject }}
                      </Badge>
                      <span class="text-muted-foreground ml-auto text-xs tabular-nums">
                        {{ person.sessions.length }}
                        {{ pluralize('class', person.sessions.length, 'classes') }}
                      </span>
                    </div>

                    <ul class="flex flex-col gap-1 pl-5.5">
                      <li
                        v-for="session in person.sessions"
                        :key="session.id"
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs"
                        :class="
                          isPast(session.endTime) ? 'text-muted-foreground/60' : 'text-foreground'
                        "
                      >
                        <span class="tabular-nums">
                          {{ formatSlot(session.startTime, session.endTime) }}
                        </span>
                        <span class="text-muted-foreground flex items-center gap-1">
                          <MapPin class="size-3" />
                          {{ session.branch }}
                        </span>
                        <span v-if="person.subjects.length > 1" class="text-muted-foreground">
                          {{ session.subject }}
                        </span>
                      </li>
                    </ul>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <p class="text-muted-foreground px-1 text-xs">
          Showing {{ entries.length }} of {{ allEntries.length }}
          {{ pluralize(entryNoun, allEntries.length) }}
        </p>
      </template>
    </div>
  </PageLayout>
</template>
