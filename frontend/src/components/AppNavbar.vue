<script setup lang="ts">
  import { computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { ChevronLeft, ShoppingCart } from '@lucide/vue'
  import { useCart } from '../composables/useCart'
  import { useAuthStore } from '../stores/authStore'
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'

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

  const router = useRouter()
  const { cartItems, loadCart } = useCart()
  const auth = useAuthStore()

  const cartCount = computed(() => cartItems.value.length)

  const goToCart = () => router.push('/booking/confirm')

  const handleLogout = () => {
    auth.logout()
    loadCart()
    router.replace('/login')
  }

  onMounted(loadCart)
</script>

<template>
  <header class="bg-card border-border sticky top-0 z-50 border-b">
    <div class="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <RouterLink v-if="backTo" :to="backTo" :aria-label="backLabel">
          <Button variant="outline" size="sm">
            <ChevronLeft />
            <span class="max-sm:sr-only">{{ backLabel }}</span>
          </Button>
        </RouterLink>

        <!-- The bar carries the brand colour into every page; the title alone
             sat on white with nothing to anchor it. -->
        <span class="bg-primary h-5 w-1 shrink-0 rounded-full" aria-hidden="true"></span>

        <h1 class="truncate text-base font-semibold tracking-tight sm:text-lg">{{ title }}</h1>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Button
          v-if="showCart"
          variant="ghost"
          size="icon-sm"
          class="relative"
          aria-label="View cart"
          @click="goToCart"
        >
          <ShoppingCart />
          <!-- The count is the page's one attention signal, so it wears the
               10% accent with dark ink rather than a red alert badge. -->
          <Badge
            v-if="cartCount > 0"
            class="bg-accent-amber text-on-amber ring-card absolute -top-1 -right-1 h-4 min-w-4 justify-center px-1 text-[0.625rem] tabular-nums ring-2"
          >
            {{ cartCount > 9 ? '9+' : cartCount }}
          </Badge>
        </Button>

        <template v-if="auth.isAuthenticated">
          <span class="hidden items-center gap-2 text-sm sm:flex">
            <span class="max-w-32 truncate font-medium">{{ auth.user?.name }}</span>
            <Badge variant="secondary" class="font-normal capitalize">{{ auth.user?.role }}</Badge>
          </span>
          <Button variant="outline" size="sm" @click="handleLogout">Sign out</Button>
        </template>
        <RouterLink v-else to="/login">
          <Button variant="outline" size="sm">Sign in</Button>
        </RouterLink>
      </div>
    </div>
  </header>
</template>
