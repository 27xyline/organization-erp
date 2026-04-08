import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStaffScheduleRateSummary } from '@/lib/employees'
import { createPersonnelActionSchema, validateRequest } from '@/lib/validations'

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
  employmentRate: true,
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

export async function GET(request: NextRequest) {
  try {
    const page = Number(request.nextUrl.searchParams.get('page')) || 1
    const limit = Number(request.nextUrl.searchParams.get('limit')) || 50
    const skip = (page - 1) * limit

    const [actions, total] = await prisma.$transaction([
      prisma.personnelAction.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          employee: {
            select: employeeSelect,
          },
        },
        skip,
        take: limit,
      }),
      prisma.personnelAction.count(),
    ])

    const timeline = [...actions].sort((a, b) => {
      const left = new Date(a.createdAt).getTime()
      const right = new Date(b.createdAt).getTime()

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

    return NextResponse.json({
      data: timeline,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('Error fetching personnel actions:', error)
    return NextResponse.json(
      { error: 'Ошибка при загрузке кадровых действий' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequest(createPersonnelActionSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const data = validation.data
    const actionDate = new Date(data.date)

    if (Number.isNaN(actionDate.getTime())) {
      return NextResponse.json(
        { error: 'Некорректная дата кадрового действия' },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      if (data.type === 'HIRE') {
        if (!data.employeeData?.code || !data.employeeData?.fullName) {
          throw new Error('INVALID_HIRE_PAYLOAD')
        }

        const employmentRate = Number(data.employeeData.employmentRate)

        const hireStaffSchedule = data.employeeData.staffScheduleId
          ? await tx.staffSchedule.findUnique({ where: { id: data.employeeData.staffScheduleId } })
          : null

        const hireRateSummary = data.employeeData.staffScheduleId
          ? await getStaffScheduleRateSummary(tx, data.employeeData.staffScheduleId)
          : null

        const contractSignedDate = data.employeeData.contractSignedDate
          ? new Date(data.employeeData.contractSignedDate)
          : null
        const contractEndDate = data.employeeData.contractEndDate
          ? new Date(data.employeeData.contractEndDate)
          : null

        if (!hireStaffSchedule || !hireRateSummary) {
          throw new Error('POSITION_NOT_FOUND')
        }

        if (!Number.isFinite(employmentRate) || employmentRate <= 0) {
          throw new Error('INVALID_EMPLOYMENT_RATE')
        }

        if (employmentRate > hireRateSummary.freeRate) {
          throw new Error('INSUFFICIENT_POSITION_RATE')
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
            employmentRate,
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

      if (data.type === 'PROMOTE' && data.staffScheduleId && !nextStaffSchedule) {
        throw new Error('POSITION_NOT_FOUND')
      }

      const oldDepartment = employee.department || null
      const oldPosition = employee.staffSchedule?.position || null
      const oldContractEndDate = employee.contractEndDate || null
      const currentEmploymentRate = Number(employee.employmentRate || 0)
      const requestedEmploymentRate = data.employmentRate == null ? currentEmploymentRate : Number(data.employmentRate)

      if (data.type === 'TRANSFER' || data.type === 'PROMOTE') {
        if (!Number.isFinite(requestedEmploymentRate) || requestedEmploymentRate <= 0) {
          throw new Error('INVALID_EMPLOYMENT_RATE')
        }
      }

      if ((data.type === 'TRANSFER' || data.type === 'PROMOTE') && data.staffScheduleId) {
        const rateSummary = await getStaffScheduleRateSummary(tx, data.staffScheduleId, employee.id)

        if (!rateSummary) {
          throw new Error('POSITION_NOT_FOUND')
        }

        if (requestedEmploymentRate > rateSummary.freeRate) {
          throw new Error('INSUFFICIENT_POSITION_RATE')
        }
      }

      let newDepartment = data.newDepartment || oldDepartment
      let newPosition = data.newPosition || nextStaffSchedule?.position || oldPosition
      let nextStatus = employee.status
      let nextStaffScheduleId = employee.staffScheduleId
      let nextContractEndDate = employee.contractEndDate || null
      let nextEmploymentRate = currentEmploymentRate

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
          nextEmploymentRate = requestedEmploymentRate
          break
        case 'DISMISS':
          nextStatus = 'DISMISSED'
          nextStaffScheduleId = employee.staffScheduleId
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
          nextEmploymentRate = requestedEmploymentRate
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
          employmentRate: nextEmploymentRate,
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
          { error: 'Сотрудник не найден' },
          { status: 404 }
        )
      }

      if (error.message === 'INVALID_HIRE_PAYLOAD') {
        return NextResponse.json(
          { error: 'Отсутствуют обязательные поля для приема на работу' },
          { status: 400 }
        )
      }

      if (error.message === 'POSITION_NOT_FOUND') {
        return NextResponse.json(
          { error: 'Должность из штатного расписания не найдена' },
          { status: 404 }
        )
      }

      if (error.message === 'INVALID_EMPLOYMENT_RATE') {
        return NextResponse.json(
          { error: 'Количество ставок сотрудника должно быть больше нуля' },
          { status: 400 }
        )
      }

      if (error.message === 'INSUFFICIENT_POSITION_RATE') {
        return NextResponse.json(
          { error: 'Недостаточно свободных ставок по выбранной должности' },
          { status: 400 }
        )
      }

      if (error.message === 'MISSING_EMPLOYEE_ID') {
        return NextResponse.json(
          { error: 'Сотрудник обязателен для этого действия' },
          { status: 400 }
        )
      }

      if (error.message === 'MISSING_CONTRACT_END_DATE') {
        return NextResponse.json(
          { error: 'Новая дата окончания контракта обязательна' },
          { status: 400 }
        )
      }

      if (error.message === 'INVALID_CONTRACT_DATE') {
        return NextResponse.json(
          { error: 'Некорректная дата договора' },
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
      { error: 'Ошибка при создании кадрового действия' },
      { status: 500 }
    )
  }
}
