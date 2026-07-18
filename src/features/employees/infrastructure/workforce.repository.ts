import { Prisma, PrismaClient } from '@prisma/client'

type EmployeeDbClient = Pick<PrismaClient, 'employee' | 'personnelAction' | 'staffSchedule'> | Prisma.TransactionClient
type StaffScheduleRateDbClient = Pick<PrismaClient, 'employee' | 'staffSchedule'> | Prisma.TransactionClient

export const getStartOfToday = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

export const toRateNumber = (value: Prisma.Decimal | number | string | null | undefined) => Number(value ?? 0)

export const getStaffScheduleRateSummary = async (
  db: StaffScheduleRateDbClient,
  staffScheduleId: string,
  excludeEmployeeId?: string
) => {
  const [position, occupiedRateResult] = await Promise.all([
    db.staffSchedule.findUnique({
      where: { id: staffScheduleId },
      select: { rate: true },
    }),
    db.employee.aggregate({
      where: {
        staffScheduleId,
        ...(excludeEmployeeId
          ? {
              id: {
                not: excludeEmployeeId,
              },
            }
          : {}),
        status: {
          not: 'DISMISSED',
        },
      },
      _sum: {
        employmentRate: true,
      },
    }),
  ])

  if (!position) return null

  const totalRate = toRateNumber(position.rate)
  const occupiedRate = toRateNumber(occupiedRateResult._sum.employmentRate)

  return {
    totalRate,
    occupiedRate,
    freeRate: Math.max(totalRate - occupiedRate, 0),
  }
}

export const ensureExpiredContractArchiveActions = async (
  db: EmployeeDbClient,
  accessWhere: Prisma.EmployeeWhereInput = {},
) => {
  const startOfToday = getStartOfToday()

  const expiredEmployees = await db.employee.findMany({
    where: {
      AND: [
        {
          status: { not: 'DISMISSED' },
          contractEndDate: { lt: startOfToday },
        },
        accessWhere,
      ],
    },
    include: {
      staffSchedule: {
        select: {
          id: true,
          position: true,
          department: true,
        },
      },
    },
  })

  if (expiredEmployees.length === 0) return 0

  const existingArchiveActions = await db.personnelAction.findMany({
    where: {
      type: 'ARCHIVE',
      employeeId: {
        in: expiredEmployees.map((employee) => employee.id),
      },
    },
    select: {
      employeeId: true,
      newContractEndDate: true,
    },
  })

  const existingArchiveKeys = new Set(
    existingArchiveActions.map((action) => `${action.employeeId}:${action.newContractEndDate?.toISOString() ?? 'null'}`)
  )

  const actionsToCreate = expiredEmployees
    .filter((employee) => !existingArchiveKeys.has(`${employee.id}:${employee.contractEndDate?.toISOString() ?? 'null'}`))
    .map((employee) => ({
      type: 'ARCHIVE' as const,
      date: employee.contractEndDate ?? startOfToday,
      description: 'Закончился срок действия трудового договора',
      employeeId: employee.id,
      oldDepartment: employee.department || null,
      newDepartment: employee.department || null,
      oldPosition: employee.staffSchedule?.position || null,
      newPosition: employee.staffSchedule?.position || null,
      oldContractEndDate: employee.contractEndDate || null,
      newContractEndDate: employee.contractEndDate || null,
    }))

  if (actionsToCreate.length === 0) return 0

  await db.personnelAction.createMany({
    data: actionsToCreate,
  })

  return actionsToCreate.length
}
