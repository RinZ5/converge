<script setup lang="ts">
  import { computed, reactive, ref, onMounted } from 'vue'
  import { Loader2, Plus, Search } from '@lucide/vue'
  import PageLayout from '../components/PageLayout.vue'
  import ManagementNav from '../components/ManagementNav.vue'
  import { branchApi } from '../services/branchApi'
  import { useNotification } from '../composables/useNotification'
  import { sortDeactivatedLast } from '../utils/status'
  import {
    UNLIMITED,
    capacityFromDraft,
    describeCapacity,
    draftFromCapacity,
    isCapacityChanged,
    type CapacityDraft,
  } from '../utils/branchCapacity'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
  import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { Switch } from '@/components/ui/switch'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import type { Branch } from '../types'

  const { showSuccess, showError } = useNotification()

  const branches = ref<Branch[]>([])
  const isLoadingList = ref(true)
  const loadError = ref('')
  const search = ref('')
  const pendingIds = ref<Set<number>>(new Set())

  // One draft per branch instead of two parallel Records keyed by id, which had
  // to be kept in step by hand on every load and every create.
  const drafts = reactive<Record<number, CapacityDraft>>({})

  const isPending = (id: number) => pendingIds.value.has(id)

  const withPending = async (id: number, run: () => Promise<void>) => {
    pendingIds.value = new Set(pendingIds.value).add(id)
    try {
      await run()
    } finally {
      const next = new Set(pendingIds.value)
      next.delete(id)
      pendingIds.value = next
    }
  }

  const trackDraft = (branch: Branch) => {
    drafts[branch.id] = draftFromCapacity(branch.capacity)
  }

  const load = async () => {
    isLoadingList.value = true
    loadError.value = ''
    try {
      const list = await branchApi.getAll()
      branches.value = list
      list.forEach(trackDraft)
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to load branches'
    } finally {
      isLoadingList.value = false
    }
  }

  onMounted(load)

  const allBranches = computed<Branch[]>(() => sortDeactivatedLast(branches.value))

  const visibleBranches = computed<Branch[]>(() => {
    const term = search.value.trim().toLowerCase()
    if (!term) return allBranches.value
    return allBranches.value.filter((branch) => branch.name.toLowerCase().includes(term))
  })

  const bookableCount = computed(
    () => branches.value.filter((branch) => branch.status === 'active').length
  )

  const modeOf = (branch: Branch) => drafts[branch.id]?.mode ?? 'unlimited'

  const setMode = (branch: Branch, mode: string) => {
    const draft = drafts[branch.id]
    if (!draft) return
    draft.mode = mode === 'limited' ? 'limited' : 'unlimited'
    // Seed the box from the saved cap so switching to Limited does not land on
    // an empty field the person has to retype.
    if (draft.mode === 'limited' && draft.limit === '') {
      draft.limit = branch.capacity === UNLIMITED ? '' : String(branch.capacity)
    }
  }

  const hasCapacityChange = (branch: Branch): boolean => {
    const draft = drafts[branch.id]
    return draft ? isCapacityChanged(branch.capacity, draft) : false
  }

  const handleSaveCapacity = async (branch: Branch) => {
    const draft = drafts[branch.id]
    if (!draft) return
    const capacity = capacityFromDraft(draft)
    if (capacity === null) {
      showError(null, 'Capacity must be a whole number of 1 or more')
      return
    }

    await withPending(branch.id, async () => {
      try {
        await branchApi.setCapacity(branch.id, capacity)
        branch.capacity = capacity
        trackDraft(branch)
        showSuccess(`${branch.name} capacity set to ${describeCapacity(capacity).toLowerCase()}`)
      } catch (err) {
        showError(err, `Failed to update ${branch.name} capacity`)
      }
    })
  }

  const handleToggleStatus = async (branch: Branch) => {
    const next = branch.status === 'active' ? 'deactivated' : 'active'
    await withPending(branch.id, async () => {
      try {
        await branchApi.setStatus(branch.id, next)
        branch.status = next
        showSuccess(
          next === 'active'
            ? `${branch.name} is bookable again`
            : `${branch.name} no longer takes new bookings`
        )
      } catch (err) {
        showError(err, `Failed to update ${branch.name}`)
      }
    })
  }

  const isAdding = ref(false)
  const isSaving = ref(false)
  const newName = ref('')
  const newDraft = reactive<CapacityDraft>({ mode: 'unlimited', limit: '' })

  const trimmedName = computed(() => newName.value.trim())

  const createBlocker = computed<string | null>(() => {
    if (!trimmedName.value) return 'Enter a branch name.'
    if (capacityFromDraft(newDraft) === null) return 'Capacity must be a whole number of 1 or more.'
    return null
  })

  // Resetting on open covers every way the dialog can close -- Esc, the X, the
  // overlay -- instead of only the Cancel button.
  const openForm = () => {
    newName.value = ''
    newDraft.mode = 'unlimited'
    newDraft.limit = ''
    isAdding.value = true
  }

  const handleCreate = async () => {
    const capacity = capacityFromDraft(newDraft)
    if (createBlocker.value || capacity === null || isSaving.value) return
    isSaving.value = true
    try {
      const created = await branchApi.create(trimmedName.value, capacity)
      branches.value.push(created)
      trackDraft(created)
      showSuccess(`${created.name} added`)
      isAdding.value = false
    } catch (err) {
      showError(err, 'Failed to add branch')
    } finally {
      isSaving.value = false
    }
  }
</script>

