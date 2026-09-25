<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { ArrowLeft, ArrowRight, Loader2, ShoppingCart, X } from '@lucide/vue'
  import PageLayout from '../components/PageLayout.vue'
  import { useCart } from '../composables/useCart'
  import { useNotification } from '../composables/useNotification'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
  import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

  const router = useRouter()
  const { cartItems, isConfirming, loadCart, removeCartItem, clearCart, confirmBookings } =
    useCart()
  const { errorMessage } = useNotification()

  const showClearConfirm = ref(false)

  onMounted(loadCart)

  const goBack = () => router.push('/booking')

  const handleClearAll = () => {
    if (cartItems.value.length === 0) return
    showClearConfirm.value = true
  }

  const confirmClearAll = () => {
    clearCart()
    showClearConfirm.value = false
  }

  const handleSubmit = async () => {
    await confirmBookings()
    if (!errorMessage.value) {
      setTimeout(() => router.push('/booking'), 2000)
    }
  }

  const dayFormat = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const timeFormat = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const formatWhen = (startTime: string, endTime: string): string => {
    const start = new Date(startTime)
    if (Number.isNaN(start.getTime())) return 'Unknown time'
    const end = new Date(endTime)
    const until = Number.isNaN(end.getTime()) ? '' : `–${timeFormat.format(end)}`
    return `${dayFormat.format(start)} · ${timeFormat.format(start)}${until}`
  }

  const countLabel = computed(
    () => `${cartItems.value.length} session${cartItems.value.length === 1 ? '' : 's'}`
  )
</script>

<template>
  <PageLayout title="Confirm Bookings">
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      <Card v-if="cartItems.length === 0 && !isConfirming">
        <CardContent class="flex flex-col items-center gap-3 py-10 text-center">
          <span class="bg-muted text-muted-foreground rounded-lg p-3">
            <ShoppingCart class="size-6" />
          </span>
          <p class="text-sm font-medium">Your cart is empty</p>
          <p class="text-muted-foreground text-sm">Add sessions to begin booking.</p>
          <Button class="mt-1" @click="goBack">
            Browse sessions
            <ArrowRight />
          </Button>
        </CardContent>
      </Card>

      <template v-else>
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium">{{ countLabel }}</p>
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive"
            :disabled="isConfirming"
            @click="handleClearAll"
          >
            Clear all
          </Button>
        </div>

        <Card class="gap-0 overflow-hidden py-0">
          <CardContent class="divide-border divide-y px-0">
            <div
              v-for="item in cartItems"
              :key="item.id"
              class="flex items-start gap-3 px-4 py-3 sm:px-6"
            >
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="text-sm font-medium">{{ item.subject_name }}</span>
                <span class="text-muted-foreground text-xs tabular-nums">
                  {{ formatWhen(item.start_time, item.end_time) }}
                </span>
                <span class="text-muted-foreground text-xs">
                  {{ item.student_name }} · {{ item.teacher_name }} · {{ item.branch_name }}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground hover:text-destructive shrink-0"
                :aria-label="`Remove ${item.subject_name} on ${formatWhen(item.start_time, item.end_time)}`"
                :disabled="isConfirming"
                @click="removeCartItem(item.id)"
              >
                <X />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div class="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" class="sm:flex-1" :disabled="isConfirming" @click="goBack">
            <ArrowLeft />
            Add more
          </Button>
          <Button
            class="sm:flex-1"
            :disabled="isConfirming || cartItems.length === 0"
            @click="handleSubmit"
          >
            <Loader2 v-if="isConfirming" class="animate-spin" />
            {{ isConfirming ? 'Confirming…' : `Confirm ${countLabel}` }}
          </Button>
        </div>
      </template>
    </div>

    <Dialog v-model:open="showClearConfirm">
      <DialogContent class="max-w-sm">
        <div class="flex flex-col gap-1">
          <DialogTitle>Clear all sessions?</DialogTitle>
          <DialogDescription>
            This removes every session from your cart. It cannot be undone.
          </DialogDescription>
        </div>

        <div class="flex justify-end gap-2">
          <Button variant="ghost" @click="showClearConfirm = false">Cancel</Button>
          <Button variant="destructive" @click="confirmClearAll">Clear all</Button>
        </div>
      </DialogContent>
    </Dialog>
  </PageLayout>
</template>
