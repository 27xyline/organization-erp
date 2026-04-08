import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createVacationSchema, validateRequest } from '@/lib/validations'

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get('year')
    const parsedYear = yearParam ? Number.parseInt(yearParam, 10) : new Date().getFullYear()
    const targetYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear()
    const startOfYear = new Date(targetYear, 0, 1)
    const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59, 999)

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
      { error: 'Ошибка при загрузке отпусков' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequest(createVacationSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const data = validation.data
    const startDate = new Date(data.startDate)
    const endDate = new Date(data.endDate)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return NextResponse.json(
        { error: 'Некорректные даты отпуска' },
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
      { error: 'Ошибка при добавлении отпуска' },
      { status: 500 }
    )
  }
}
