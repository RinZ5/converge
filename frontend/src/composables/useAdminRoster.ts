import { ref, computed } from 'vue'
import { bookingApi } from '../services/bookingApi'
import { teacherApi } from '../services/teacherApi'
import { subjectApi } from '../services/subjectApi'
import { userApi } from '../services/userApi'
import {
  buildEntry,
  groupBookingsBy,
  matchesSearch,
  sortEntriesByName,
  subjectsFromBookings,
} from '../utils/roster'
import type { AuthUser, Booking, Subject, Teacher } from '../types'
import type { RosterEntry, RosterMode } from '../utils/roster'

export type { RosterEntry, RosterMode, RosterPerson, RosterSession } from '../utils/roster'

export interface RosterCounts {
  teachers: number
  students: number
  subjects: number
  classes: number
}

export function useAdminRoster() {
  const bookings = ref<Booking[]>([])
  const teachers = ref<Teacher[]>([])
  const students = ref<AuthUser[]>([])
  const subjects = ref<Subject[]>([])
  const teacherSubjects = ref<Map<number, string[]>>(new Map())

  const isLoading = ref(true)
  const loadError = ref('')

  const mode = ref<RosterMode>('teachers')
  const search = ref('')

  // Recomputed on every load rather than per entry, so one refresh cannot
  // straddle two different "now"s while deciding which session is next.
  const loadedAt = ref(Date.now())

  const loadTeacherSubjects = async (list: Subject[]): Promise<Map<number, string[]>> => {
    const map = new Map<number, string[]>()
    const results = await Promise.all(
      list.map(async (subject) => ({
        subject,
        taughtBy: await teacherApi.getBySubject(subject.id),
      }))
    )

    for (const { subject, taughtBy } of results) {
      for (const teacher of taughtBy) {
        const existing = map.get(teacher.id)
        if (existing) existing.push(subject.name)
        else map.set(teacher.id, [subject.name])
      }
    }

    for (const names of map.values()) names.sort((a, b) => a.localeCompare(b))
    return map
  }

  const load = async () => {
    isLoading.value = true
    loadError.value = ''
    try {
      const [bookingList, teacherList, studentList, subjectList] = await Promise.all([
        bookingApi.list(),
        teacherApi.getAll(),
        userApi.listStudents(),
        subjectApi.getAll(),
      ])

      bookings.value = bookingList
      teachers.value = teacherList
      students.value = studentList
      subjects.value = subjectList
      teacherSubjects.value = await loadTeacherSubjects(subjectList)
      loadedAt.value = Date.now()
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to load the roster'
    } finally {
      isLoading.value = false
    }
  }

  const allEntries = computed<RosterEntry[]>(() => {
    const now = loadedAt.value

    if (mode.value === 'teachers') {
      const byTeacher = groupBookingsBy(bookings.value, (b) => b.teacher_id)
      return sortEntriesByName(
        teachers.value.map((teacher) =>
          buildEntry(
            teacher.id,
            teacher.name,
            teacherSubjects.value.get(teacher.id) ?? [],
            byTeacher.get(teacher.id) ?? [],
            'teachers',
            now
          )
        )
      )
    }

    const byStudent = groupBookingsBy(bookings.value, (b) => b.student_id)
    return sortEntriesByName(
      students.value.map((student) => {
        const own = byStudent.get(student.id) ?? []
        return buildEntry(student.id, student.name, subjectsFromBookings(own), own, 'students', now)
      })
    )
  })

  const entries = computed<RosterEntry[]>(() =>
    allEntries.value.filter((entry) => matchesSearch(entry, search.value))
  )

  const counts = computed<RosterCounts>(() => ({
    teachers: teachers.value.length,
    students: students.value.length,
    subjects: subjects.value.length,
    classes: bookings.value.length,
  }))

  return {
    mode,
    search,
    entries,
    allEntries,
    counts,
    isLoading,
    loadError,
    load,
  }
}