<template>
  <PageLayout
    title="Manage Branches"
    :show-cart="false"
    back-to="/dashboard"
    back-label="Dashboard"
  >
    <ManagementNav />

    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        <div class="relative flex-1">
          <Search
            class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            v-model="search"
            type="search"
            aria-label="Search branches"
            class="pl-9"
            placeholder="Search by name"
          />
        </div>

        <Button @click="openForm">
          <Plus />
          Add branch
        </Button>
      </div>

      <Dialog v-model:open="isAdding">
        <DialogContent>
          <DialogTitle>Add a branch</DialogTitle>

          <form class="flex flex-col gap-4" novalidate @submit.prevent="handleCreate">
            <div class="flex flex-col gap-2">
              <Label for="new-branch-name">Name</Label>
              <Input id="new-branch-name" v-model="newName" placeholder="Branch name" />
            </div>

            <div class="flex gap-3">
              <div class="flex flex-1 flex-col gap-2">
                <Label for="new-branch-mode">Capacity</Label>
                <Select
                  :model-value="newDraft.mode"
                  @update:model-value="
                    newDraft.mode = String($event) === 'limited' ? 'limited' : 'unlimited'
                  "
                >
                  <SelectTrigger id="new-branch-mode" class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                    <SelectItem value="limited">Limited</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div v-if="newDraft.mode === 'limited'" class="flex w-28 flex-col gap-2">
                <Label for="new-branch-limit">Limit</Label>
                <Input
                  id="new-branch-limit"
                  v-model="newDraft.limit"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="30"
                />
              </div>
            </div>

            <div class="flex items-center justify-between gap-3">
              <p v-if="createBlocker" class="text-muted-foreground text-sm">{{ createBlocker }}</p>
              <span v-else></span>
              <div class="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  :disabled="isSaving"
                  @click="isAdding = false"
                >
                  Cancel
                </Button>
                <Button type="submit" :disabled="createBlocker !== null || isSaving">
                  <Loader2 v-if="isSaving" class="animate-spin" />
                  Add branch
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card v-if="isLoadingList && branches.length === 0">
        <CardContent class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <Loader2 class="size-4 animate-spin" />
          Loading branches…
        </CardContent>
      </Card>

      <Card v-else-if="loadError" class="border-destructive/30">
        <CardContent class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-destructive text-sm">{{ loadError }}</p>
          <Button variant="outline" @click="load">Retry</Button>
        </CardContent>
      </Card>

      <Card v-else-if="allBranches.length === 0">
        <CardContent class="text-muted-foreground text-center text-sm"
          >No branches yet.</CardContent
        >
      </Card>

      <Card v-else-if="visibleBranches.length === 0">
        <CardContent class="text-muted-foreground text-center text-sm">
          No branches match “{{ search }}”.
        </CardContent>
      </Card>

      <template v-else>
        <Card class="gap-0 overflow-hidden py-0">
          <CardContent class="divide-border divide-y px-0">
            <div
              v-for="branch in visibleBranches"
              :key="branch.id"
              class="flex flex-col gap-3 px-4 py-3 transition-opacity sm:flex-row sm:items-center sm:gap-4 sm:px-6"
              :class="{ 'opacity-60': isPending(branch.id) }"
            >
              <div class="flex min-w-0 flex-1 items-start gap-3">
                <span class="flex h-5 shrink-0 items-center" aria-hidden="true">
                  <span
                    class="size-2.5 rounded-full"
                    :class="branch.status === 'active' ? 'bg-success' : 'bg-danger'"
                  ></span>
                </span>

                <div class="flex min-w-0 flex-col">
                  <span class="truncate text-sm font-medium">
                    {{ branch.name }}
                    <span class="sr-only">
                      — {{ branch.status === 'active' ? 'Bookable' : 'Not bookable' }}
                    </span>
                  </span>
                  <span class="text-muted-foreground truncate text-xs">
                    {{ describeCapacity(branch.capacity) }}
                  </span>
                </div>
              </div>

              <div class="flex shrink-0 flex-wrap items-center gap-2 pl-5.5 sm:justify-end sm:pl-0">
                <Select
                  :model-value="modeOf(branch)"
                  :disabled="isPending(branch.id)"
                  @update:model-value="setMode(branch, String($event))"
                >
                  <SelectTrigger :aria-label="`Capacity mode for ${branch.name}`" class="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                    <SelectItem value="limited">Limited</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  v-if="modeOf(branch) === 'limited'"
                  v-model="drafts[branch.id].limit"
                  type="number"
                  min="1"
                  step="1"
                  class="w-20"
                  :disabled="isPending(branch.id)"
                  :aria-label="`Capacity limit for ${branch.name}`"
                  @keyup.enter="handleSaveCapacity(branch)"
                />

                <!-- Save only appears once there is something to save, so a settled
                     row carries two controls instead of four. -->
                <Button
                  v-if="hasCapacityChange(branch)"
                  size="sm"
                  :disabled="isPending(branch.id)"
                  @click="handleSaveCapacity(branch)"
                >
                  <Loader2 v-if="isPending(branch.id)" class="animate-spin" />
                  Save
                </Button>

                <Switch
                  :model-value="branch.status === 'active'"
                  :disabled="isPending(branch.id)"
                  :aria-label="`${branch.status === 'active' ? 'Stop' : 'Allow'} bookings at ${branch.name}`"
                  @update:model-value="handleToggleStatus(branch)"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div
          class="text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs"
        >
          <p>
            Showing {{ visibleBranches.length }} of {{ allBranches.length }} branches ·
            {{ bookableCount }} bookable
          </p>

          <div class="flex items-center gap-4">
            <span class="flex items-center gap-1.5">
              <span class="bg-success size-2 rounded-full" aria-hidden="true"></span>
              Bookable
            </span>
            <span class="flex items-center gap-1.5">
              <span class="bg-danger size-2 rounded-full" aria-hidden="true"></span>
              Not bookable
            </span>
          </div>
        </div>
      </template>
    </div>
  </PageLayout>
</template>
