<script setup lang="ts">
  import { computed, ref, watch, onMounted } from 'vue'
  import { subjectApi } from '../services/subjectApi'
  import { teacherApi } from '../services/teacherApi'
  import { availabilityApi } from '../services/availabilityApi'
  import {
    businessHoursForTeachers,
    transformBackendAvailability,
  } from '../utils/availabilityTransform'
  import type { Subject, Teacher, WeeklySlot } from '../types'
  import type { BusinessHoursInput } from '@fullcalendar/vue3'
  import PageLayout from '../components/PageLayout.vue'
  import Calendar from '../components/Calendar.vue'
  import CalendarDisabledOverlay from '../components/CalendarDisabledOverlay.vue'
  import { CalendarClock, Loader2, User } from '@lucide/vue'
  import { Badge } from '@/components/ui/badge'
  import { Label } from '@/components/ui/label'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'

  // The shared Select speaks strings; the query holds a numeric id.
  const subjectValue = computed(() =>
    selectedSubjectId.value === null ? '' : String(selectedSubjectId.value)
  )

  const onSubjectChange = (value: unknown) => {
    selectedSubjectId.value = value ? Number(value) : null
  }

  const subjects = ref<Subject[]>([])
  const selectedSubjectId = ref<number | null>(null)
  const filteredTeachers = ref<Teacher[]>([])
  const availabilityCache = ref<Map<number, WeeklySlot[]>>(new Map())
  const businessHours = ref<BusinessHoursInput>([])
  const isLoading = ref(false)
  const isDataReady = ref(false)
  let subjectRequestId = 0

  onMounted(async () => {
    try {
      const [subjectData, availabilityData] = await Promise.all([
        subjectApi.getAll(),
        availabilityApi.getAll(),
      ])
      subjects.value = subjectData
      availabilityCache.value = transformBackendAvailability(availabilityData)
    } finally {
      isDataReady.value = true
    }
  })

  watch(selectedSubjectId, async (subjectId) => {
    const requestId = ++subjectRequestId
    if (!subjectId) {
      filteredTeachers.value = []
      businessHours.value = []
      return
    }

    isLoading.value = true
    try {
      const teachers = await teacherApi.getBySubject(subjectId)
      if (requestId !== subjectRequestId) return
      filteredTeachers.value = teachers
      businessHours.value = businessHoursForTeachers(
        availabilityCache.value,
        teachers.map((teacher) => teacher.id)
      )
    } finally {
      if (requestId === subjectRequestId) isLoading.value = false
    }
  })
</script>

<template>
  <PageLayout title="Converge" :show-cart="false">
    <!-- One layout for every width. The three near-identical mobile, tablet and
         desktop branches rendered the same calendar and the same select. -->
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="flex flex-col gap-1">
          <h2 class="text-lg font-semibold tracking-tight">Teacher availability</h2>
          <p class="text-muted-foreground text-sm">Browse free time slots by subject.</p>
        </div>

        <div class="flex flex-col gap-2">
          <Label for="guest-subject" class="sr-only">Subject</Label>
          <Select
            :model-value="subjectValue"
            :disabled="!isDataReady"
            @update:model-value="onSubjectChange"
          >
            <SelectTrigger id="guest-subject" class="w-full sm:w-56">
              <SelectValue :placeholder="isDataReady ? 'Select a subject' : 'Loading subjects…'" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="subject in subjects" :key="subject.id" :value="String(subject.id)">
                {{ subject.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <!-- filteredTeachers was already being fetched and only ever used to
           compute the business hours. Naming the teachers answers the question
           a visitor actually has -- who would be teaching this -- which the
           shaded band alone cannot. -->
      <div
        v-if="selectedSubjectId"
        class="border-border bg-muted/40 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border px-3 py-2 text-xs"
      >
        <template v-if="isLoading">
          <Loader2 class="text-muted-foreground size-4 shrink-0 animate-spin" />
          <span class="text-muted-foreground">Loading availability…</span>
        </template>
        <template v-else-if="filteredTeachers.length">
          <User class="text-muted-foreground size-4 shrink-0" />
          <span class="text-muted-foreground">
            {{ filteredTeachers.length }}
            {{ filteredTeachers.length === 1 ? 'teacher' : 'teachers' }} ·
          </span>
          <Badge
            v-for="teacher in filteredTeachers"
            :key="teacher.id"
            variant="secondary"
            class="font-normal"
          >
            {{ teacher.name }}
          </Badge>
          <span class="text-muted-foreground ml-auto"
            >Shaded hours are when a teacher is free.</span
          >
        </template>
        <template v-else>
          <CalendarClock class="text-muted-foreground size-4 shrink-0" />
          <span class="text-muted-foreground">No teacher currently teaches this subject.</span>
        </template>
      </div>

      <!-- Same as the other two calendars: no Card wrapper, because Calendar
           already paints a card surface and nesting it gave two borders at two
           radii, inset 24px top and bottom but flush left and right. -->
      <div class="h-[30rem] lg:h-[36rem]">
        <Calendar
          v-if="selectedSubjectId"
          :business-hours="businessHours"
          :paint-business-hours="true"
          constraint="businessHours"
          class="h-full"
        />
        <CalendarDisabledOverlay
          v-else
          message="Select a subject to browse availability"
          hint="The calendar will shade the hours when a teacher of that subject is free."
        />
      </div>
    </div>
  </PageLayout>
</template>
