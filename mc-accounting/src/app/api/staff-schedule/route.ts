import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toRateNumber } from '@/lib/employees'

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
      { error: 'Failed to fetch staff schedule' },
      { status: 500 }
    )
  }
}

// POST /api/staff-schedule - Create new position
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const rate = Number(data.rate)
    const salary = Number(data.salary)

    if (!data.position || !data.department) {
      return NextResponse.json(
        { error: 'Заполните должность и подразделение' },
        { status: 400 }
      )
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json(
        { error: 'Количество ставок должно быть больше нуля' },
        { status: 400 }
      )
    }

    if (!Number.isFinite(salary) || salary < 0) {
      return NextResponse.json(
        { error: 'Оклад за одну ставку не может быть отрицательным' },
        { status: 400 }
      )
    }
    
    const position = await prisma.staffSchedule.create({
      data: {
        position: data.position.trim(),
        department: data.department,
        rate,
        salary,
      },
    })
    
    return NextResponse.json(position)
  } catch (error) {
    console.error('Error creating staff position:', error)
    return NextResponse.json(
      { error: 'Failed to create staff position' },
      { status: 500 }
    )
  }
}
