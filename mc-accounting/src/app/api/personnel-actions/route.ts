import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const getStartOfToday = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

const employeeSelect = {
  id: true,
  fullName: true,
  department: true,
  status: true,
  contractType: true,
  contractSignedDate: true,
  contractEndDate: true,
  contractNumber: true,
  staffScheduleId: true,
  staffSchedule: {
    select: {
      id: true,
      position: true,
      department: true,
    },
  },
} as const

const personnelActionPriority: Record<string, number> = {
  HIRE: 0,
  DISMISS: 1,
  ARCHIVE: 2,
  EXTEND: 3,
  TRANSFER: 4,
  PROMOTE: 5,
  EDIT: 6,
}

export async function GET() {
  try {
    const startOfToday = getStartOfToday()

    const actions = await prisma.personnelAction.findMany({
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          date: 'desc',
        },
      ],
      include: {
        employee: {
          select: employeeSelect,
        },
      },
    })

    const archivedEmployees = await prisma.employee.findMany({
      where: {
        status: {
          not: 'DISMISSED',
        },
        contractEndDate: {
          lt: startOfToday,
        },
      },
      select: employeeSelect,
      orderBy: {
        contractEndDate: 'desc',
      },
    })

    const archiveActions = archivedEmployees.map((employee) => {
      const archiveDate = employee.contractEndDate ?? startOfToday

      return {
        id: `archive-${employee.id}-${archiveDate.toISOString()}`,
        type: 'ARCHIVE',
        date: archiveDate,
        description: 'Закончился срок действия трудового договора',
        employeeId: employee.id,
        employee,
        oldDepartment: null,
        newDepartment: null,
        oldPosition: null,
        newPosition: null,
        oldContractEndDate: null,
        newContractEndDate: null,
        isSynthetic: true,
      }
    })

    const timeline = [...actions, ...archiveActions].sort((a, b) => {
      const left = new Date(a.date ?? 0).getTime()
      const right = new Date(b.date ?? 0).getTime()

      if (right !== left) {
        return right - left
      }

      const leftPriority = personnelActionPriority[a.type] ?? Number.MAX_SAFE_INTEGER
      const rightPriority = personnelActionPriority[b.type] ?? Number.MAX_SAFE_INTEGER

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority
      }

      return a.employee.fullName.localeCompare(b.employee.fullName, 'ru', { sensitivity: 'base' })
    })

    return NextResponse.json(timeline)
  } catch (error) {
    console.error('Error fetching personnel actions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch personnel actions' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const startOfToday = getStartOfToday()

    if (!data.type || !data.date) {
      return NextResponse.json(
        { error: 'Missing required action fields' },
        { status: 400 }
      )
    }

    const actionDate = new Date(data.date)
    if (Number.isNaN(actionDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid action date' },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      if (data.type === 'HIRE') {
        if (!data.employeeData?.code || !data.employeeData?.fullName) {
          throw new Error('INVALID_HIRE_PAYLOAD')
        }

        const hireStaffSchedule = data.employeeData.staffScheduleId
          ? await tx.staffSchedule.findUnique({ where: { id: data.employeeData.staffScheduleId } })
          : null

        const occupiedHirePosition = data.employeeData.staffScheduleId
          ? await tx.employee.findFirst({
              where: {
                staffScheduleId: data.employeeData.staffScheduleId,
                status: {
                  not: 'DISMISSED',
                },
                OR: [
                  { contractEndDate: null },
                  { contractEndDate: { gte: startOfToday } },
                ],
              },
            })
          : null

        const contractSignedDate = data.employeeData.contractSignedDate
          ? new Date(data.employeeData.contractSignedDate)
          : null
        const contractEndDate = data.employeeData.contractEndDate
          ? new Date(data.employeeData.contractEndDate)
          : null

        if (!hireStaffSchedule || occupiedHirePosition) {
          throw new Error(occupiedHirePosition ? 'POSITION_OCCUPIED' : 'POSITION_NOT_FOUND')
        }

        if (!data.employeeData.contractNumber || !contractSignedDate || Number.isNaN(contractSignedDate.getTime())) {
          throw new Error('INVALID_HIRE_PAYLOAD')
        }

        if (contractEndDate && Number.isNaN(contractEndDate.getTime())) {
          throw new Error('INVALID_CONTRACT_DATE')
        }

        if (contractEndDate && contractSignedDate >= contractEndDate) {
          throw new Error('INVALID_CONTRACT_RANGE')
        }

        const employee = await tx.employee.create({
          data: {
            code: data.employeeData.code,
            fullName: data.employeeData.fullName,
            department: hireStaffSchedule.department,
            phone: data.employeeData.phone || null,
            email: data.employeeData.email || null,
            photo: data.employeeData.photo || null,
            contractType: data.employeeData.contractType || 'PRIMARY',
            contractSignedDate,
            contractEndDate,
            contractNumber: data.employeeData.contractNumber,
            status: 'ACTIVE',
            staffScheduleId: data.employeeData.staffScheduleId,
          },
        })

        return tx.personnelAction.create({
          data: {
            type: 'HIRE',
            date: contractSignedDate,
            description: data.description || null,
            employeeId: employee.id,
            oldDepartment: null,
            newDepartment: hireStaffSchedule.department,
            oldPosition: null,
            newPosition: hireStaffSchedule.position,
            oldContractEndDate: null,
            newContractEndDate: contractEndDate,
          },
          include: {
            employee: {
              select: employeeSelect,
            },
          },
        })
      }

      if (!data.employeeId) {
        throw new Error('MISSING_EMPLOYEE_ID')
      }

      const employee = await tx.employee.findUnique({
        where: { id: data.employeeId },
        include: {
          staffSchedule: true,
        },
      })

      if (!employee) {
        throw new Error('EMPLOYEE_NOT_FOUND')
      }

      const nextStaffSchedule = data.staffScheduleId
        ? await tx.staffSchedule.findUnique({ where: { id: data.staffScheduleId } })
        : null

      if (data.type === 'TRANSFER' && !nextStaffSchedule) {
        throw new Error('POSITION_NOT_FOUND')
      }

      if (data.type === 'TRANSFER' && data.staffScheduleId) {
        const occupiedPosition = await tx.employee.findFirst({
          where: {
            id: {
              not: employee.id,
            },
            staffScheduleId: data.staffScheduleId,
            status: {
              not: 'DISMISSED',
            },
            OR: [
              { contractEndDate: null },
              { contractEndDate: { gte: startOfToday } },
            ],
          },
        })

        if (occupiedPosition) {
          throw new Error('POSITION_OCCUPIED')
        }
      }

      const oldDepartment = employee.department || null
      const oldPosition = employee.staffSchedule?.position || null
      const oldContractEndDate = employee.contractEndDate || null

      let newDepartment = data.newDepartment || oldDepartment
      let newPosition = data.newPosition || nextStaffSchedule?.position || oldPosition
      let nextStatus = employee.status
      let nextStaffScheduleId = employee.staffScheduleId
      let nextContractEndDate = employee.contractEndDate || null

      if (data.newContractEndDate) {
        const parsedContractDate = new Date(data.newContractEndDate)
        if (Number.isNaN(parsedContractDate.getTime())) {
          throw new Error('INVALID_CONTRACT_DATE')
        }
        if (employee.contractSignedDate && parsedContractDate <= employee.contractSignedDate) {
          throw new Error('INVALID_CONTRACT_RANGE')
        }
        nextContractEndDate = parsedContractDate
      }

      switch (data.type) {
        case 'TRANSFER':
          nextStatus = 'ACTIVE'
          nextStaffScheduleId = data.staffScheduleId || employee.staffScheduleId || null
          newDepartment = data.newDepartment || nextStaffSchedule?.department || employee.department
          newPosition = data.newPosition || nextStaffSchedule?.position || employee.staffSchedule?.position || null
          break
        case 'DISMISS':
          nextStatus = 'DISMISSED'
          nextStaffScheduleId = null
          newDepartment = null
          newPosition = null
          break
        case 'EXTEND':
          if (!data.newContractEndDate) {
            throw new Error('MISSING_CONTRACT_END_DATE')
          }
          nextStatus = 'ACTIVE'
          nextStaffScheduleId = employee.staffScheduleId
          newDepartment = employee.department
          newPosition = employee.staffSchedule?.position || null
          break
        case 'PROMOTE':
          nextStatus = 'ACTIVE'
          nextStaffScheduleId = data.staffScheduleId || employee.staffScheduleId || null
          newDepartment = data.newDepartment || nextStaffSchedule?.department || employee.department
          newPosition = data.newPosition || nextStaffSchedule?.position || employee.staffSchedule?.position || null
          break
        default:
          break
      }

      const action = await tx.personnelAction.create({
        data: {
          type: data.type,
          date: actionDate,
          description: data.description || null,
          employeeId: employee.id,
          oldDepartment,
          newDepartment,
          oldPosition,
          newPosition,
          oldContractEndDate,
          newContractEndDate: nextContractEndDate,
        },
        include: {
          employee: {
            select: employeeSelect,
          },
        },
      })

      await tx.employee.update({
        where: { id: employee.id },
        data: {
          department: newDepartment || employee.department,
          status: nextStatus,
          staffScheduleId: nextStaffScheduleId,
          contractEndDate: nextContractEndDate,
        },
      })

      return action
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error creating personnel action:', error)

    if (error instanceof Error) {
      if (error.message === 'EMPLOYEE_NOT_FOUND') {
        return NextResponse.json(
          { error: 'Employee not found' },
          { status: 404 }
        )
      }

      if (error.message === 'INVALID_HIRE_PAYLOAD') {
        return NextResponse.json(
          { error: 'Missing required hire fields' },
          { status: 400 }
        )
      }

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

      if (error.message === 'MISSING_EMPLOYEE_ID') {
        return NextResponse.json(
          { error: 'Employee is required for this action' },
          { status: 400 }
        )
      }

      if (error.message === 'MISSING_CONTRACT_END_DATE') {
        return NextResponse.json(
          { error: 'New contract end date is required' },
          { status: 400 }
        )
      }

      if (error.message === 'INVALID_CONTRACT_DATE') {
        return NextResponse.json(
          { error: 'Invalid contract date' },
          { status: 400 }
        )
      }

      if (error.message === 'INVALID_CONTRACT_RANGE') {
        return NextResponse.json(
          { error: 'Дата подписания договора должна быть раньше срока действия договора' },
          { status: 400 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Failed to create personnel action' },
      { status: 500 }
    )
  }
}
