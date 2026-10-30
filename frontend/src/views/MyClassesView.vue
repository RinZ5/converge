<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { Loader2 } from '@lucide/vue'
  import PageLayout from '../components/PageLayout.vue'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
  import { bookingApi } from '../services/bookingApi'
  import { useAuthStore } from '../stores/authStore'
  import type { Booking } from '../types'

  type Scope = 'upcoming' | 'past'
  const SCOPES: { value: Scope; label: string }[] = [
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'past', label: 'Past' },
  ]

  const auth = useAuthStore()
  const isParent = computed(() => auth.role === 'parent')

  const bookings = ref<Booking[]>([])
  const isLoading = ref(true)
  const loadError = ref('')
  const scope = ref<Scope>('upcoming')
  const studentFilter = ref<number | null>(null)

  const load = async () => {
    isLoading.value = true
    loadError.value = ''
    try {
      bookings.value = await bookingApi.list()
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to load your classes'
    } finally {
      isLoading.value = false
    }
  }

  onMounted(load)

  const students = computed(() => {
    const byId = new Map<number, string>()
    for (const b of bookings.value) byId.set(b.student_id, b.student_name)
    return [...byId]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  const scoped = computed(() => {
    const now = Date.now()
    return bookings.value.filter((b) => {
      const isPast = new Date(b.end_time).getTime() < now
      return scope.value === 'past' ? isPast : !isPast
    })
  })

  const visible = computed(() => {
    const list =
      studentFilter.value === null
        ? scoped.value
        : scoped.value.filter((b) => b.student_id === studentFilter.value)
    return [...list].sort((a, b) => {
      const delta = new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      return scope.value === 'past' ? -delta : delta
    })
  })

  const dayKey = (iso: string) => new Date(iso).toDateString()

  const groups = computed(() => {
    const out: { key: string; label: string; items: Booking[] }[] = []
    for (const b of visible.value) {
      const key = dayKey(b.start_time)
      const last = out.at(-1)
      if (last?.key === key) last.items.push(b)
      else out.push({ key, label: formatDate(b.start_time), items: [b] })
    }
    return out
  })

  const upcomingCount = computed(
    () => bookings.value.filter((b) => new Date(b.end_time).getTime() >= Date.now()).length
  )

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  function formatTime(date: string) {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  const emptyMessage = computed(() => {
    if (scope.value === 'past') return 'No past classes'
    return isParent.value ? 'No upcoming classes for your students' : 'You have no upcoming classes'
  })
</script>

<template>
  <PageLayout title="My Classes" :show-cart="false">
    <div class="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold tracking-tight">
          {{ isParent ? "Your students' classes" : 'Your classes' }}
        </h2>
        <p class="text-muted-foreground text-sm">
          {{
            isLoading
              ? 'Loading…'
              : `${upcomingCount} upcoming ${upcomingCount === 1 ? 'class' : 'classes'}`
          }}
        </p>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="bg-muted inline-flex w-fit rounded-md p-0.5" role="tablist">
          <button
            v-for="option in SCOPES"
            :key="option.value"
            type="button"
            role="tab"
            :aria-selected="scope === option.value"
            class="focus-visible:ring-ring/50 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3"
            :class="
              scope === option.value
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="scope = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <div v-if="isParent && students.length > 1" class="flex flex-wrap gap-1.5">
          <Button
            :variant="studentFilter === null ? 'default' : 'outline'"
            size="sm"
            @click="studentFilter = null"
          >
            All students
          </Button>
          <Button
            v-for="student in students"
            :key="student.id"
            :variant="studentFilter === student.id ? 'default' : 'outline'"
            size="sm"
            @click="studentFilter = student.id"
          >
            {{ student.name }}
          </Button>
        </div>
      </div>

      <Card v-if="isLoading">
        <CardContent class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <Loader2 class="size-4 animate-spin" />
          Loading your classes…
        </CardContent>
      </Card>

      <Card v-else-if="loadError" class="border-destructive/30">
        <CardContent class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-destructive text-sm">{{ loadError }}</p>
          <Button variant="outline" @click="load">Try again</Button>
        </CardContent>
      </Card>

      <Card v-else-if="groups.length === 0">
        <CardContent class="text-muted-foreground text-center text-sm">
          {{ emptyMessage }}
        </CardContent>
      </Card>

      <template v-else>
        <section v-for="group in groups" :key="group.key" class="flex flex-col gap-2">
          <h3 class="text-muted-foreground text-2xs font-semibold tracking-wider uppercase">
            {{ group.label }}
          </h3>

          <Card class="gap-0 overflow-hidden py-0">
            <CardContent class="divide-border divide-y px-0">
              <article
                v-for="booking in group.items"
                :key="booking.id"
                class="flex items-start gap-4 px-4 py-3 sm:px-6"
              >
                <!-- The time leads: it is what someone scanning their week is
                     looking for, and it keeps a column of its own. -->
                <span class="w-24 shrink-0 text-sm font-medium tabular-nums">
                  {{ formatTime(booking.start_time) }}–{{ formatTime(booking.end_time) }}
                </span>

                <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="truncate text-sm font-medium">
                    {{ booking.subject_name ?? 'Class' }}
                  </span>
                  <span class="text-muted-foreground truncate text-xs">
                    {{ booking.teacher_name ?? '—' }} · {{ booking.branch_name ?? '—' }}
                    <template v-if="isParent"> · {{ booking.student_name }}</template>
                  </span>
                </div>
              </article>
            </CardContent>
          </Card>
        </section>
      </template>
    </div>
  </PageLayout>
</template>
