import {
  PayrollPeriodStatus,
  type Prisma,
} from '@prisma/client'
import { ServiceError } from '@/lib/errors/service-error'

export async function ensurePayrollPeriodOpen(
  db: Prisma.TransactionClient,
  year: number,
  month: number,
) {
  const period = await db.payrollPeriod.findUnique({
    where: { year_month: { year, month } },
    select: { status: true },
  })
  if (period?.status === PayrollPeriodStatus.CLOSED) {
    throw new ServiceError('PAYROLL_PERIOD_CLOSED')
  }
}
