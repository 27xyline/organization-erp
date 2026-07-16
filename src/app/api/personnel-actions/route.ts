import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { employeeSelect, getPersonnelActionRouteErrorMeta } from '@/lib/services/hr-domain'
import { PersonnelActionService } from '@/lib/services/personnel-action.service'
import { createPersonnelActionSchema, validateRequest } from '@/lib/validations'

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

    const result = await PersonnelActionService.createAction(validation.data)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error creating personnel action:', error)

    const routeError = getPersonnelActionRouteErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }

    return NextResponse.json(
      { error: 'Ошибка при создании кадрового действия' },
      { status: 500 }
    )
  }
}
