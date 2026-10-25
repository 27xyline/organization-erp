'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

export function NotificationBell({ className }: { className?: string }) {
  const [count, setCount] = useState(0)
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/unread-count', { cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json()
      setCount(Math.max(0, Number(payload.data?.count) || 0))
    } catch {
      // The bell is non-critical; the inbox still exposes request errors.
    }
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0)
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('notifications:changed', refresh)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
      window.removeEventListener('notifications:changed', refresh)
    }
  }, [refresh])

  return (
    <Link
      href="/notifications"
      aria-label={count ? `Уведомления: ${count} непрочитанных` : 'Уведомления'}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent',
        className,
      )}
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[11px] leading-5 text-destructive-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
