<script setup lang="ts">
  import { MousePointerClick } from '@lucide/vue'

  defineProps<{
    message: string
    /** One line on what picking that thing will show. Without it the empty
     *  state states a requirement but never says what it is a requirement for. */
    hint?: string
  }>()
</script>

<template>
  <!-- Fills the calendar's slot rather than overlaying one: with nothing chosen
       there is no calendar underneath to see through to. It therefore has to
       carry the calendar's own surface -- card background, border, radius and
       shadow -- or the placeholder reads as a hole in the page instead of as
       the shape the calendar is about to take. -->
  <div
    class="bg-card border-border flex h-full flex-col items-center justify-center gap-3 rounded-2xl border px-6 text-center shadow-[var(--shadow-card)]"
  >
    <span
      class="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-full"
    >
      <MousePointerClick class="size-5" aria-hidden="true" />
    </span>
    <div class="flex flex-col gap-1">
      <p class="text-sm font-medium">{{ message }}</p>
      <p v-if="hint" class="text-muted-foreground max-w-xs text-xs">{{ hint }}</p>
    </div>
  </div>
</template>
