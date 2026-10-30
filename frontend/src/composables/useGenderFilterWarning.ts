import { computed, watch } from 'vue'
import { useBooking } from './useBooking'
import { useNotification } from './useNotification'
import { genderLabel } from '../utils/gender'

/**
 * The gender preference emptied a teacher list that was not empty.
 *
 * Both booking paths can land there, and both mark the control that caused it.
 * Only one of them also raises a toast, which is why `notify` is a required
 * argument rather than a default: the manual path replaces the whole calendar
 * with the reason, so a toast on top of it says the same thing twice, while the
 * suggestion path shows only a muted line beside a disabled button, which is
 * easy to walk straight past.
 *
 * Deliberately NOT raised when the subject has no teachers at all: that is not
 * the reader's doing, it is true the moment they pick the subject, and the
 * gender control is not the one at fault. Each path states that case in place.
 */
export function useGenderFilterWarning(options: { notify: boolean }) {
  const { filteredTeachers, genderFilteredTeachers, isLoadingTeachers, requiredGender } =
    useBooking()
  const { showError } = useNotification()

  const isEmptyFromGenderFilter = computed(
    () =>
      !isLoadingTeachers.value &&
      requiredGender.value !== null &&
      filteredTeachers.value.length > 0 &&
      genderFilteredTeachers.value.length === 0
  )

  // requiredGender is watched alongside the flag, not just the flag: moving from
  // one empty preference straight to another leaves the flag true throughout, so
  // watching it alone would say nothing about the second choice. A subject change
  // needs no such help -- it puts the list back into loading, which drops the flag
  // and raises it again.
  if (options.notify) {
    watch([isEmptyFromGenderFilter, requiredGender], ([isEmpty, gender]) => {
      if (!isEmpty || !gender) return
      showError(null, `No ${genderLabel(gender)} teacher teaches this subject`)
    })
  }

  return { isEmptyFromGenderFilter }
}
