import { ref } from 'vue'

// Toasts used to be scheduled only when the caller passed a duration, so the 36
// call sites that omitted it produced a toast that never went away — and the
// success toast has no dismiss button, so it stayed until a navigation. The
// duration now defaults instead of being optional-and-ignored.
//
// Errors get longer than successes: they carry more text to read and usually
// describe something the user has to act on.
export const DEFAULT_SUCCESS_MS = 3000
export const DEFAULT_ERROR_MS = 6000

const successMessage = ref('')
const errorMessage = ref('')

let successTimer: ReturnType<typeof setTimeout> | undefined
let errorTimer: ReturnType<typeof setTimeout> | undefined

const clearSuccessTimer = () => {
  clearTimeout(successTimer)
  successTimer = undefined
}

const clearErrorTimer = () => {
  clearTimeout(errorTimer)
  errorTimer = undefined
}

// duration <= 0 keeps the toast up until it is dismissed or replaced. It is an
// explicit opt-in, never the result of forgetting the argument.
const showSuccess = (message: string, duration: number = DEFAULT_SUCCESS_MS) => {
  clearSuccessTimer()
  clearErrorTimer()
  errorMessage.value = ''
  successMessage.value = message
  if (duration > 0) {
    successTimer = setTimeout(() => {
      successMessage.value = ''
      successTimer = undefined
    }, duration)
  }
}

const showError = (error: unknown, message: string, duration: number = DEFAULT_ERROR_MS) => {
  if (error) console.error(message, error)
  clearErrorTimer()
  clearSuccessTimer()
  successMessage.value = ''
  errorMessage.value = message
  if (duration > 0) {
    errorTimer = setTimeout(() => {
      errorMessage.value = ''
      errorTimer = undefined
    }, duration)
  }
}

// Dismissing has to cancel the pending timer too, otherwise the timer outlives
// the toast it was scheduled for and can blank a newer message.
const dismissSuccess = () => {
  clearSuccessTimer()
  successMessage.value = ''
}

const dismissError = () => {
  clearErrorTimer()
  errorMessage.value = ''
}

const clearMessages = () => {
  clearSuccessTimer()
  clearErrorTimer()
  successMessage.value = ''
  errorMessage.value = ''
}

export function useNotification() {
  return {
    successMessage,
    errorMessage,
    showSuccess,
    showError,
    dismissSuccess,
    dismissError,
    clearMessages,
  }
}
