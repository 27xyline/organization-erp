import { Prisma, PrismaClient } from '@prisma/client'

type EmployeeDbClient = Pick<PrismaClient, 'employee' | 'personnelAction'> | Prisma.TransactionClient

export const getStartOfToday = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

export const findOccupiedEmployeeByStaffSchedule = (
  db: Pick<PrismaClient, 'employee'> | Prisma.TransactionClient,
  staffScheduleId: string,
  excludeEmployeeId?: string
) => db.employee.findFirst({
  where: {
    ...(excludeEmployeeId
      ? {
          id: {
            not: excludeEmployeeId,
          },
        }
      : {}),
    staffScheduleId,
    status: {
      not: 'DISMISSED',
    },
  },
})

export const ensureExpiredContractArchiveActions = async (db: EmployeeDbClient) => {
  const startOfToday = getStartOfToday()

  const expiredEmployees = await db.employee.findMany({
    where: {
      status: {
        not: 'DISMISSED',
      },
      contractEndDate: {
        lt: startOfToday,
      },
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
