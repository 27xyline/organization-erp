import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { findOccupiedEmployeeByStaffSchedule, getStartOfToday } from '@/lib/employees'

// GET /api/employees - Get all employees
export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope') || 'all'
    const startOfToday = getStartOfToday()

    const where =
      scope === 'active'
        ? {
            status: {
              not: 'DISMISSED' as const,
            },
          }
        : scope === 'archive'
          ? {
              OR: [
                {
                  status: 'DISMISSED' as const,
                },
                {
                  status: {
                    not: 'DISMISSED' as const,
                  },
                  contractEndDate: {
                    lt: startOfToday,
                  },
                },
              ],
            }
          : scope === 'expired'
            ? {
                status: {
                  not: 'DISMISSED' as const,
                },
                contractEndDate: {
                  lt: startOfToday,
                },
              }
          : undefined

    const employees = await prisma.employee.findMany({
      where,
      orderBy: scope === 'all' ? { createdAt: 'desc' } : { fullName: 'asc' },
      include: {
        staffSchedule: true,
      },
    })
    
    return NextResponse.json(employees)
  } catch (error) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    )
  }
}

// POST /api/employees - Create new employee
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const contractSignedDate = data.contractSignedDate ? new Date(data.contractSignedDate) : null
    const contractEndDate = data.contractEndDate ? new Date(data.contractEndDate) : null

    if (!data.staffScheduleId) {
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

    if (contractEndDate && contractSignedDate >= contractEndDate) {
      return NextResponse.json(
        { error: 'Дата подписания договора должна быть раньше срока действия договора' },
        { status: 400 }
      )
    }

    const employee = await prisma.$transaction(async (tx) => {
      const position = await tx.staffSchedule.findUnique({
        where: { id: data.staffScheduleId },
      })

      if (!position) {
        throw new Error('POSITION_NOT_FOUND')
      }

      const occupiedPosition = await findOccupiedEmployeeByStaffSchedule(tx, data.staffScheduleId)

      if (occupiedPosition) {
        throw new Error('POSITION_OCCUPIED')
      }

      const createdEmployee = await tx.employee.create({
        data: {
          code: data.code,
          fullName: data.fullName,
          department: position.department,
          photo: data.photo,
          phone: data.phone,
          email: data.email,
          contractType: data.contractType || 'PRIMARY',
          contractSignedDate,
          contractEndDate,
          contractNumber: data.contractNumber,
          staffScheduleId: data.staffScheduleId,
          status: 'ACTIVE',
        },
        include: {
          staffSchedule: true,
        },
      })

      await tx.personnelAction.create({
        data: {
          type: 'HIRE',
          date: contractSignedDate,
          description: data.hireDescription || 'Прием на работу',
          employeeId: createdEmployee.id,
          oldDepartment: null,
          newDepartment: position.department,
          oldPosition: null,
          newPosition: position.position,
          oldContractEndDate: null,
          newContractEndDate: contractEndDate,
        },
      })

      return createdEmployee
    })
    
    return NextResponse.json(employee)
  } catch (error) {
    console.error('Error creating employee:', error)

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
      { error: 'Failed to create employee' },
      { status: 500 }
    )
  }
}
