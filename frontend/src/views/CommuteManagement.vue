<script setup lang="ts">
  import { computed, ref, onMounted } from 'vue'
  import { Loader2 } from '@lucide/vue'
  import PageLayout from '../components/PageLayout.vue'
  import ManagementNav from '../components/ManagementNav.vue'
  import { commuteApi } from '../services/commuteApi'
  import { useNotification } from '../composables/useNotification'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'

  const { showSuccess, showError } = useNotification()

  const currentMinutes = ref<number | null>(null)
  const draft = ref('')
  const isLoading = ref(true)
  const isSaving = ref(false)
  const loadError = ref('')

  const load = async () => {
    isLoading.value = true
    loadError.value = ''
    try {
      const data = await commuteApi.get()
      currentMinutes.value = data.commute_time
      draft.value = String(data.commute_time)
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to load commute time'
    } finally {
      isLoading.value = false
    }
  }

  onMounted(load)

  const plural = (minutes: number) => `${minutes} minute${minutes === 1 ? '' : 's'}`

  const parsed = computed<number | null>(() => {
    const raw = draft.value.trim()
    if (raw === '') return null
    const minutes = Number(raw)
    return Number.isInteger(minutes) && minutes >= 0 ? minutes : null
  })

  const isDirty = computed(() => parsed.value !== currentMinutes.value)

  // Saying why Save is unavailable, rather than only greying it out. The old
  // version returned silently on an empty field, which looked like a dead button.
  const saveBlocker = computed<string | null>(() => {
    if (draft.value.trim() === '') return 'Enter a commute time.'
    if (parsed.value === null) return 'Commute time must be a whole number of 0 or more.'
    return null
  })

  const canSave = computed(() => saveBlocker.value === null && isDirty.value && !isSaving.value)

  const handleSave = async () => {
    const minutes = parsed.value
    if (!canSave.value || minutes === null) return
    isSaving.value = true
    try {
      await commuteApi.set(minutes)
      currentMinutes.value = minutes
      draft.value = String(minutes)
      showSuccess(`Commute time updated to ${plural(minutes)}`)
    } catch (err) {
      showError(err, 'Failed to update commute time')
    } finally {
      isSaving.value = false
    }
  }
</script>

<template>
  <PageLayout title="Manage Commute" :show-cart="false" back-to="/dashboard" back-label="Dashboard">
    <ManagementNav />

    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <Card v-if="isLoading" class="max-w-2xl">
        <CardContent class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <Loader2 class="size-4 animate-spin" />
          Loading commute time…
        </CardContent>
      </Card>

      <Card v-else-if="loadError" class="border-destructive/30 max-w-2xl">
        <CardContent class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-destructive text-sm">{{ loadError }}</p>
          <Button variant="outline" @click="load">Retry</Button>
        </CardContent>
      </Card>

      <Card v-else class="max-w-2xl">
        <CardContent class="flex flex-col gap-5">
          <div class="flex flex-col gap-1">
            <h2 class="text-sm font-medium">Commute time</h2>
            <p class="text-muted-foreground text-xs">
              Travel time between different branches. The booking engine pads a teacher’s schedule
              by this much when their next class is at another branch.
            </p>
          </div>

          <div class="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div class="flex flex-col gap-0.5">
              <span class="text-muted-foreground text-xs">Current</span>
              <span class="text-2xl leading-tight font-semibold tabular-nums">
                {{ currentMinutes }}
                <span class="text-muted-foreground text-base font-normal">
                  minute{{ currentMinutes === 1 ? '' : 's' }}
                </span>
              </span>
            </div>

            <div class="flex flex-col gap-2">
              <Label for="commute-minutes">New value</Label>
              <div class="flex items-center gap-2">
                <Input
                  id="commute-minutes"
                  v-model="draft"
                  type="number"
                  min="0"
                  step="1"
                  class="w-24"
                  @keyup.enter="handleSave"
                />
                <span class="text-muted-foreground text-sm">minutes</span>
                <Button :disabled="!canSave" @click="handleSave">
                  <Loader2 v-if="isSaving" class="animate-spin" />
                  Save
                </Button>
              </div>
            </div>
          </div>

          <p v-if="saveBlocker" class="text-destructive text-sm">{{ saveBlocker }}</p>
          <p v-else-if="!isDirty" class="text-muted-foreground text-sm">
            This is the value already in use.
          </p>
        </CardContent>
      </Card>
    </div>
  </PageLayout>
</template>
