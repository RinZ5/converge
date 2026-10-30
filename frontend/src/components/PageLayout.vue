<script setup lang="ts">
  import AppNavbar from './AppNavbar.vue'
  import AppToasts from './AppToasts.vue'

  interface Props {
    title: string
    showCart?: boolean
    backTo?: string
    backLabel?: string
  }
  withDefaults(defineProps<Props>(), {
    showCart: true,
    backTo: undefined,
    backLabel: 'Back',
  })
</script>

<template>
  <div class="bg-background flex min-h-screen flex-col">
    <AppNavbar :title="title" :show-cart="showCart" :back-to="backTo" :back-label="backLabel" />
    <main class="w-full flex-1">
      <slot />
    </main>
    <AppToasts />
  </div>
</template>
