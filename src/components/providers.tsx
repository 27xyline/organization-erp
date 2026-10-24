'use client'

import { ToastProvider } from '@/components/ui/toast'
import '@/lib/auth/csrf-fetch'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>{children}</ToastProvider>
  )
}
