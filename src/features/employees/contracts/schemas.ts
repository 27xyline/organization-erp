import { z } from 'zod'

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

export const createStaffScheduleSchema = z.object({
  position: z.string().min(1, 'Название должности обязательно').max(200),
  department: z.string().min(1, 'Подразделение обязательно').max(200),
  rate: z.coerce.number().positive('Количество ставок должно быть больше нуля'),
  salary: z.coerce.number().min(0, 'Оклад не может быть отрицательным'),
})

export const createVacationSchema = z.object({
  employeeId: z.string().min(1, 'Сотрудник обязателен'),
  startDate: z.string().min(1, 'Дата начала обязательна'),
  endDate: z.string().min(1, 'Дата окончания обязательна'),
  type: z.enum(['VACATION', 'SICK_LEAVE', 'BUSINESS_TRIP', 'UNPAID_LEAVE']).default('VACATION'),
})

export const createPersonnelActionSchema = z.object({
  type: z.enum(['HIRE', 'DISMISS', 'ARCHIVE', 'TRANSFER', 'EXTEND', 'PROMOTE', 'EDIT']),
  date: z.string().min(1, 'Дата действия обязательна'),
  description: z.string().max(2000).optional().nullable(),
  employeeId: z.string().optional().nullable(),
  employeeData: z.any().optional(),
  staffScheduleId: z.string().optional().nullable(),
  employmentRate: z.coerce.number().optional().nullable(),
  newDepartment: z.string().optional().nullable(),
  newPosition: z.string().optional().nullable(),
  newContractEndDate: z.string().optional().nullable(),
})

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type CreateStaffScheduleInput = z.infer<typeof createStaffScheduleSchema>
export type CreateVacationInput = z.infer<typeof createVacationSchema>
export type CreatePersonnelActionInput = z.infer<typeof createPersonnelActionSchema>
