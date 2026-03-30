import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const getCurrentYear = () => new Date().getFullYear()

const getNormalizedAmount = (value: unknown) => {
  if (typeof value !== 'string') return null

  const normalized = value.replace(',', '.').trim()

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  return Number(normalized).toFixed(2)
}

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get('year')
    const year = yearParam ? Number.parseInt(yearParam, 10) : getCurrentYear()

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid salary year' },
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
      ? await prisma.salaryEntry.findMany({
          where: {
            year,
            employeeId: {
              in: employeeIds,
            },
          },
        })
      : []

    const entryMap = new Map(
      entries.map((entry) => [`${entry.employeeId}:${entry.month}`, Number(entry.amount).toFixed(2)])
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
          return [String(month), entryMap.get(`${employee.id}:${month}`) || '0.00']
        })
      ),
    }))

    return NextResponse.json({
      year,
      rows,
    })
  } catch (error) {
    console.error('Error fetching salary table:', error)
    return NextResponse.json(
      { error: 'Failed to fetch salary table' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const year = Number(data?.year)
    const rows = Array.isArray(data?.rows)
      ? (data.rows as Array<{ employeeId?: string; months?: Record<string, string> }>)
      : null

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid salary year' },
        { status: 400 }
      )
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'Salary rows are required' },
        { status: 400 }
      )
    }

    const employeeIds = rows.map((row) => row?.employeeId).filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)

    if (employeeIds.length !== rows.length || new Set(employeeIds).size !== employeeIds.length) {
      return NextResponse.json(
        { error: 'Invalid salary employee rows' },
        { status: 400 }
      )
    }

    const entriesToCreate: Array<{ employeeId: string; year: number; month: number; amount: string }> = []

    for (const row of rows) {
      if (!row.employeeId) {
        return NextResponse.json(
          { error: 'Invalid salary employee rows' },
          { status: 400 }
        )
      }

      const months = row?.months

      if (!months || typeof months !== 'object') {
        return NextResponse.json(
          { error: 'Salary months are required for each employee' },
          { status: 400 }
        )
      }

      for (let month = 1; month <= 12; month += 1) {
        const normalizedAmount = getNormalizedAmount(months[String(month)])

        if (normalizedAmount === null) {
          return NextResponse.json(
            { error: `Invalid salary amount for month ${month}` },
            { status: 400 }
          )
        }

        entriesToCreate.push({
          employeeId: row.employeeId,
          year,
          month,
          amount: normalizedAmount,
        })
      }
    }

    await prisma.$transaction(async (tx) => {
      const existingEmployees = await tx.employee.findMany({
        where: {
          id: {
            in: employeeIds,
          },
          status: {
            not: 'DISMISSED',
          },
        },
        select: {
          id: true,
        },
      })

      if (existingEmployees.length !== employeeIds.length) {
        throw new Error('INVALID_EMPLOYEE_SELECTION')
      }

      await tx.salaryEntry.deleteMany({
        where: {
          year,
          employeeId: {
            in: employeeIds,
          },
        },
      })

      await tx.salaryEntry.createMany({
        data: entriesToCreate,
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving salary table:', error)

    if (error instanceof Error && error.message === 'INVALID_EMPLOYEE_SELECTION') {
      return NextResponse.json(
        { error: 'One or more employees are no longer available for salary planning' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to save salary table' },
      { status: 500 }
    )
  }
}
