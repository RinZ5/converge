<script setup lang="ts">
  import { computed, ref, onMounted } from 'vue'
  import { BookOpen, Loader2, Plus, Search } from '@lucide/vue'
  import PageLayout from '../components/PageLayout.vue'
  import ManagementNav from '../components/ManagementNav.vue'
  import { useTeacherStore } from '../stores/teacherStore'
  import { subjectApi } from '../services/subjectApi'
  import { teacherApi } from '../services/teacherApi'
  import { useNotification } from '../composables/useNotification'
  import { sortDeactivatedLast } from '../utils/status'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
  import { Badge } from '@/components/ui/badge'
  import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
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
  import type { Subject, Teacher } from '../types'

  const store = useTeacherStore()
  const { showSuccess, showError } = useNotification()

  const GENDERS = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'lgbtq+', label: 'LGBTQ+' },
  ]

  const allSubjects = ref<Subject[]>([])
  // Keyed per teacher rather than derived from /teachers?subject_id=, which
  // returns active teachers only -- a deactivated teacher would look like they
  // teach nothing.
  const subjectsByTeacher = ref<Map<number, Subject[]>>(new Map())

  const subjectsFor = (teacherId: number): Subject[] => subjectsByTeacher.value.get(teacherId) ?? []

  const isLoadingList = ref(true)
  const loadError = ref('')
  const search = ref('')
  const pendingIds = ref<Set<number>>(new Set())

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

  // The previous version blanked store.teachers before fetching, so the list
  // flashed empty on every visit. Keeping the old rows up while the new ones
  // load is both calmer and honest -- they were accurate a moment ago.
  const load = async () => {
    isLoadingList.value = true
    loadError.value = ''
    try {
      const [, subjects] = await Promise.all([store.reloadTeachers(), subjectApi.getAll()])
      allSubjects.value = subjects
      const assigned = await Promise.all(
        store.teachers.map(
          async (teacher) => [teacher.id, await teacherApi.getSubjects(teacher.id)] as const
        )
      )
      subjectsByTeacher.value = new Map(assigned)
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to load teachers'
    } finally {
      isLoadingList.value = false
    }
  }

  onMounted(load)

  const allTeachers = computed<Teacher[]>(() => sortDeactivatedLast(store.teachers))

  const teachers = computed<Teacher[]>(() => {
    const term = search.value.trim().toLowerCase()
    if (!term) return allTeachers.value
    return allTeachers.value.filter(
      (teacher) =>
        teacher.name.toLowerCase().includes(term) || teacher.email.toLowerCase().includes(term)
    )
  })

  const activeCount = computed(
    () => store.teachers.filter((teacher) => teacher.status === 'active').length
  )

  const handleToggle = async (teacher: Teacher) => {
    const next = teacher.status === 'active' ? 'deactivated' : 'active'
    await withPending(teacher.id, async () => {
      try {
        await store.toggleTeacherStatus(teacher.id, teacher.status)
        // The old message said "deactivated" in both directions.
        showSuccess(`${teacher.name} ${next === 'active' ? 'activated' : 'deactivated'}`)
      } catch (err) {
        showError(err, `Failed to ${next === 'active' ? 'activate' : 'deactivate'} ${teacher.name}`)
      }
    })
  }

  const handleGenderChange = async (teacher: Teacher, gender: string) => {
    if (gender === teacher.gender) return
    await withPending(teacher.id, async () => {
      try {
        await store.updateTeacherGender(teacher.id, gender)
        showSuccess(`${teacher.name}'s gender updated`)
      } catch (err) {
        showError(err, `Failed to update ${teacher.name}'s gender`)
      }
    })
  }

  // ---- subject assignment ------------------------------------------------
  const subjectTarget = ref<Teacher | null>(null)
  const subjectDraft = ref<number[]>([])
  const isSavingSubjects = ref(false)

  const openSubjects = (teacher: Teacher) => {
    subjectTarget.value = teacher
    subjectDraft.value = subjectsFor(teacher.id).map((subject) => subject.id)
  }

  const toggleSubject = (subjectId: number) => {
    subjectDraft.value = subjectDraft.value.includes(subjectId)
      ? subjectDraft.value.filter((id) => id !== subjectId)
      : [...subjectDraft.value, subjectId]
  }

  const handleSaveSubjects = async () => {
    const teacher = subjectTarget.value
    if (!teacher || isSavingSubjects.value) return
    isSavingSubjects.value = true
    try {
      await teacherApi.setSubjects(teacher.id, subjectDraft.value)
      const next = new Map(subjectsByTeacher.value)
      next.set(
        teacher.id,
        allSubjects.value.filter((subject) => subjectDraft.value.includes(subject.id))
      )
      subjectsByTeacher.value = next
      showSuccess(`${teacher.name}'s subjects updated`)
      subjectTarget.value = null
    } catch (err) {
      showError(err, `Failed to update ${teacher.name}'s subjects`)
    } finally {
      isSavingSubjects.value = false
    }
  }

  const isAdding = ref(false)
  const isSaving = ref(false)
  const newName = ref('')
  const newEmail = ref('')
  const newGender = ref('male')

  const trimmedName = computed(() => newName.value.trim())
  const trimmedEmail = computed(() => newEmail.value.trim())

  // Stated rather than only disabling the button, so it is clear what is missing.
  const createBlocker = computed<string | null>(() => {
    if (!trimmedName.value) return 'Enter the teacher’s name.'
    if (!trimmedEmail.value) return 'Enter an email address.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail.value)) return 'That email looks invalid.'
    return null
  })

  const newSubjectIds = ref<number[]>([])

  const toggleNewSubject = (subjectId: number) => {
    newSubjectIds.value = newSubjectIds.value.includes(subjectId)
      ? newSubjectIds.value.filter((id) => id !== subjectId)
      : [...newSubjectIds.value, subjectId]
  }

  const openForm = () => {
    newName.value = ''
    newEmail.value = ''
    newGender.value = 'male'
    newSubjectIds.value = []
    isAdding.value = true
  }

  const handleCreate = async () => {
    if (createBlocker.value || isSaving.value) return
    isSaving.value = true
    try {
      // POST /teachers does not take subjects, so the assignment is a second
      // call. It is reported separately: the teacher does exist either way, and
      // saying "failed to add" after they were added would be wrong.
      const created = await store.createTeacher(
        trimmedName.value,
        trimmedEmail.value,
        newGender.value
      )
      const subjectIds = [...newSubjectIds.value]
      showSuccess(`${trimmedName.value} added`)
      isAdding.value = false

      if (created && subjectIds.length > 0) {
        try {
          await teacherApi.setSubjects(created.id, subjectIds)
          const next = new Map(subjectsByTeacher.value)
          next.set(
            created.id,
            allSubjects.value.filter((subject) => subjectIds.includes(subject.id))
          )
          subjectsByTeacher.value = next
        } catch (err) {
          showError(err, `${created.name} was added, but their subjects were not saved`)
        }
      }
    } catch (err) {
      showError(err, 'Failed to add teacher')
    } finally {
      isSaving.value = false
    }
  }
