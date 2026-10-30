<script setup lang="ts">
  import { AlertCircle, CheckCircle2, X } from '@lucide/vue'
  import { useNotification } from '../composables/useNotification'
  import { Button } from '@/components/ui/button'

  const { successMessage, errorMessage, dismissError } = useNotification()
</script>

<template>
  <div
    class="pointer-events-none fixed right-4 bottom-4 z-100 flex flex-col gap-2 max-sm:left-4 sm:right-8 sm:bottom-8"
    aria-live="polite"
  >
    <div
      v-if="successMessage"
      role="status"
      class="bg-success text-on-accent pointer-events-auto flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm shadow-lg"
    >
      <CheckCircle2 class="size-4 shrink-0" aria-hidden="true" />
      <span class="min-w-0">{{ successMessage }}</span>
    </div>

    <div
      v-if="errorMessage"
      role="alert"
      class="bg-danger text-on-accent pointer-events-auto flex items-center gap-2.5 rounded-lg py-3 pr-2 pl-4 text-sm shadow-lg"
    >
      <AlertCircle class="size-4 shrink-0" aria-hidden="true" />
      <span class="min-w-0">{{ errorMessage }}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        class="text-on-accent/80 hover:text-on-accent ml-1 shrink-0 hover:bg-transparent"
        aria-label="Dismiss message"
        @click="dismissError"
      >
        <X />
      </Button>
    </div>
  </div>
</template>
