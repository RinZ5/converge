// Toast timeout guard.
//
// Regression under test: duration used to be optional and the timer was only
// scheduled `if (duration)`, so the 36 call sites that omitted it left a toast
// on screen forever — with no dismiss button at all on the success variant.
//
// Run: npm run check:notify

import assert from 'node:assert/strict'
import {
  DEFAULT_ERROR_MS,
  DEFAULT_SUCCESS_MS,
  useNotification,
} from '../src/composables/useNotification.ts'

const { successMessage, errorMessage, showSuccess, showError, dismissError, clearMessages } =
  useNotification()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Capture the delays handed to setTimeout so the defaults can be asserted
// without the test sitting through them.
const scheduled: number[] = []
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
  scheduled.push(ms ?? 0)
  return realSetTimeout(fn, ms, ...(rest as []))
}) as typeof globalThis.setTimeout

// --- the bug: omitting duration must still schedule a dismissal ------------
{
  scheduled.length = 0
  showSuccess('saved')
  assert.equal(successMessage.value, 'saved')
  assert.deepEqual(scheduled, [DEFAULT_SUCCESS_MS], 'success without duration still auto-dismisses')

  scheduled.length = 0
  showError(null, 'boom')
  assert.equal(errorMessage.value, 'boom')
  assert.deepEqual(scheduled, [DEFAULT_ERROR_MS], 'error without duration still auto-dismisses')

  assert.ok(DEFAULT_SUCCESS_MS > 0 && DEFAULT_ERROR_MS > 0, 'defaults must be positive')
  assert.ok(DEFAULT_ERROR_MS > DEFAULT_SUCCESS_MS, 'errors stay up longer than successes')
  clearMessages()
}

// --- an explicit duration is still honoured, and actually fires ------------
{
  showSuccess('quick', 40)
  assert.equal(successMessage.value, 'quick')
  await sleep(90)
  assert.equal(successMessage.value, '', 'explicit duration clears the message')
}

// --- duration <= 0 is the opt-in sticky case ------------------------------
{
  scheduled.length = 0
  showError(null, 'sticky', 0)
  assert.deepEqual(scheduled, [], 'duration 0 schedules nothing')
  await sleep(40)
  assert.equal(errorMessage.value, 'sticky', 'sticky toast stays up')
  dismissError()
  assert.equal(errorMessage.value, '', 'and can still be dismissed')
}

// --- a pending timer must not blank a newer toast -------------------------
{
  showError(null, 'first', 40)
  dismissError()
  showSuccess('second', 300)
  await sleep(90) // the 40ms error timer would have fired by now
  assert.equal(
    successMessage.value,
    'second',
    'dismissed toast’s timer does not clear the next one'
  )
  clearMessages()
}

// --- replacing a toast cancels the previous timer -------------------------
{
  showSuccess('old', 40)
  showSuccess('new', 300)
  await sleep(90)
  assert.equal(successMessage.value, 'new', 'the replaced toast’s timer was cancelled')
  clearMessages()
}

// --- the two channels are mutually exclusive ------------------------------
{
  showError(null, 'bad', 300)
  showSuccess('good', 300)
  assert.equal(errorMessage.value, '', 'a success clears a showing error')
  assert.equal(successMessage.value, 'good')
  clearMessages()
}

globalThis.setTimeout = realSetTimeout
console.log('✓ toasts always schedule their own dismissal')
