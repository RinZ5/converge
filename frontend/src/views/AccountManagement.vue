<script setup lang="ts">
  import { computed, ref, onMounted } from 'vue'
  import { ChevronDown, Loader2, Plus, Search, X } from '@lucide/vue'
  import PageLayout from '../components/PageLayout.vue'
  import ManagementNav from '../components/ManagementNav.vue'
  import { userApi } from '../services/userApi'
  import { authApi } from '../services/authApi'
  import { useNotification } from '../composables/useNotification'
  import { registerRequestSchema } from '../schemas/auth'
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
  import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import type { AuthUser, ParentWithStudents, Role } from '../types'

  const { showSuccess, showError } = useNotification()

  type Tab = 'students' | 'parents'
  const TABS: { value: Tab; label: string }[] = [
    { value: 'students', label: 'Students' },
    { value: 'parents', label: 'Parents' },
  ]

  // Admin accounts are not created from this screen -- the first admin comes
  // from the seed, and handing out admin from a roster page is not the intent.
  // Typing the form to the roles the UI offers keeps the two from drifting.
  type CreatableRole = Exclude<Role, 'admin'>
  const ROLES: { value: CreatableRole; label: string }[] = [
    { value: 'student', label: 'Student' },
    { value: 'parent', label: 'Parent' },
  ]

  const tab = ref<Tab>('students')
  const search = ref('')

  const students = ref<AuthUser[]>([])
  const parents = ref<ParentWithStudents[]>([])
  const isLoading = ref(true)
  const loadError = ref('')

  const load = async () => {
    isLoading.value = true
    loadError.value = ''
    try {
      const [nextStudents, nextParents] = await Promise.all([
        userApi.listStudents(),
        userApi.listParents(),
      ])
      students.value = nextStudents
      parents.value = nextParents
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to load accounts'
    } finally {
      isLoading.value = false
    }
  }

  onMounted(load)

  const matches = (value: string) => value.toLowerCase().includes(search.value.trim().toLowerCase())

  // A student row alone is just a name, so it carries the guardians it is linked
  // to -- the one fact about a student this page actually holds.
  const guardiansOf = (studentId: number): string[] =>
    parents.value
      .filter((parent) => parent.students.some((s) => s.id === studentId))
      .map((parent) => parent.name)
      .sort((a, b) => a.localeCompare(b))

  const visibleStudents = computed(() =>
    students.value.filter(
      (student) => matches(student.name) || guardiansOf(student.id).some(matches)
    )
  )

  const visibleParents = computed(() =>
    parents.value.filter(
      (parent) => matches(parent.name) || parent.students.some((s) => matches(s.name))
    )
  )

  const expandedParentId = ref<number | null>(null)
  const linkDraft = ref<Record<number, string>>({})
  const busyParentId = ref<number | null>(null)

  const toggleParent = (parentId: number) => {
    expandedParentId.value = expandedParentId.value === parentId ? null : parentId
  }

  const unlinkedStudentsFor = (parent: ParentWithStudents) => {
    const linked = new Set(parent.students.map((s) => s.id))
    return students.value.filter((s) => !linked.has(s.id))
  }

  const handleLink = async (parent: ParentWithStudents) => {
    const studentId = Number(linkDraft.value[parent.id] ?? '')
    if (!Number.isInteger(studentId) || studentId <= 0) return

    busyParentId.value = parent.id
    try {
      await userApi.linkStudent(parent.id, studentId)
      const student = students.value.find((s) => s.id === studentId)
      if (student) parent.students.push(student)
      linkDraft.value[parent.id] = ''
      showSuccess(`Linked ${student?.name ?? 'student'} to ${parent.name}`)
    } catch (err) {
      showError(err, `Failed to link a student to ${parent.name}`)
    } finally {
      busyParentId.value = null
    }
  }

  // A parent with no students cannot see anything, and the API requires at least
  // one at registration, so the last link is not removable here.
  const handleUnlink = async (parent: ParentWithStudents, student: AuthUser) => {
    if (parent.students.length <= 1) {
      showError(null, `${parent.name} must stay linked to at least one student`)
      return
    }

    busyParentId.value = parent.id
    try {
      await userApi.unlinkStudent(parent.id, student.id)
      parent.students = parent.students.filter((s) => s.id !== student.id)
      showSuccess(`Unlinked ${student.name} from ${parent.name}`)
    } catch (err) {
      showError(err, `Failed to unlink ${student.name}`)
    } finally {
      busyParentId.value = null
    }
  }

  // ---- create account -----------------------------------------------------
  const isCreateOpen = ref(false)
  const isSubmitting = ref(false)
  const formError = ref('')
  const form = ref({
    name: '',
    password: '',
    role: 'student' as CreatableRole,
    studentIds: [] as number[],
  })

  const openCreate = () => {
    form.value = { name: '', password: '', role: 'student', studentIds: [] }
    formError.value = ''
    isCreateOpen.value = true
  }

  const toggleFormStudent = (id: number) => {
    const current = form.value.studentIds
    form.value.studentIds = current.includes(id)
      ? current.filter((s) => s !== id)
      : [...current, id]
  }

  // registerRequestSchema is the single source of truth for what is valid; the
  // blocker only turns its first complaint into a sentence shown up front.
  const createPayload = computed(() =>
    registerRequestSchema.safeParse({
      name: form.value.name,
      password: form.value.password,
      role: form.value.role,
      student_ids: form.value.role === 'parent' ? form.value.studentIds : undefined,
    })
  )

  const createBlocker = computed<string | null>(() =>
    createPayload.value.success
      ? null
      : (createPayload.value.error.issues[0]?.message ?? 'Please check the form')
  )

  const handleCreate = async () => {
    const parsed = createPayload.value
    if (!parsed.success || isSubmitting.value) {
      formError.value = createBlocker.value ?? ''
      return
    }

    formError.value = ''
    isSubmitting.value = true
    try {
      const created = await authApi.register(parsed.data)
      showSuccess(`${created.name} created as ${created.role}`)
      isCreateOpen.value = false
      await load()
    } catch (err) {
      formError.value = err instanceof Error ? err.message : 'Failed to create account'
    } finally {
      isSubmitting.value = false
    }
  }
