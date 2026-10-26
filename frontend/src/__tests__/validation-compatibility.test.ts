import { describe, expect, it } from 'vitest'
import { assetsQuerySchema } from '@/features/assets/contracts/schemas'
import { departmentsQuerySchema } from '@/features/departments/contracts/schemas'
import { documentsQuerySchema } from '@/features/documents/contracts/document'
import { updateEmployeeSchema } from '@/features/employees/contracts/employee'
import { notificationsQuerySchema } from '@/features/notifications/contracts/notification'
import { createTaskSchema, updateTaskSchema } from '@/features/projects/contracts/task'

describe('request validation compatibility', () => {
  it('defaults omitted boolean query filters to false', () => {
    expect(assetsQuerySchema.parse({}).archived).toBe(false)
    expect(documentsQuerySchema.parse({}).archived).toBe(false)
    expect(departmentsQuerySchema.parse({}).activeOnly).toBe(false)
    expect(notificationsQuerySchema.parse({}).unreadOnly).toBe(false)
  })

  it('keeps omitted employee fields out of partial updates', () => {
    expect(updateEmployeeSchema.parse({ fullName: 'Иван Иванов' })).toEqual({ fullName: 'Иван Иванов' })
  })

  it('accepts a task without dates and keeps omitted assignees out of updates', () => {
    expect(createTaskSchema.parse({ name: 'Задача' })).toMatchObject({ startDate: null, endDate: null })
    expect(updateTaskSchema.parse({ name: 'Новое название' })).toEqual({ name: 'Новое название' })
  })
})
