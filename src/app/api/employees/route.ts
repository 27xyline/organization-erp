import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getStartOfToday } from '@/lib/employees'
import {
  ensureValidContractDateRange,
  ensureValidEmploymentRate,
  getEmployeeRouteErrorMeta,
  parseOptionalDate,
  parseRequiredDate,
  resolveAssignablePosition,
} from '@/lib/services/hr-domain'
import { createEmployeeSchema, validateRequest } from '@/lib/validations'

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
    const page = Number(request.nextUrl.searchParams.get('page')) || 1
    const limit = Number(request.nextUrl.searchParams.get('limit')) || 50
    const skip = (page - 1) * limit

    const [employees, total] = await prisma.$transaction([
      prisma.employee.findMany({
        where,
        orderBy: scope === 'all' ? { createdAt: 'desc' } : { fullName: 'asc' },
        include: {
          staffSchedule: true,
        },
        skip,
        take: limit,
      }),
      prisma.employee.count({ where }),
    ])
    
    return NextResponse.json({
      data: employees,
      total,
      page,
      limit,
    })
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
    const body = await request.json()
    const validation = validateRequest(createEmployeeSchema, body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }
    
    const data = validation.data
    const contractSignedDate = parseRequiredDate(data.contractSignedDate)
    const contractEndDate = parseOptionalDate(data.contractEndDate)
    const employmentRate = data.employmentRate

    ensureValidEmploymentRate(employmentRate)
    ensureValidContractDateRange(contractSignedDate, contractEndDate)

    const employee = await prisma.$transaction(async (tx) => {
      const position = await resolveAssignablePosition(tx, {
        staffScheduleId: data.staffScheduleId,
        employmentRate,
        status: 'ACTIVE',
      })

      const createdEmployee = await tx.employee.create({
        data: {
          code: data.code,
          fullName: data.fullName,
          department: position!.department,
          photo: data.photo,
          phone: data.phone,
          email: data.email,
          contractType: data.contractType || 'PRIMARY',
          contractSignedDate,
          contractEndDate,
          contractNumber: data.contractNumber,
          staffScheduleId: data.staffScheduleId,
          employmentRate,
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
          newDepartment: position!.department,
          oldPosition: null,
          newPosition: position!.position,
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

    const routeError = getEmployeeRouteErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }

    return NextResponse.json(
      { error: 'Ошибка при создании сотрудника' },
      { status: 500 }
    )
  }
}
