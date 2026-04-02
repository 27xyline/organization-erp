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

const getProjectsForFinance = async () => {
  const projects = await prisma.project.findMany({
    where: {
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

    const [employees, projects] = await Promise.all([
      prisma.employee.findMany({
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
      }),
      getProjectsForFinance(),
    ])

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

    const entryMap = new Map(
      entries.map((entry) => [
        `${entry.employeeId}:${entry.month}`,
        {
          amount: Number(entry.amount).toFixed(2),
          projectId: entry.projectId,
          projectCode: entry.project?.code || '',
          projectName: entry.project?.name || '',
        },
      ])
    )

    const rows = employees.map((employee) => ({
      employeeId: employee.id,
      fullName: employee.fullName,
      department: employee.staffSchedule?.department || employee.department || '—',
      position: employee.staffSchedule?.position || '—',
      rate: employee.staffSchedule ? Number(employee.staffSchedule.rate).toFixed(2) : '0.00',
      salary: employee.staffSchedule ? Number(employee.staffSchedule.salary).toFixed(2) : '0.00',
      months: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => {
          const month = index + 1
          return [
            String(month),
            entryMap.get(`${employee.id}:${month}`) || {
              amount: '0.00',
              projectId: null,
              projectCode: '',
              projectName: '',
            },
          ]
        })
      ),
    }))

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
    const amount = getNormalizedAmount(data?.amount)

    if (!type) {
      return NextResponse.json(
        { error: 'Invalid finance plan type' },
        { status: 400 }
      )
    }

    if (!employeeId || !projectId || !amount) {
      return NextResponse.json(
        { error: 'Employee, project and amount are required' },
        { status: 400 }
      )
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'Invalid finance period' },
        { status: 400 }
      )
    }

    const amountDecimal = new Prisma.Decimal(amount)

    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          id: employeeId,
          status: {
            not: 'DISMISSED',
          },
        },
      })

      if (!employee) {
        throw new Error('INVALID_EMPLOYEE_SELECTION')
      }

      const project = await tx.project.findUnique({
        where: { id: projectId },
      })

      if (!project) {
        throw new Error('PROJECT_NOT_FOUND')
      }

      const existingEntry = await tx.financePlanEntry.findUnique({
        where: {
          employeeId_year_month_type: {
            employeeId,
            year,
            month,
            type,
          },
        },
      })

      if (existingEntry?.projectId) {
        await tx.project.update({
          where: { id: existingEntry.projectId },
          data: {
            actualBudget: {
              decrement: existingEntry.amount,
            },
          },
        })
      }

      const entry = await tx.financePlanEntry.upsert({
        where: {
          employeeId_year_month_type: {
            employeeId,
            year,
            month,
            type,
          },
        },
        update: {
          projectId,
          amount: amountDecimal,
        },
        create: {
          employeeId,
          year,
          month,
          type,
          projectId,
          amount: amountDecimal,
        },
      })

      await tx.project.update({
        where: { id: projectId },
        data: {
          actualBudget: {
            increment: amountDecimal,
          },
        },
      })

      const updatedProject = await tx.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          code: true,
          name: true,
          plannedBudget: true,
          actualBudget: true,
        },
      })

      return {
        entry,
        project: updatedProject,
      }
    })

    return NextResponse.json({
      success: true,
      cell: {
        amount: Number(result.entry.amount).toFixed(2),
        projectId,
        projectCode: result.project?.code || '',
        projectName: result.project?.name || '',
      },
      project: result.project
        ? {
            ...result.project,
            plannedBudget: Number(result.project.plannedBudget).toFixed(2),
            actualBudget: Number(result.project.actualBudget).toFixed(2),
            remainingBudget: (Number(result.project.plannedBudget) - Number(result.project.actualBudget)).toFixed(2),
          }
        : null,
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
      const existingEntry = await tx.financePlanEntry.findUnique({
        where: {
          employeeId_year_month_type: {
            employeeId,
            year,
            month,
            type,
          },
        },
      })

      if (!existingEntry) {
        return
      }

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

      await tx.financePlanEntry.delete({
        where: {
          employeeId_year_month_type: {
            employeeId,
            year,
            month,
            type,
          },
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
