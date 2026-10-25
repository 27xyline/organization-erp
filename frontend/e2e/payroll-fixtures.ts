import type { PrismaClient } from '@prisma/client'

export async function seedApprovedZeroHoursForOtherEmployees(
  prisma: PrismaClient,
  year: number,
  month: number,
  excludedEmployeeId: string,
) {
  const [employees, admin] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { not: excludedEmployeeId }, status: { not: 'DISMISSED' } },
      select: { id: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { username: 'e2e-admin' },
      select: { id: true },
    }),
  ])
  const decidedAt = new Date()

  await prisma.timesheet.createMany({
    data: employees.map(({ id }) => ({
      employeeId: id,
      year,
      month,
      status: 'APPROVED',
      zeroHoursConfirmed: true,
      submittedById: admin.id,
      submittedAt: decidedAt,
      decidedById: admin.id,
      decidedAt,
      decisionReason: 'Full flow E2E confirmed zero hours',
    })),
    skipDuplicates: true,
  })
}
