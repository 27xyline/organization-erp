import { AssetMaintenanceStatus, AssetMaintenanceType } from '@prisma/client'
import { z } from 'zod'

export const createMaintenanceSchema = z.object({
  type: z.nativeEnum(AssetMaintenanceType),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  scheduledDate: z.coerce.date(),
  nextDueDate: z.coerce.date().nullable().optional(),
  provider: z.string().trim().max(200).nullable().optional(),
  cost: z.coerce.number().min(0).default(0),
})

export const updateMaintenanceSchema = z.object({
  status: z.nativeEnum(AssetMaintenanceStatus).optional(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  scheduledDate: z.coerce.date().optional(),
  startedAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  nextDueDate: z.coerce.date().nullable().optional(),
  provider: z.string().trim().max(200).nullable().optional(),
  cost: z.coerce.number().min(0).optional(),
  result: z.string().trim().max(1000).nullable().optional(),
}).strict()

export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>
export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>

export const MAINTENANCE_TYPE_LABELS: Record<AssetMaintenanceType, string> = {
  INSPECTION: 'Осмотр',
  CALIBRATION: 'Поверка',
  REPAIR: 'Ремонт',
  SERVICE: 'Обслуживание',
}

export const MAINTENANCE_STATUS_LABELS: Record<AssetMaintenanceStatus, string> = {
  PLANNED: 'Запланировано',
  IN_PROGRESS: 'Выполняется',
  COMPLETED: 'Завершено',
  CANCELED: 'Отменено',
}
