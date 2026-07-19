import { NextRequest, NextResponse } from 'next/server'
import { financePlanDeleteSchema, financePlanSaveSchema } from '@/features/finance/contracts/finance-plan'
import {
  FinancePlanService,
  getFinancePlanErrorMeta,
} from '@/features/finance/application/finance-plan.service'
import { getCurrentYear, getPlanType } from '@/features/finance/domain/finance-plan'
import { validateRequest } from '@/lib/http/validate-request'
import { AuthorizationError, authorizeApiRequest } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'financePlans.read')
  if (auth.response) return auth.response

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

    const result = await FinancePlanService.getTable(type, year, auth.access)

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
  const auth = await authorizeApiRequest(request, {
    anyOf: ['financePlans.create', 'financePlans.update'],
  })
  if (auth.response) return auth.response

  try {
    const data = await request.json()
    const validation = validateRequest(financePlanSaveSchema, data)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const result = await FinancePlanService.saveCell(validation.data, auth.access)

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
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }

    return NextResponse.json(
      { error: 'Failed to save finance plan cell' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'financePlans.delete')
  if (auth.response) return auth.response

  try {
    const data = await request.json()
    const validation = validateRequest(financePlanDeleteSchema, data)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    await FinancePlanService.clearCell(validation.data, auth.access)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting finance plan cell:', error)
    const routeError = getFinancePlanErrorMeta(error)
    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Failed to delete finance plan cell' },
      { status: 500 }
    )
  }
}