</script>

<template>
  <PageLayout
    title="Manage Accounts"
    :show-cart="false"
    back-to="/dashboard"
    back-label="Dashboard"
  >
    <ManagementNav />

    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        <div class="bg-muted inline-flex w-fit shrink-0 rounded-md p-0.5" role="tablist">
          <button
            v-for="option in TABS"
            :key="option.value"
            type="button"
            role="tab"
            :aria-selected="tab === option.value"
            class="focus-visible:ring-ring/50 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3"
            :class="
              tab === option.value
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="tab = option.value"
          >
            {{ option.label }}
            <span class="tabular-nums opacity-60">
              {{ option.value === 'students' ? students.length : parents.length }}
            </span>
          </button>
        </div>

        <div class="relative flex-1">
          <Search
            class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            v-model="search"
            type="search"
            aria-label="Search accounts"
            class="pl-9"
            placeholder="Search by name"
          />
        </div>

        <Button @click="openCreate">
          <Plus />
          Create account
        </Button>
      </div>

      <Card v-if="isLoading && students.length === 0 && parents.length === 0">
        <CardContent class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <Loader2 class="size-4 animate-spin" />
          Loading accounts…
        </CardContent>
      </Card>

      <Card v-else-if="loadError" class="border-destructive/30">
        <CardContent class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-destructive text-sm">{{ loadError }}</p>
          <Button variant="outline" @click="load">Retry</Button>
        </CardContent>
      </Card>

      <!-- Students -->
      <template v-else-if="tab === 'students'">
        <Card v-if="students.length === 0">
          <CardContent class="text-muted-foreground text-center text-sm">
            No student accounts yet.
          </CardContent>
        </Card>

        <Card v-else-if="visibleStudents.length === 0">
          <CardContent class="text-muted-foreground text-center text-sm">
            No students match “{{ search }}”.
          </CardContent>
        </Card>

        <template v-else>
          <Card class="gap-0 overflow-hidden py-0">
            <CardContent class="divide-border divide-y px-0">
              <div
                v-for="student in visibleStudents"
                :key="student.id"
                class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6"
              >
                <span class="text-sm font-medium">{{ student.name }}</span>
                <span class="text-muted-foreground text-xs">
                  <template v-if="guardiansOf(student.id).length">
                    Guardian: {{ guardiansOf(student.id).join(', ') }}
                  </template>
                  <template v-else>No guardian linked</template>
                </span>
              </div>
            </CardContent>
          </Card>

          <p class="text-muted-foreground px-1 text-xs">
            Showing {{ visibleStudents.length }} of {{ students.length }} students
          </p>
        </template>
      </template>

      <!-- Parents -->
      <template v-else>
        <Card v-if="parents.length === 0">
          <CardContent class="text-muted-foreground text-center text-sm">
            No parent accounts yet.
          </CardContent>
        </Card>

        <Card v-else-if="visibleParents.length === 0">
          <CardContent class="text-muted-foreground text-center text-sm">
            No parents match “{{ search }}”.
          </CardContent>
        </Card>

        <template v-else>
          <Card class="gap-0 overflow-hidden py-0">
            <CardContent class="divide-border divide-y px-0">
              <div v-for="parent in visibleParents" :key="parent.id">
                <button
                  type="button"
                  class="hover:bg-muted/40 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-6"
                  :aria-expanded="expandedParentId === parent.id"
                  @click="toggleParent(parent.id)"
                >
                  <ChevronDown
                    class="text-muted-foreground size-4 shrink-0 transition-transform"
                    :class="{ 'rotate-180': expandedParentId === parent.id }"
                  />
                  <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ parent.name }}</span>
                  <span class="text-muted-foreground shrink-0 text-sm tabular-nums">
                    {{ parent.students.length }}
                    {{ parent.students.length === 1 ? 'student' : 'students' }}
                  </span>
                </button>

                <div
                  v-if="expandedParentId === parent.id"
                  class="border-border bg-muted/20 flex flex-col gap-2 border-t px-4 py-3 sm:px-6"
                  :class="{ 'opacity-60': busyParentId === parent.id }"
                >
                  <div
                    v-for="student in parent.students"
                    :key="student.id"
                    class="bg-card border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <span class="truncate text-sm">{{ student.name }}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="text-destructive hover:text-destructive"
                      :disabled="busyParentId === parent.id || parent.students.length <= 1"
                      :title="
                        parent.students.length <= 1
                          ? 'A parent must stay linked to at least one student'
                          : undefined
                      "
                      @click="handleUnlink(parent, student)"
                    >
                      <X />
                      Unlink
                    </Button>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <Select
                      :model-value="linkDraft[parent.id] ?? ''"
                      :disabled="
                        busyParentId === parent.id || unlinkedStudentsFor(parent).length === 0
                      "
                      @update:model-value="linkDraft[parent.id] = String($event)"
                    >
                      <SelectTrigger :aria-label="`Link a student to ${parent.name}`" class="w-56">
                        <SelectValue
                          :placeholder="
                            unlinkedStudentsFor(parent).length === 0
                              ? 'All students linked'
                              : 'Select a student'
                          "
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="student in unlinkedStudentsFor(parent)"
                          :key="student.id"
                          :value="String(student.id)"
                        >
                          {{ student.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      size="sm"
                      :disabled="busyParentId === parent.id || !linkDraft[parent.id]"
                      @click="handleLink(parent)"
                    >
                      <Loader2 v-if="busyParentId === parent.id" class="animate-spin" />
                      Link
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <p class="text-muted-foreground px-1 text-xs">
            Showing {{ visibleParents.length }} of {{ parents.length }} parents
          </p>
        </template>
      </template>
    </div>

    <Dialog v-model:open="isCreateOpen">
      <DialogContent>
        <div class="flex flex-col gap-1">
          <DialogTitle>Create account</DialogTitle>
          <DialogDescription>
            Accounts are created here only — there is no self-registration.
          </DialogDescription>
        </div>

        <form class="flex flex-col gap-4" novalidate @submit.prevent="handleCreate">
          <div class="flex flex-col gap-2">
            <Label for="account-name">Username</Label>
            <Input id="account-name" v-model="form.name" autocomplete="off" />
          </div>

          <div class="flex flex-col gap-2">
            <Label for="account-password">Password</Label>
            <Input
              id="account-password"
              v-model="form.password"
              type="password"
              autocomplete="new-password"
            />
          </div>

          <div class="flex flex-col gap-2">
            <Label for="account-role">Role</Label>
            <Select
              :model-value="form.role"
              @update:model-value="form.role = String($event) as CreatableRole"
            >
              <SelectTrigger id="account-role" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in ROLES" :key="option.value" :value="option.value">
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="form.role === 'parent'" class="flex flex-col gap-2">
            <Label>Linked students (at least one)</Label>
            <p v-if="students.length === 0" class="text-muted-foreground text-sm">
              Create a student account first.
            </p>
            <div
              v-else
              class="border-border flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2"
            >
              <label
                v-for="student in students"
                :key="student.id"
                class="hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  class="accent-primary size-4"
                  :checked="form.studentIds.includes(student.id)"
                  @change="toggleFormStudent(student.id)"
                />
                {{ student.name }}
              </label>
            </div>
            <div v-if="form.studentIds.length" class="flex flex-wrap gap-1">
              <Badge
                v-for="id in form.studentIds"
                :key="id"
                variant="secondary"
                class="font-normal"
              >
                {{ students.find((s) => s.id === id)?.name ?? `#${id}` }}
              </Badge>
            </div>
          </div>

          <p v-if="formError" class="text-destructive text-sm" role="alert">{{ formError }}</p>

          <div class="flex items-center justify-between gap-3">
            <p v-if="createBlocker" class="text-muted-foreground text-sm">{{ createBlocker }}</p>
            <span v-else></span>
            <div class="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                :disabled="isSubmitting"
                @click="isCreateOpen = false"
              >
                Cancel
              </Button>
              <Button type="submit" :disabled="createBlocker !== null || isSubmitting">
                <Loader2 v-if="isSubmitting" class="animate-spin" />
                Create
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </PageLayout>
</template>
