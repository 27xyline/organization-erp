import { z } from 'zod'

// ─── Asset ───────────────────────────────────────────────────────

export const createAssetSchema = z.object({
  name: z.string().min(1, 'Наименование обязательно').max(500),
  inventoryNumber: z.string().min(1, 'Инвентарный номер обязателен').max(100),
  unitPrice: z.coerce.number().positive('Цена должна быть больше нуля'),
  unitOfMeasure: z.string().min(1, 'Единица измерения обязательна').max(50),
  quantity: z.coerce.number().positive('Количество должно быть больше нуля'),
  molId: z.string().min(1, 'МОЛ обязателен'),
  groupId: z.string().min(1, 'Группа обязательна'),
  projectId: z.string().nullable().optional(),
  contractCode: z.string().max(100).optional(),
  internalFundingCode: z.string().max(100).optional(),
  isExistingAsset: z.boolean().optional().default(false),
  recordingDate: z.string().min(1, 'Дата поступления обязательна'),
  documentType: z.string().min(1, 'Тип документа обязателен').max(200),
  documentDetails: z.string().min(1, 'Данные документа обязательны').max(500),
  documentFiles: z.array(z.string()).optional().default([]),
  status: z.enum([
    'IN_STOCK', 'IN_USE', 'UNDER_REPAIR',
    'PLANNED_FOR_DISPOSAL', 'PARTIALLY_DISPOSED', 'FULLY_DISPOSED',
  ]).optional().default('IN_STOCK'),
  notes: z.string().max(2000).optional().nullable(),
  plannedDisposalDate: z.string().optional().nullable(),
  plannedDisposalReason: z.string().max(500).optional().nullable(),
  photos: z.array(z.string()).optional().default([]),
  accountingForm: z.enum(['145', '367']).optional().default('145'),
})

export type CreateAssetInput = z.infer<typeof createAssetSchema>

// ─── MOL ─────────────────────────────────────────────────────────

export const createMolSchema = z.object({
  code: z.string().min(1, 'Код МОЛ обязателен').max(50),
  department: z.string().min(1, 'Подразделение обязательно').max(200),
  fullName: z.string().min(1, 'ФИО обязательно').max(200),
  storageLocation: z.string().min(1, 'Место хранения обязательно').max(300),
  photo: z.string().optional().nullable(),
})

export type CreateMolInput = z.infer<typeof createMolSchema>

// ─── Asset Group ─────────────────────────────────────────────────

export const createGroupSchema = z.object({
  name: z.string().min(1, 'Наименование обязательно').max(200),
  code: z.string().min(1, 'Код обязателен').max(50),
  description: z.string().max(500).optional().nullable(),
})

export type CreateGroupInput = z.infer<typeof createGroupSchema>

// ─── Employee ────────────────────────────────────────────────────

export const createEmployeeSchema = z.object({
  code: z.string().min(1, 'Табельный номер обязателен').max(50),
  fullName: z.string().min(1, 'ФИО обязательно').max(200),
  department: z.string().max(200).optional(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email('Некорректный email').max(200).optional().nullable().or(z.literal('')),
  photo: z.string().optional().nullable(),
  contractType: z.enum(['PRIMARY', 'INTERNAL', 'EXTERNAL']).optional().default('PRIMARY'),
  contractSignedDate: z.string().min(1, 'Дата подписания договора обязательна'),
  contractEndDate: z.string().optional().nullable(),
  contractNumber: z.string().min(1, 'Номер договора обязателен').max(100),
  staffScheduleId: z.string().min(1, 'Должность обязательна'),
  employmentRate: z.coerce.number().positive('Количество ставок должно быть больше нуля'),
  hireDescription: z.string().max(500).optional(),
})

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>

// ─── Staff Schedule ──────────────────────────────────────────────

export const createStaffScheduleSchema = z.object({
  position: z.string().min(1, 'Название должности обязательно').max(200),
  department: z.string().min(1, 'Подразделение обязательно').max(200),
  rate: z.coerce.number().positive('Количество ставок должно быть больше нуля'),
  salary: z.coerce.number().min(0, 'Оклад не может быть отрицательным'),
})

export type CreateStaffScheduleInput = z.infer<typeof createStaffScheduleSchema>

// ─── Vacation ────────────────────────────────────────────────────

export const createVacationSchema = z.object({
  employeeId: z.string().min(1, 'Сотрудник обязателен'),
  startDate: z.string().min(1, 'Дата начала обязательна'),
  endDate: z.string().min(1, 'Дата окончания обязательна'),
  type: z.enum(['VACATION', 'SICK_LEAVE', 'BUSINESS_TRIP', 'UNPAID_LEAVE']).default('VACATION'),
})

export type CreateVacationInput = z.infer<typeof createVacationSchema>

// ─── Project ─────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  code: z.string().min(1, 'Код проекта обязателен').max(50),
  name: z.string().min(1, 'Название проекта обязательно').max(300),
  description: z.string().max(2000).optional().nullable(),
  goals: z.string().max(2000).optional().nullable(),
  tasks: z.string().max(2000).optional().nullable(),
  results: z.string().max(2000).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional().default('ACTIVE'),
  plannedBudget: z.coerce.number().min(0).optional().default(0),
  actualBudget: z.coerce.number().min(0).optional().default(0),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>

// ─── Utility: Safe parse wrapper ─────────────────────────────────

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: true
  data: T
} | {
  success: false
  error: string
} {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  const firstError = result.error.errors[0]
  return {
    success: false,
    error: firstError?.message || 'Ошибка валидации данных',
  }
}
