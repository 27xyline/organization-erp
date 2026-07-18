import {
  NotificationChannel,
  NotificationEventType,
  Prisma,
  type PrismaClient,
} from '@prisma/client'
import { getDb } from '@/lib/prisma'
import type {
  NotificationPreferenceInput,
  NotificationsQuery,
} from '../contracts/notification'

export type NotificationServiceErrorCode = 'NOT_FOUND'

export class NotificationServiceError extends Error {
  constructor(public readonly code: NotificationServiceErrorCode) {
    super(code)
    this.name = 'NotificationServiceError'
  }
}

export interface PublishNotificationInput {
  recipientUserIds: readonly string[]
  eventType: NotificationEventType
  title: string
  body: string
  dedupeKey: string
  targetUrl?: string | null
  entityType?: string | null
  entityId?: string | null
  actorId?: string | null
  requestId?: string | null
}

const defaultChannelEnabled = (channel: NotificationChannel) =>
  channel === NotificationChannel.IN_APP

const notificationSelect = Prisma.validator<Prisma.NotificationSelect>()({
  id: true,
  eventType: true,
  title: true,
  body: true,
  targetUrl: true,
  entityType: true,
  entityId: true,
  readAt: true,
  createdAt: true,
})

function preferenceKey(
  eventType: NotificationEventType,
  channel: NotificationChannel,
) {
  return `${eventType}:${channel}`
}

export class NotificationService {
  constructor(private readonly db: PrismaClient = getDb()) {}

  async list(userId: string, query: NotificationsQuery) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      channel: NotificationChannel.IN_APP,
      deletedAt: null,
      ...(query.unreadOnly ? { readAt: null } : {}),
    }
    const [notifications, total] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.notification.count({ where }),
    ])
    return { notifications, total }
  }

  unreadCount(userId: string) {
    return this.db.notification.count({
      where: {
        userId,
        channel: NotificationChannel.IN_APP,
        deletedAt: null,
        readAt: null,
      },
    })
  }

  async setRead(userId: string, notificationId: string, read: boolean) {
    const result = await this.db.notification.updateMany({
      where: {
        id: notificationId,
        userId,
        channel: NotificationChannel.IN_APP,
        deletedAt: null,
      },
      data: { readAt: read ? new Date() : null },
    })
    if (!result.count) throw new NotificationServiceError('NOT_FOUND')
  }

  async markAllRead(userId: string) {
    const result = await this.db.notification.updateMany({
      where: {
        userId,
        channel: NotificationChannel.IN_APP,
        deletedAt: null,
        readAt: null,
      },
      data: { readAt: new Date() },
    })
    return result.count
  }

  async delete(userId: string, notificationId: string) {
    const result = await this.db.notification.updateMany({
      where: {
        id: notificationId,
        userId,
        channel: NotificationChannel.IN_APP,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    })
    if (!result.count) throw new NotificationServiceError('NOT_FOUND')
  }

  async getPreferences(userId: string) {
    const stored = await this.db.notificationPreference.findMany({
      where: { userId },
      select: { eventType: true, channel: true, enabled: true },
    })
    const values = new Map(
      stored.map((preference) => [
        preferenceKey(preference.eventType, preference.channel),
        preference.enabled,
      ]),
    )
    return Object.values(NotificationEventType).flatMap((eventType) =>
      Object.values(NotificationChannel).map((channel) => ({
        eventType,
        channel,
        enabled: values.get(preferenceKey(eventType, channel))
          ?? defaultChannelEnabled(channel),
      })),
    )
  }

  async updatePreferences(
    userId: string,
    preferences: readonly NotificationPreferenceInput[],
    requestId?: string,
  ) {
    await this.db.$transaction(async (tx) => {
      for (const preference of preferences) {
        await tx.notificationPreference.upsert({
          where: {
            userId_eventType_channel: {
              userId,
              eventType: preference.eventType,
              channel: preference.channel,
            },
          },
          create: { userId, ...preference },
          update: { enabled: preference.enabled },
        })
      }
      if (preferences.length) {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'NOTIFICATION_PREFERENCES_UPDATE',
            entityType: 'NotificationPreference',
            entityId: userId,
            details: preferences as Prisma.InputJsonValue,
            requestId,
          },
        })
      }
    })
    return this.getPreferences(userId)
  }

  async publish(input: PublishNotificationInput) {
    const recipientUserIds = Array.from(new Set(input.recipientUserIds)).sort()
    if (!recipientUserIds.length) return { created: 0, emailQueued: 0 }

    return this.db.$transaction(async (tx) => {
      const [users, preferences] = await Promise.all([
        tx.user.findMany({
          where: { id: { in: recipientUserIds }, isActive: true },
          select: { id: true },
        }),
        tx.notificationPreference.findMany({
          where: {
            userId: { in: recipientUserIds },
            eventType: input.eventType,
          },
          select: { userId: true, channel: true, enabled: true },
        }),
      ])
      const enabled = new Map(
        preferences.map((preference) => [
          `${preference.userId}:${preference.channel}`,
          preference.enabled,
        ]),
      )
      const deliveries = users.flatMap(({ id: userId }) =>
        Object.values(NotificationChannel)
          .filter((channel) =>
            enabled.get(`${userId}:${channel}`) ?? defaultChannelEnabled(channel)
          )
          .map((channel) => ({
            userId,
            eventType: input.eventType,
            channel,
            title: input.title,
            body: input.body,
            targetUrl: input.targetUrl,
            entityType: input.entityType,
            entityId: input.entityId,
            dedupeKey: input.dedupeKey,
          })),
      )
      if (!deliveries.length) return { created: 0, emailQueued: 0 }

      const inserted = await tx.notification.createMany({
        data: deliveries,
        skipDuplicates: true,
      })
      const emailNotifications = await tx.notification.findMany({
        where: {
          userId: { in: users.map((user) => user.id) },
          dedupeKey: input.dedupeKey,
          channel: NotificationChannel.EMAIL,
        },
        select: {
          id: true,
          userId: true,
          title: true,
          body: true,
          targetUrl: true,
          eventType: true,
        },
      })
      const outbox = emailNotifications.length
        ? await tx.notificationOutbox.createMany({
            data: emailNotifications.map((notification) => ({
              notificationId: notification.id,
              userId: notification.userId,
              payload: {
                eventType: notification.eventType,
                title: notification.title,
                body: notification.body,
                targetUrl: notification.targetUrl,
              },
            })),
            skipDuplicates: true,
          })
        : { count: 0 }

      if (inserted.count) {
        await tx.auditLog.create({
          data: {
            userId: input.actorId || null,
            action: 'NOTIFICATION_PUBLISH',
            entityType: input.entityType || 'NotificationEvent',
            entityId: input.entityId || input.dedupeKey,
            details: {
              eventType: input.eventType,
              dedupeKey: input.dedupeKey,
              recipientCount: users.length,
              deliveryCount: inserted.count,
            },
            requestId: input.requestId,
          },
        })
      }
      return { created: inserted.count, emailQueued: outbox.count }
    })
  }
}

let service: NotificationService | undefined

export function getNotificationService() {
  service ??= new NotificationService()
  return service
}
