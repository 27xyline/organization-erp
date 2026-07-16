import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStaffScheduleRateSummary } from '@/lib/employees'

// PUT /api/staff-schedule/[id] - Update position
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const rateSummary = await getStaffScheduleRateSummary(prisma, params.id)

    if (!rateSummary) {
      return NextResponse.json(
        { error: 'Должность не найдена' },
        { status: 404 }
      )
    }

    if (rate < rateSummary.occupiedRate) {
      return NextResponse.json(
        { error: 'Нельзя уменьшить количество ставок ниже уже занятого значения' },
        { status: 400 }
      )
    }
    
    const position = await prisma.staffSchedule.update({
      where: { id: params.id },
      data: {
        position: data.position.trim(),
        department: data.department,
        rate,
        salary,
      },
    })
    
    return NextResponse.json(position)
  } catch (error) {
    console.error('Error updating staff position:', error)
    return NextResponse.json(
      { error: 'Failed to update staff position' },
      { status: 500 }
    )
  }
}

// DELETE /api/staff-schedule/[id] - Delete position
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if position has employees
    const position = await prisma.staffSchedule.findUnique({
      where: { id: params.id },
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
    
    if (position && position.employees.length > 0) {
      return NextResponse.json(
        { error: 'Нельзя удалить должность, пока по ней есть назначенные сотрудники' },
        { status: 400 }
      )
    }

    await prisma.employee.updateMany({
      where: {
        staffScheduleId: params.id,
        status: 'DISMISSED',
      },
      data: {
        staffScheduleId: null,
      },
    })
    
    await prisma.staffSchedule.delete({
      where: { id: params.id },
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting staff position:', error)
    return NextResponse.json(
      { error: 'Failed to delete staff position' },
      { status: 500 }
    )
  }
}
