import { PayrollPeriodStatus, Prisma } from '@prisma/client'

export async function lockPayrollPeriod(
  tx: Prisma.TransactionClient,
  year: number,
  month: number,
): Promise<PayrollPeriodStatus> {
  await tx.payrollPeriod.upsert({
    where: { year_month: { year, month } },
    create: { year, month },
    update: {},
    select: { id: true },
  })
  const periods = await tx.$queryRaw<Array<{ status: PayrollPeriodStatus }>>(Prisma.sql`
    SELECT "status"
    FROM "payroll_periods"
    WHERE "year" = ${year} AND "month" = ${month}
    FOR UPDATE
  `)
  return periods[0]?.status || PayrollPeriodStatus.OPEN
}

export async function lockPayrollPeriods(
  tx: Prisma.TransactionClient,
  dates: readonly Date[],
): Promise<Map<string, PayrollPeriodStatus>> {
  const months = new Map<string, { year: number; month: number }>()
  for (const date of dates) {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() + 1
    months.set(`${year}-${String(month).padStart(2, '0')}`, { year, month })
  }
  const results = new Map<string, PayrollPeriodStatus>()
  for (const [key, { year, month }] of [...months].sort(([left], [right]) => left.localeCompare(right))) {
    results.set(key, await lockPayrollPeriod(tx, year, month))
  }
  return results
}

export function payrollMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
