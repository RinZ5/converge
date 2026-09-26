import type { Teacher } from '../types'

export type TeacherGender = Teacher['gender']

// The display form of a gender, for sentences. The Select options carry their
// own labels because they are literal markup; this exists because two empty
// states have to name the filter that emptied them, and a second copy of the
// map is how "LGBTQ+" ends up rendered as "lgbtq+" in one of them later.
const GENDER_LABELS: Record<TeacherGender, string> = {
  male: 'male',
  female: 'female',
  'lgbtq+': 'LGBTQ+',
}

export const genderLabel = (gender: TeacherGender): string => GENDER_LABELS[gender]
