<script setup lang="ts">
  import PageLayout from '../components/PageLayout.vue'
  import Calendar from '../components/Calendar.vue'
  import CalendarDisabledOverlay from '../components/CalendarDisabledOverlay.vue'
  import { computed } from 'vue'
  import { Loader2 } from '@lucide/vue'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
  import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
  import { Label } from '@/components/ui/label'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { useSubmitAvailability } from '../composables/useSubmitAvailability'

  const {
    teacherStore,
    isLoading,
    events,
    showConfirm,
    selectedTeacherId,
    selectedTeacher,
    showErrors,
    formattedSlots,
    handleSubmit,
    confirmSubmit,
    cancelConfirm,
  } = useSubmitAvailability()

  // The shared Select speaks strings; the composable holds a numeric id.
  const teacherValue = computed(() =>
    selectedTeacherId.value === null ? '' : String(selectedTeacherId.value)
  )

  const onTeacherChange = (value: unknown) => {
    selectedTeacherId.value = value ? Number(value) : null
  }
</script>

<template>
  <PageLayout
    title="Submit Availability"
    :show-cart="false"
    back-to="/manage"
    back-label="Manage Teachers"
  >
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-2">
        <div class="flex flex-1 flex-col gap-2">
          <Label for="availability-teacher">Teacher</Label>
          <Select :model-value="teacherValue" @update:model-value="onTeacherChange">
            <SelectTrigger id="availability-teacher" class="w-full sm:max-w-sm">
              <SelectValue placeholder="Select a teacher" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="teacher in teacherStore.teachers"
                :key="teacher.id"
                :value="String(teacher.id)"
              >
                {{ teacher.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button :disabled="isLoading" :aria-busy="isLoading" @click="handleSubmit">
          <Loader2 v-if="isLoading" class="animate-spin" />
          Submit availability
        </Button>
      </div>

      <p v-if="showErrors && !selectedTeacherId" class="text-destructive px-1 text-sm">
        Select a teacher first.
      </p>

      <Card class="overflow-hidden">
        <CardContent class="px-0">
          <div class="h-[30rem] lg:h-[40rem]">
            <Calendar
              v-if="selectedTeacherId"
              v-model="events"
              :editable="true"
              :show-header="false"
              class="h-full"
            />
            <CalendarDisabledOverlay v-else message="Select a teacher first" />
          </div>
        </CardContent>
      </Card>

      <p class="text-muted-foreground px-1 text-xs">
        Drag on the calendar to add a slot. Submitting replaces the teacher's whole week.
      </p>
    </div>

    <Dialog v-model:open="showConfirm">
      <DialogContent>
        <div class="flex flex-col gap-1">
          <DialogTitle>Confirm availability</DialogTitle>
          <DialogDescription>
            This replaces {{ selectedTeacher?.name }}'s entire weekly schedule.
          </DialogDescription>
        </div>

        <div class="border-border flex flex-col gap-1 rounded-md border p-3">
          <p class="text-muted-foreground text-xs">
            {{ events.length }} slot{{ events.length === 1 ? '' : 's' }}
          </p>
          <ul class="flex flex-col gap-0.5">
            <li v-for="(slot, index) in formattedSlots" :key="index" class="text-sm tabular-nums">
              {{ slot.day }} {{ slot.start }}–{{ slot.end }}
            </li>
          </ul>
        </div>

        <div class="flex justify-end gap-2">
          <Button variant="ghost" @click="cancelConfirm">Cancel</Button>
          <Button @click="confirmSubmit">Confirm</Button>
        </div>
      </DialogContent>
    </Dialog>
  </PageLayout>
</template>
