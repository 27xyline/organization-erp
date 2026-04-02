import { NextRequest, NextResponse } from 'next/server'
import { FinancePlanType } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const getCurrentYear = () => new Date().getFullYear()

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
      ? await prisma.financePlanEntry.findMany({
          where: {
            year,
            type: {
              in: [FinancePlanType.OKLAD, FinancePlanType.NADBAVKA],
            },
            employeeId: {
              in: employeeIds,
            },
          },
        })
      : []

    const entryMap = new Map(
      entries.map((entry) => [`${entry.employeeId}:${entry.month}:${entry.type}`, Number(entry.amount)])
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
          const okladAmount = entryMap.get(`${employee.id}:${month}:${FinancePlanType.OKLAD}`) || 0
          const nadbavkaAmount = entryMap.get(`${employee.id}:${month}:${FinancePlanType.NADBAVKA}`) || 0

          return [String(month), (okladAmount + nadbavkaAmount).toFixed(2)]
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