</script>

<template>
  <PageLayout
    title="Manage Teachers"
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
            aria-label="Search teachers"
            class="pl-9"
            placeholder="Search by name"
          />
        </div>

        <div class="flex gap-2">
          <RouterLink to="/form" class="flex-1 sm:flex-none">
            <Button variant="outline" class="w-full">Set availability</Button>
          </RouterLink>
          <Button class="flex-1 sm:flex-none" @click="openForm">
            <Plus />
            Add teacher
          </Button>
        </div>
      </div>

      <Dialog v-model:open="isAdding">
        <DialogContent>
          <DialogTitle>Add a teacher</DialogTitle>

          <form class="flex flex-col gap-4" novalidate @submit.prevent="handleCreate">
            <div class="flex flex-col gap-2">
              <Label for="new-name">Name</Label>
              <Input id="new-name" v-model="newName" placeholder="Teacher name" />
            </div>

            <div class="flex flex-col gap-2">
              <Label for="new-email">Email</Label>
              <Input
                id="new-email"
                v-model="newEmail"
                type="email"
                placeholder="teacher@example.com"
              />
            </div>

            <div class="flex flex-col gap-2">
              <Label>Subjects</Label>
              <p v-if="allSubjects.length === 0" class="text-muted-foreground text-sm">
                No subjects exist yet.
              </p>
              <div
                v-else
                class="border-border flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2"
              >
                <label
                  v-for="subject in allSubjects"
                  :key="subject.id"
                  class="hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    class="accent-primary size-4"
                    :checked="newSubjectIds.includes(subject.id)"
                    @change="toggleNewSubject(subject.id)"
                  />
                  {{ subject.name }}
                </label>
              </div>
              <p class="text-muted-foreground text-xs">
                A teacher with no subjects cannot be booked.
              </p>
            </div>

            <div class="flex flex-col gap-2">
              <Label for="new-gender">Gender</Label>
              <Select v-model="newGender">
                <SelectTrigger id="new-gender" class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in GENDERS" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
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
                  Add teacher
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        :open="subjectTarget !== null"
        @update:open="(open: boolean) => !open && (subjectTarget = null)"
      >
        <DialogContent>
          <div class="flex flex-col gap-1">
            <DialogTitle>Subjects for {{ subjectTarget?.name }}</DialogTitle>
            <DialogDescription>
              A teacher is only offered for the subjects ticked here.
            </DialogDescription>
          </div>

          <p v-if="allSubjects.length === 0" class="text-muted-foreground text-sm">
            No subjects exist yet.
          </p>
          <div
            v-else
            class="border-border flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border p-2"
          >
            <label
              v-for="subject in allSubjects"
              :key="subject.id"
              class="hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                class="accent-primary size-4"
                :checked="subjectDraft.includes(subject.id)"
                @change="toggleSubject(subject.id)"
              />
              {{ subject.name }}
            </label>
          </div>

          <div class="flex items-center justify-between gap-3">
            <p class="text-muted-foreground text-sm tabular-nums">
              {{ subjectDraft.length }} selected
            </p>
            <div class="flex gap-2">
              <Button variant="ghost" :disabled="isSavingSubjects" @click="subjectTarget = null">
                Cancel
              </Button>
              <Button :disabled="isSavingSubjects" @click="handleSaveSubjects">
                <Loader2 v-if="isSavingSubjects" class="animate-spin" />
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card v-if="isLoadingList && store.teachers.length === 0">
        <CardContent class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <Loader2 class="size-4 animate-spin" />
          Loading teachers…
        </CardContent>
      </Card>

      <Card v-else-if="loadError" class="border-destructive/30">
        <CardContent class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-destructive text-sm">{{ loadError }}</p>
          <Button variant="outline" @click="load">Retry</Button>
        </CardContent>
      </Card>

      <Card v-else-if="allTeachers.length === 0">
        <CardContent class="text-muted-foreground text-center text-sm"
          >No teachers yet.</CardContent
        >
      </Card>

      <Card v-else-if="teachers.length === 0">
        <CardContent class="text-muted-foreground text-center text-sm">
          No teachers match “{{ search }}”.
        </CardContent>
      </Card>

      <template v-else>
        <Card class="gap-0 overflow-hidden py-0">
          <CardContent class="divide-border divide-y px-0">
            <div
              v-for="teacher in teachers"
              :key="teacher.id"
              class="flex flex-col gap-3 px-4 py-3 transition-opacity sm:flex-row sm:items-center sm:gap-4 sm:px-6"
              :class="{ 'opacity-60': isPending(teacher.id) }"
            >
              <div class="flex min-w-0 flex-1 items-start gap-3">
                <span class="flex h-5 shrink-0 items-center" aria-hidden="true">
                  <span
                    class="size-2.5 rounded-full"
                    :class="teacher.status === 'active' ? 'bg-success' : 'bg-danger'"
                  ></span>
                </span>

                <div class="flex min-w-0 flex-col gap-1">
                  <span class="truncate text-sm font-medium">
                    {{ teacher.name }}
                    <span class="sr-only">
                      — {{ teacher.status === 'active' ? 'Active' : 'Deactivated' }}
                    </span>
                  </span>
                  <span class="text-muted-foreground truncate text-xs">{{ teacher.email }}</span>
                  <span v-if="subjectsFor(teacher.id).length" class="flex flex-wrap gap-1">
                    <Badge
                      v-for="subject in subjectsFor(teacher.id)"
                      :key="subject.id"
                      variant="secondary"
                      class="font-normal"
                    >
                      {{ subject.name }}
                    </Badge>
                  </span>
                  <span v-else class="text-muted-foreground text-xs italic">
                    No subjects — cannot be booked
                  </span>
                </div>
              </div>

              <div
                class="flex shrink-0 items-center justify-between gap-4 pl-5.5 sm:justify-end sm:pl-0"
              >
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="isPending(teacher.id)"
                  @click="openSubjects(teacher)"
                >
                  <BookOpen />
                  Subjects
                </Button>

                <Select
                  :model-value="teacher.gender"
                  :disabled="isPending(teacher.id)"
                  @update:model-value="handleGenderChange(teacher, String($event))"
                >
                  <SelectTrigger :aria-label="`Gender for ${teacher.name}`" class="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="option in GENDERS" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Switch
                  :model-value="teacher.status === 'active'"
                  :disabled="isPending(teacher.id)"
                  :aria-label="`${teacher.status === 'active' ? 'Deactivate' : 'Activate'} ${teacher.name}`"
                  @update:model-value="handleToggle(teacher)"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div
          class="text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs"
        >
          <p>
            Showing {{ teachers.length }} of {{ allTeachers.length }} teachers ·
            {{ activeCount }} active
          </p>

          <div class="flex items-center gap-4">
            <span class="flex items-center gap-1.5">
              <span class="bg-success size-2 rounded-full" aria-hidden="true"></span>
              Active
            </span>
            <span class="flex items-center gap-1.5">
              <span class="bg-danger size-2 rounded-full" aria-hidden="true"></span>
              Deactivated
            </span>
          </div>
        </div>
      </template>
    </div>
  </PageLayout>
</template>
