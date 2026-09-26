<script setup lang="ts">
  import { MousePointerClick } from '@lucide/vue'

  defineProps<{
    message: string
  }>()
</script>

<template>
  <!-- Fills the calendar's slot rather than overlaying one: with nothing chosen
       there is no calendar underneath to see through to. -->
  <div class="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-4">
    <MousePointerClick class="size-6" aria-hidden="true" />
    <p class="text-sm">{{ message }}</p>
  </div>
</template>
