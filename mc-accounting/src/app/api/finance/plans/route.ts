import { NextRequest, NextResponse } from 'next/server'
import { FinancePlanType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const getCurrentYear = () => new Date().getFullYear()

const getPlanType = (value: string | null) => {
  if (value === 'oklad') return FinancePlanType.OKLAD
  if (value === 'nadbavka') return FinancePlanType.NADBAVKA
  return null
}

const getNormalizedAmount = (value: unknown) => {
  if (typeof value !== 'string') return null

  const normalized = value.replace(',', '.').trim()

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  const numericValue = Number(normalized)

  if (Number.isNaN(numericValue) || numericValue <= 0) {
    return null
  }

  return numericValue.toFixed(2)
}

const getProjectsForFinance = async (includedProjectIds: string[] = []) => {
  const projects = await prisma.project.findMany({
    where: includedProjectIds.length > 0
      ? {
          OR: [
            {
              status: 'ACTIVE',
            },
            {
              id: {
                in: includedProjectIds,
              },
            },
          ],
        }
      : {
          status: 'ACTIVE',
        },
    orderBy: {
      code: 'asc',
    },
    select: {
      id: true,
      code: true,
      name: true,
      plannedBudget: true,
      actualBudget: true,
    },
  })

  return projects.map((project) => ({
    id: project.id,
    code: project.code,
    name: project.name,
    plannedBudget: Number(project.plannedBudget).toFixed(2),
    actualBudget: Number(project.actualBudget).toFixed(2),
    remainingBudget: (Number(project.plannedBudget) - Number(project.actualBudget)).toFixed(2),
  }))
}

const buildCellPayload = (entries: Array<{
  amount: Prisma.Decimal | number
  projectId: string | null
  project?: { id: string; code: string; name: string } | null
}>) => {
  const allocations = entries
    .filter((entry) => entry.projectId)
    .map((entry) => ({
      projectId: entry.projectId,
      projectCode: entry.project?.code || '',
      projectName: entry.project?.name || '',
      amount: Number(entry.amount).toFixed(2),
    }))
    .sort((left, right) => left.projectCode.localeCompare(right.projectCode, 'ru', { sensitivity: 'base' }))

  const totalAmount = allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0)
  const projectCodes = Array.from(new Set(allocations.map((allocation) => allocation.projectCode).filter(Boolean)))
  const singleAllocation = allocations.length === 1 ? allocations[0] : null

  return {
    amount: totalAmount.toFixed(2),
    projectId: singleAllocation?.projectId || null,
    projectCode: singleAllocation?.projectCode || '',
    projectName: singleAllocation?.projectName || '',
    projectLabel: projectCodes.join(', '),
    allocations,
  }
}

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get('year')
    const year = yearParam ? Number.parseInt(yearParam, 10) : getCurrentYear()
    const type = getPlanType(request.nextUrl.searchParams.get('type'))

    if (!type) {
      return NextResponse.json(
        { error: 'Invalid finance plan type' },
        { status: 400 }
      )
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid finance year' },
        { status: 400 }
      )
    }

    const employees = await prisma.employee.findMany({
      where: {
        status: {
          not: 'DISMISSED',
        },
      },
      orderBy: {
        fullName: 'asc',
      },
      include: {
        staffSchedule: {
          select: {
            id: true,
            position: true,
            department: true,
            rate: true,
            salary: true,
          },
        },
      },
    })

    const employeeIds = employees.map((employee) => employee.id)

    const entries = employeeIds.length > 0
      ? await prisma.financePlanEntry.findMany({
          where: {
            year,
            type,
            projectId: {
              not: null,
            },
            employeeId: {
              in: employeeIds,
            },
          },
          include: {
            project: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        })
      : []

    const projects = await getProjectsForFinance(
      Array.from(new Set(entries.map((entry) => entry.projectId).filter((value): value is string => Boolean(value))))
    )

    const entryGroups = entries.reduce((groups, entry) => {
      const key = `${entry.employeeId}:${entry.month}`
      const currentEntries = groups.get(key) || []
      currentEntries.push(entry)
      groups.set(key, currentEntries)
      return groups
    }, new Map<string, typeof entries>())

    const rows = employees.map((employee) => ({
      employeeId: employee.id,
      fullName: employee.fullName,
      department: employee.staffSchedule?.department || employee.department || '—',
      position: employee.staffSchedule?.position || '—',
      rate: Number(employee.employmentRate ?? 0).toFixed(2),
      salary: employee.staffSchedule
        ? (Number(employee.staffSchedule.salary) * Number(employee.employmentRate ?? 0)).toFixed(2)
        : '0.00',
      months: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => {
          const month = index + 1
          return [
            String(month),
            buildCellPayload(entryGroups.get(`${employee.id}:${month}`) || []),
          ]
        })
      ),
    })).sort((left, right) => {
      const departmentCompare = left.department.localeCompare(right.department, 'ru', { sensitivity: 'base' })

      if (departmentCompare !== 0) {
        return departmentCompare
      }

      return left.fullName.localeCompare(right.fullName, 'ru', { sensitivity: 'base' })
    })

    return NextResponse.json({
      year,
      rows,
      projects,
    })
  } catch (error) {
    console.error('Error fetching finance plan table:', error)
    return NextResponse.json(
      { error: 'Failed to fetch finance plan table' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const year = Number(data?.year)
    const month = Number(data?.month)
    const type = getPlanType(data?.type)
    const employeeId = typeof data?.employeeId === 'string' ? data.employeeId : null
    const projectId = typeof data?.projectId === 'string' ? data.projectId : null
    const rawAmount = typeof data?.amount === 'string' ? data.amount : null
    const rawAllocations = Array.isArray(data?.allocations)
      ? data.allocations as Array<{ projectId?: string; amount?: string }>
      : null

    if (!type) {
      return NextResponse.json(
        { error: 'Invalid finance plan type' },
        { status: 400 }
      )
    }

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Employee is required' },
        { status: 400 }
      )
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'Invalid finance period' },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          id: employeeId,
          status: {
            not: 'DISMISSED',
          },
        },
        include: {
          staffSchedule: {
            select: {
              salary: true,
            },
          },
        },
      })

      if (!employee) {
        throw new Error('INVALID_EMPLOYEE_SELECTION')
      }

      const normalizedAllocations = type === FinancePlanType.OKLAD
        ? (() => {
            if (!projectId) {
              throw new Error('PROJECT_REQUIRED')
            }

            const amount = (Number(employee.staffSchedule?.salary ?? 0) * Number(employee.employmentRate ?? 0)).toFixed(2)

            if (Number(amount) <= 0) {
              throw new Error('INVALID_OKLAD_AMOUNT')
            }

            return [{ projectId, amount }]
          })()
        : (() => {
            if (!rawAllocations || rawAllocations.length === 0) {
              throw new Error('INVALID_ALLOCATIONS')
            }

            const allocationMap = new Map<string, number>()

            for (const allocation of rawAllocations) {
              if (!allocation.projectId) {
                throw new Error('PROJECT_REQUIRED')
              }

              const normalizedAmount = getNormalizedAmount(allocation.amount)

              if (!normalizedAmount) {
                throw new Error('INVALID_FINANCE_AMOUNT')
              }

              allocationMap.set(
                allocation.projectId,
                (allocationMap.get(allocation.projectId) || 0) + Number(normalizedAmount)
              )
            }

            return Array.from(allocationMap.entries()).map(([projectId, amount]) => ({
              projectId,
              amount: amount.toFixed(2),
            }))
          })()

      const projectIds = Array.from(new Set(normalizedAllocations.map((allocation) => allocation.projectId)))

      const projects = await tx.project.findMany({
        where: {
          id: {
            in: projectIds,
          },
        },
        select: {
          id: true,
          code: true,
          name: true,
          plannedBudget: true,
          actualBudget: true,
        },
      })

      if (projects.length !== projectIds.length) {
        throw new Error('PROJECT_NOT_FOUND')
      }

      const existingEntries = await tx.financePlanEntry.findMany({
        where: {
          employeeId,
          year,
          month,
          type,
        },
      })

      for (const existingEntry of existingEntries) {
        if (existingEntry.projectId) {
          await tx.project.update({
            where: { id: existingEntry.projectId },
            data: {
              actualBudget: {
                decrement: existingEntry.amount,
              },
            },
          })
        }
      }

      await tx.financePlanEntry.deleteMany({
        where: {
          employeeId,
          year,
          month,
          type,
        },
      })

      await tx.financePlanEntry.createMany({
        data: normalizedAllocations.map((allocation) => ({
          employeeId,
          year,
          month,
          type,
          projectId: allocation.projectId,
          amount: new Prisma.Decimal(allocation.amount),
        })),
      })

      for (const allocation of normalizedAllocations) {
        await tx.project.update({
          where: { id: allocation.projectId },
          data: {
            actualBudget: {
              increment: new Prisma.Decimal(allocation.amount),
            },
          },
        })
      }

      const createdEntries = await tx.financePlanEntry.findMany({
        where: {
          employeeId,
          year,
          month,
          type,
        },
        include: {
          project: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      })

      const updatedProjects = await tx.project.findMany({
        where: {
          id: {
            in: projectIds,
          },
        },
        select: {
          id: true,
          code: true,
          name: true,
          plannedBudget: true,
          actualBudget: true,
        },
      })

      return {
        entries: createdEntries,
        projects: updatedProjects,
      }
    })

    return NextResponse.json({
      success: true,
      cell: buildCellPayload(result.entries),
      projects: result.projects.map((project) => ({
        ...project,
        plannedBudget: Number(project.plannedBudget).toFixed(2),
        actualBudget: Number(project.actualBudget).toFixed(2),
        remainingBudget: (Number(project.plannedBudget) - Number(project.actualBudget)).toFixed(2),
      })),
    })
  } catch (error) {
    console.error('Error saving finance plan cell:', error)

    if (error instanceof Error) {
      if (error.message === 'INVALID_EMPLOYEE_SELECTION') {
        return NextResponse.json(
          { error: 'Employee is no longer available for planning' },
          { status: 400 }
        )
      }

      if (error.message === 'PROJECT_NOT_FOUND') {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        )
      }

      if (error.message === 'PROJECT_REQUIRED') {
        return NextResponse.json(
          { error: 'Выберите проект' },
          { status: 400 }
        )
      }

      if (error.message === 'INVALID_OKLAD_AMOUNT') {
        return NextResponse.json(
          { error: 'Для сотрудника не задан оклад' },
          { status: 400 }
        )
      }

      if (error.message === 'INVALID_FINANCE_AMOUNT') {
        return NextResponse.json(
          { error: 'Введите сумму больше нуля' },
          { status: 400 }
        )
      }

      if (error.message === 'INVALID_ALLOCATIONS') {
        return NextResponse.json(
          { error: 'Добавьте хотя бы одно начисление' },
          { status: 400 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Failed to save finance plan cell' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const data = await request.json()
    const year = Number(data?.year)
    const month = Number(data?.month)
    const type = getPlanType(data?.type)
    const employeeId = typeof data?.employeeId === 'string' ? data.employeeId : null

    if (!type || !employeeId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'Invalid finance plan cell deletion payload' },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      const existingEntries = await tx.financePlanEntry.findMany({
        where: {
          employeeId,
          year,
          month,
          type,
        },
      })

      if (existingEntries.length === 0) {
        return
      }

      for (const existingEntry of existingEntries) {
        if (existingEntry.projectId) {
          await tx.project.update({
            where: { id: existingEntry.projectId },
            data: {
              actualBudget: {
                decrement: existingEntry.amount,
              },
            },
          })
        }
      }

      await tx.financePlanEntry.deleteMany({
        where: {
          employeeId,
          year,
          month,
          type,
        },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting finance plan cell:', error)
    return NextResponse.json(
      { error: 'Failed to delete finance plan cell' },
      { status: 500 }
    )
  }
}
