import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const currentYear = new Date().getFullYear()
    const startOfYear = new Date(currentYear, 0, 1)
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999)

    const vacations = await prisma.vacation.findMany({
      where: {
        startDate: {
          lte: endOfYear,
        },
        endDate: {
          gte: startOfYear,
        },
      },
      orderBy: {
        startDate: 'asc',
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            department: true,
          },
        },
      },
    })

    return NextResponse.json(vacations)
  } catch (error) {
    console.error('Error fetching vacations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vacations' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const startDate = new Date(data.startDate)
    const endDate = new Date(data.endDate)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return NextResponse.json(
        { error: 'Invalid vacation dates' },
        { status: 400 }
      )
    }

    const vacation = await prisma.vacation.create({
      data: {
        employeeId: data.employeeId,
        startDate,
        endDate,
        type: data.type || 'VACATION',
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            department: true,
          },
        },
      },
    })

    return NextResponse.json(vacation)
  } catch (error) {
    console.error('Error creating vacation:', error)
    return NextResponse.json(
      { error: 'Failed to create vacation' },
      { status: 500 }
    )
  }
}
