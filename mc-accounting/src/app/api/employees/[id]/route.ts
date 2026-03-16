import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// PUT /api/employees/[id] - Update employee
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    const contractSignedDate = data.contractSignedDate ? new Date(data.contractSignedDate) : null
    const contractEndDate = data.contractEndDate ? new Date(data.contractEndDate) : null

    if (!data.staffScheduleId && data.status !== 'DISMISSED') {
      return NextResponse.json(
        { error: 'Staff schedule position is required' },
        { status: 400 }
      )
    }

    if (!data.contractNumber || !contractSignedDate || Number.isNaN(contractSignedDate.getTime())) {
      return NextResponse.json(
        { error: 'Contract number and sign date are required' },
        { status: 400 }
      )
    }

    if (contractEndDate && Number.isNaN(contractEndDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid contract end date' },
        { status: 400 }
      )
    }

    const employee = await prisma.$transaction(async (tx) => {
      const position = data.staffScheduleId
        ? await tx.staffSchedule.findUnique({ where: { id: data.staffScheduleId } })
        : null

      if (data.staffScheduleId && !position) {
        throw new Error('POSITION_NOT_FOUND')
      }

      if (data.staffScheduleId) {
        const occupiedPosition = await tx.employee.findFirst({
          where: {
            id: {
              not: params.id,
            },
            staffScheduleId: data.staffScheduleId,
            status: {
              not: 'DISMISSED',
            },
          },
        })

        if (occupiedPosition) {
          throw new Error('POSITION_OCCUPIED')
        }
      }

      return tx.employee.update({
        where: { id: params.id },
        data: {
          code: data.code,
          fullName: data.fullName,
          department: position?.department || data.department,
          photo: data.photo,
          phone: data.phone,
          email: data.email,
          contractType: data.contractType || 'PRIMARY',
          contractSignedDate,
          contractEndDate,
          contractNumber: data.contractNumber,
          staffScheduleId: data.staffScheduleId,
          status: data.status,
        },
        include: {
          staffSchedule: true,
        },
      })
    })
    
    return NextResponse.json(employee)
  } catch (error) {
    console.error('Error updating employee:', error)

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target : []

      if (target.includes('code')) {
        return NextResponse.json(
          { error: 'Сотрудник с таким табельным номером уже существует' },
          { status: 400 }
        )
      }
    }

    if (error instanceof Error) {
      if (error.message === 'POSITION_NOT_FOUND') {
        return NextResponse.json(
          { error: 'Staff schedule position not found' },
          { status: 404 }
        )
      }

      if (error.message === 'POSITION_OCCUPIED') {
        return NextResponse.json(
          { error: 'Selected position is already assigned to another employee' },
          { status: 400 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Failed to update employee' },
      { status: 500 }
    )
  }
}

// DELETE /api/employees/[id] - Delete employee
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.$transaction([
      prisma.vacation.deleteMany({
        where: { employeeId: params.id },
      }),
      prisma.personnelAction.deleteMany({
        where: { employeeId: params.id },
      }),
      prisma.employee.delete({
        where: { id: params.id },
      }),
    ])
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting employee:', error)
    return NextResponse.json(
      { error: 'Failed to delete employee' },
      { status: 500 }
    )
  }
}
