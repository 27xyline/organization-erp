import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT /api/staff-schedule/[id] - Update position
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    
    const position = await prisma.staffSchedule.update({
      where: { id: params.id },
      data: {
        position: data.position,
        department: data.department,
        rate: data.rate,
        salary: data.salary,
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
        { error: 'Cannot delete position with assigned employees' },
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
