import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toRateNumber } from '@/lib/employees'
import { createStaffScheduleSchema, validateRequest } from '@/lib/validations'

// GET /api/staff-schedule - Get all staff schedule positions
export async function GET() {
  try {
    const positions = await prisma.staffSchedule.findMany({
      orderBy: [
        { department: 'asc' },
        { position: 'asc' },
      ],
      include: {
        employees: {
          where: {
            status: {
              not: 'DISMISSED',
            },
          },
        },
      },
    })

    return NextResponse.json(
      positions.map((position) => {
        const totalRate = toRateNumber(position.rate)
        const occupiedRate = position.employees.reduce(
          (sum, employee) => sum + toRateNumber(employee.employmentRate),
          0
        )

        return {
          ...position,
          occupiedRate,
          freeRate: Math.max(totalRate - occupiedRate, 0),
        }
      })
    )
  } catch (error) {
    console.error('Error fetching staff schedule:', error)
    return NextResponse.json(
      { error: 'Ошибка при загрузке штатного расписания' },
      { status: 500 }
    )
  }
}

// POST /api/staff-schedule - Create new position
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequest(createStaffScheduleSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const data = validation.data
    
    const position = await prisma.staffSchedule.create({
      data: {
        position: data.position.trim(),
        department: data.department,
        rate: data.rate,
        salary: data.salary,
      },
    })
    
    return NextResponse.json(position)
  } catch (error) {
    console.error('Error creating staff position:', error)
    return NextResponse.json(
      { error: 'Ошибка при создании должности' },
      { status: 500 }
    )
  }
}
