import { NotificationChannel, NotificationEventType } from '@prisma/client'
import { z } from 'zod'

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true')

export const notificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: booleanQuery.default('false'),
})

export const notificationStateSchema = z.object({
  read: z.boolean(),
}).strict()

export const notificationPreferencesSchema = z.object({
  preferences: z.array(z.object({
    eventType: z.nativeEnum(NotificationEventType),
    channel: z.nativeEnum(NotificationChannel),
    enabled: z.boolean(),
  }).strict()).max(20),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>()
  value.preferences.forEach((preference, index) => {
    const key = `${preference.eventType}:${preference.channel}`
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Настройка канала указана повторно',
        path: ['preferences', index],
      })
    }
    seen.add(key)
  })
})

export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>
export type NotificationPreferenceInput =
  z.infer<typeof notificationPreferencesSchema>['preferences'][number]

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  SYSTEM: 'Системные события',
  CONTRACT_EXPIRING: 'Окончание трудового договора',
  TASK_OVERDUE: 'Просроченные задачи',
  ASSET_DISPOSAL_DUE: 'Срок списания имущества',
  BUDGET_OVERRUN: 'Превышение бюджета',
}

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: 'В приложении',
  EMAIL: 'Электронная почта',
}
