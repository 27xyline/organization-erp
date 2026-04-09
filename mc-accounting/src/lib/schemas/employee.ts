import { z } from 'zod'

export const employeeStatusSchema = z.enum(['ACTIVE', 'ON_VACATION', 'ON_SICK_LEAVE', 'DISMISSED'])
export const contractTypeSchema = z.enum(['PRIMARY', 'INTERNAL', 'EXTERNAL'])

export const employeeSchema = z.object({
  code: z.string().min(1, 'Табельный номер обязателен').max(50),
  fullName: z.string().min(1, 'ФИО обязательно').max(200),
  department: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email('Некорректный email').max(200).optional().nullable().or(z.literal('')),
  photo: z.string().optional().nullable(),
  contractType: contractTypeSchema.optional().default('PRIMARY'),
  contractSignedDate: z.coerce.date({
    errorMap: () => ({ message: 'Некорректная дата подписания договора' })
  }),
  contractEndDate: z.preprocess((val) => (val === '' || val === null ? undefined : val), z.coerce.date().optional()),
  contractNumber: z.string().min(1, 'Номер договора обязателен').max(100),
  staffScheduleId: z.string().optional().nullable(),
  employmentRate: z.coerce.number().min(0, 'Количество ставок не может быть отрицательным'),
  status: employeeStatusSchema.optional().default('ACTIVE'),
})

export const createEmployeeSchema = employeeSchema.extend({
  staffScheduleId: z.string().min(1, 'Должность из штатного расписания обязательна'),
})

export const updateEmployeeSchema = employeeSchema.partial().extend({
  // Some fields might still be mandatory for update or have specific constraints
  id: z.string().optional(),
})

export type EmployeeInput = z.infer<typeof employeeSchema>
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
