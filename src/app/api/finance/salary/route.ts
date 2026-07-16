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
      orderBy: [
        {
          department: 'asc',
        },
        {
          fullName: 'asc',
        },
      ],
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
            projectId: {
              not: null,
            },
            type: {
              in: [FinancePlanType.OKLAD, FinancePlanType.NADBAVKA],
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

    const monthEntryMap = new Map<string, Array<{ amount: number; projectCode: string; typeLabel: string }>>()

    entries.forEach((entry) => {
      const key = `${entry.employeeId}:${entry.month}`
      const currentEntries = monthEntryMap.get(key) || []
      currentEntries.push({
        amount: Number(entry.amount),
        projectCode: entry.project?.code || '',
        typeLabel: entry.type === FinancePlanType.OKLAD ? 'Оклад' : 'Надбавка',
      })
      monthEntryMap.set(key, currentEntries)
    })

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
          const values = monthEntryMap.get(`${employee.id}:${month}`) || []
          const totalAmount = values.reduce((sum, value) => sum + value.amount, 0)
          const projectCodes = Array.from(new Set(values.map((value) => value.projectCode).filter(Boolean)))

          return [
            String(month),
            {
              amount: totalAmount.toFixed(2),
              projectId: null,
              projectCode: '',
              projectName: '',
              projectLabel: projectCodes.join(', '),
              details: values.map((value) => ({
                typeLabel: value.typeLabel,
                projectCode: value.projectCode,
                amount: value.amount.toFixed(2),
              })),
            },
          ]
        })
      ),
    }))

    return NextResponse.json({
      year,
      rows,
      projects: [],
    })
  } catch (error) {
    console.error('Error fetching salary table:', error)
    return NextResponse.json(
      { error: 'Failed to fetch salary table' },
      { status: 500 }
    )
  }
}
