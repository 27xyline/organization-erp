import { describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/lib/errors/service-error'
import { ensurePayrollPeriodOpen } from './payroll-period-lock'

describe('ensurePayrollPeriodOpen', () => {
  it('allows an absent or open period', async () => {
    const db = {
      payrollPeriod: { findUnique: vi.fn().mockResolvedValue(null) },
    }
    await expect(ensurePayrollPeriodOpen(db as never, 2026, 7)).resolves.toBeUndefined()
  })

  it('blocks changes in a closed period', async () => {
    const db = {
      payrollPeriod: { findUnique: vi.fn().mockResolvedValue({ status: 'CLOSED' }) },
    }
    await expect(ensurePayrollPeriodOpen(db as never, 2026, 7))
      .rejects.toMatchObject({ code: 'PAYROLL_PERIOD_CLOSED' } satisfies Partial<ServiceError>)
  })
})
