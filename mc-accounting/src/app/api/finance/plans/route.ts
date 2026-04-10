import { NextRequest, NextResponse } from 'next/server'
import { FinancePlanType } from '@prisma/client'
import { financePlanDeleteSchema, financePlanSaveSchema } from '@/lib/schemas/finance-plan'
import {
  FinancePlanService,
  getCurrentYear,
  getFinancePlanErrorMeta,
  getPlanType,
} from '@/lib/services/finance-plan.service'
import { validateRequest } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get('year')
    const year = yearParam ? Number.parseInt(yearParam, 10) : getCurrentYear()
    const type = getPlanType(request.nextUrl.searchParams.get('type'))

    if (!type) {
      return NextResponse.json(
        { error: 'Invalid finance plan type' },
        { status: 400 }
      )
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid finance year' },
        { status: 400 }
      )
    }

    const result = await FinancePlanService.getTable(type, year)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching finance plan table:', error)
    return NextResponse.json(
      { error: 'Failed to fetch finance plan table' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const validation = validateRequest(financePlanSaveSchema, data)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const result = await FinancePlanService.saveCell(validation.data)

    return NextResponse.json({
      success: true,
      cell: result.cell,
      projects: result.projects,
    })
  } catch (error) {
    console.error('Error saving finance plan cell:', error)

    const routeError = getFinancePlanErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }

    return NextResponse.json(
      { error: 'Failed to save finance plan cell' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const data = await request.json()
    const validation = validateRequest(financePlanDeleteSchema, data)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    await FinancePlanService.clearCell(validation.data)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting finance plan cell:', error)
    return NextResponse.json(
      { error: 'Failed to delete finance plan cell' },
      { status: 500 }
    )
  }
}
