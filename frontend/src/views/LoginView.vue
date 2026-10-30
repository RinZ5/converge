<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useAuthStore } from '../stores/authStore'
  import { loginRequestSchema } from '../schemas/auth'
  import { getErrorMessage } from '../utils/errorHandler'
  import { homeFor, safeRedirect } from '../router/guard'
  import { Loader2 } from '@lucide/vue'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'

  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  const name = ref('')
  const password = ref('')
  const fieldError = ref('')
  const formError = ref('')
  const isSubmitting = ref(false)

  const canSubmit = computed(
    () => !isSubmitting.value && name.value.trim() !== '' && password.value !== ''
  )

  const handleSubmit = async () => {
    fieldError.value = ''
    formError.value = ''

    const parsed = loginRequestSchema.safeParse({ name: name.value, password: password.value })
    if (!parsed.success) {
      fieldError.value = parsed.error.issues[0]?.message ?? 'Please check your details'
      return
    }

    isSubmitting.value = true
    try {
      const session = await auth.login(parsed.data.name, parsed.data.password)
      const fallback = homeFor(session.user.role)
      await router.replace(safeRedirect(route.query.redirect, fallback))
    } catch (err) {
      formError.value = getErrorMessage(err, 'Unable to sign in. Please try again.')
      password.value = ''
    } finally {
      isSubmitting.value = false
    }
  }
</script>

<template>
  <div class="bg-background flex min-h-screen items-center justify-center px-4 py-10">
    <div class="flex w-full max-w-sm flex-col gap-6">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2.5">
          <span class="bg-primary h-6 w-1 shrink-0 rounded-full" aria-hidden="true"></span>
          <h1 class="text-2xl font-semibold tracking-tight">Converge</h1>
        </div>
        <p class="text-muted-foreground text-sm">Sign in to continue</p>
      </div>

      <Card>
        <CardContent>
          <form class="flex flex-col gap-4" novalidate @submit.prevent="handleSubmit">
            <div class="flex flex-col gap-2">
              <Label for="login-name">Username</Label>
              <Input
                id="login-name"
                v-model="name"
                autocomplete="username"
                :disabled="isSubmitting"
              />
            </div>

            <div class="flex flex-col gap-2">
              <Label for="login-password">Password</Label>
              <Input
                id="login-password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                :disabled="isSubmitting"
              />
            </div>

            <p v-if="fieldError || formError" class="text-destructive text-sm" role="alert">
              {{ fieldError || formError }}
            </p>

            <Button type="submit" class="w-full" :disabled="!canSubmit">
              <Loader2 v-if="isSubmitting" class="animate-spin" />
              {{ isSubmitting ? 'Signing in…' : 'Sign in' }}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p class="text-muted-foreground px-1 text-xs">
        Accounts are created by an administrator. Contact your admin if you need access.
      </p>
    </div>
  </div>
</template>
