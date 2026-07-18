'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  NotificationChannel,
  NotificationEventType,
} from '@prisma/client'
import { CheckCheck, ExternalLink, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_EVENT_LABELS,
} from '../contracts/notification'
import { cn } from '@/lib/utils'

interface NotificationItem {
  id: string
  eventType: NotificationEventType
  title: string
  body: string
  targetUrl: string | null
  readAt: string | null
  createdAt: string
}

interface Preference {
  eventType: NotificationEventType
  channel: NotificationChannel
  enabled: boolean
}

const changed = () => window.dispatchEvent(new Event('notifications:changed'))

export function NotificationsPageClient({
  initialNotifications,
  initialPreferences,
}: {
  initialNotifications: NotificationItem[]
  initialPreferences: Preference[]
}) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [preferences, setPreferences] = useState(initialPreferences)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const visible = unreadOnly
    ? notifications.filter((notification) => !notification.readAt)
    : notifications
  const preferencesByEvent = useMemo(() =>
    Object.values(NotificationEventType).map((eventType) => ({
      eventType,
      values: Object.values(NotificationChannel).map((channel) =>
        preferences.find((item) =>
          item.eventType === eventType && item.channel === channel
        ) || { eventType, channel, enabled: channel === NotificationChannel.IN_APP }
      ),
    })), [preferences])

  async function mutate(url: string, init: RequestInit) {
    setMessage(null)
    const response = await fetch(url, init)
    if (!response.ok) {
      setMessage('Не удалось сохранить изменения')
      return false
    }
    return true
  }

  async function setRead(id: string, read: boolean) {
    if (!await mutate(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read }),
    })) return
    setNotifications((items) => items.map((item) =>
      item.id === id ? { ...item, readAt: read ? new Date().toISOString() : null } : item
    ))
    changed()
  }

  async function remove(id: string) {
    if (!await mutate(`/api/notifications/${id}`, { method: 'DELETE' })) return
    setNotifications((items) => items.filter((item) => item.id !== id))
    changed()
  }

  async function markAllRead() {
    if (!await mutate('/api/notifications/read-all', { method: 'POST' })) return
    const timestamp = new Date().toISOString()
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt || timestamp })))
    changed()
  }

  function togglePreference(eventType: NotificationEventType, channel: NotificationChannel) {
    setPreferences((items) => items.map((item) =>
      item.eventType === eventType && item.channel === channel
        ? { ...item, enabled: !item.enabled }
        : item
    ))
  }

  async function savePreferences() {
    setBusy(true)
    const response = await fetch('/api/notifications/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences }),
    })
    setBusy(false)
    setMessage(response.ok ? 'Настройки сохранены' : 'Не удалось сохранить настройки')
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Уведомления</h1>
        <p className="text-sm text-muted-foreground">Сроки, задачи и финансовые отклонения</p>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Входящие</CardTitle>
            <CardDescription>{notifications.filter((item) => !item.readAt).length} непрочитанных</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setUnreadOnly((value) => !value)}>
              {unreadOnly ? 'Показать все' : 'Только непрочитанные'}
            </Button>
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="mr-2 h-4 w-4" />Прочитать все
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {visible.length === 0 && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Новых уведомлений нет
            </div>
          )}
          {visible.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                'grid gap-2 rounded-lg border p-4 sm:grid-cols-[1fr_auto]',
                !notification.readAt && 'border-primary/30 bg-primary/5',
              )}
            >
              <button className="min-w-0 text-left" onClick={() => setRead(notification.id, !notification.readAt)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{notification.title}</span>
                  {!notification.readAt && <Badge>Новое</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(notification.createdAt).toLocaleString('ru-RU')}
                </p>
              </button>
              <div className="flex items-start gap-1">
                {notification.targetUrl && (
                  <Button asChild variant="ghost" size="icon">
                    <Link href={notification.targetUrl} aria-label="Открыть объект">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => remove(notification.id)} aria-label="Удалить">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Каналы уведомлений</CardTitle>
          <CardDescription>Почтовый канал подготовлен, но не отправляет письма без настроенного провайдера.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {preferencesByEvent.map(({ eventType, values }) => (
            <div key={eventType} className="grid gap-2 border-b pb-4 sm:grid-cols-[1fr_auto]">
              <span className="text-sm font-medium">{NOTIFICATION_EVENT_LABELS[eventType]}</span>
              <div className="flex flex-wrap gap-4">
                {values.map((preference) => (
                  <label key={preference.channel} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={preference.enabled}
                      onChange={() => togglePreference(eventType, preference.channel)}
                    />
                    {NOTIFICATION_CHANNEL_LABELS[preference.channel]}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Button className="justify-self-start" onClick={savePreferences} disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить настройки'}
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
