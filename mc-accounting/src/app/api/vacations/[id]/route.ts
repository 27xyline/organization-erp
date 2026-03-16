import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const vacation = await prisma.vacation.update({
      where: { id: params.id },
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
    console.error('Error updating vacation:', error)
    return NextResponse.json(
      { error: 'Failed to update vacation' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.vacation.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting vacation:', error)
    return NextResponse.json(
      { error: 'Failed to delete vacation' },
      { status: 500 }
    )
  }
}
