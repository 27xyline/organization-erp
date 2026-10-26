import { describe, expect, it } from 'vitest'
import {
  createApprovalTemplateSchema,
  updateApprovalTemplateSchema,
} from './approval'

describe('approval template contracts', () => {
  it('accepts a named route with unique approvers', () => {
    const result = createApprovalTemplateSchema.safeParse({
      name: 'Закупка оборудования',
      steps: [
        { name: 'Руководитель', approverId: 'user-1' },
        { name: 'Финансовый контроль', approverId: 'user-2' },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('rejects duplicate approvers and trims template names', () => {
    const result = createApprovalTemplateSchema.safeParse({
      name: '  Закупка  ',
      steps: [
        { name: 'Руководитель', approverId: 'user-1' },
        { name: 'Финансы', approverId: 'user-1' },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.path[0] === 'steps')).toBe(true)
  })

  it('allows activation changes without replacing the saved route', () => {
    const result = updateApprovalTemplateSchema.safeParse({ isActive: false })

    expect(result).toEqual({ success: true, data: { isActive: false } })
  })

  it('rejects an empty update', () => {
    expect(updateApprovalTemplateSchema.safeParse({}).success).toBe(false)
  })
})
