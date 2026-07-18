import { NextRequest, NextResponse } from 'next/server'
import {
  projectPayrollDeleteSchema,
  projectPayrollSaveSchema,
} from '@/features/finance/contracts/project-payroll'
import {
  getProjectPayrollErrorMeta,
  ProjectPayrollService,
} from '@/features/finance/application/project-payroll.service'
import { validateRequest } from '@/lib/http/validate-request'
import { AuthorizationError, authorizeApiRequest } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

const getCurrentYear = () => new Date().getFullYear()

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'projectPayroll.read')
  if (auth.response) return auth.response

  const params = await props.params;
  if (!auth.access.allows('projectPayroll.read', { projectId: params.id })) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  try {
    const yearParam = request.nextUrl.searchParams.get('year')
    const year = yearParam ? Number.parseInt(yearParam, 10) : getCurrentYear()

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid payroll year' },
        { status: 400 }
      )
    }

    const result = await ProjectPayrollService.getTable(params.id, year, auth.access)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching project payroll:', error)

    const routeError = getProjectPayrollErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }

    return NextResponse.json(
      { error: 'Не удалось загрузить таблицу выплат' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, {
    anyOf: ['projectPayroll.create', 'projectPayroll.update'],
  })
  if (auth.response) return auth.response

  const params = await props.params;
  if (
    !auth.access.allows('projectPayroll.create', { projectId: params.id }) &&
    !auth.access.allows('projectPayroll.update', { projectId: params.id })
  ) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  try {
    const data = await request.json()
    const validation = validateRequest(projectPayrollSaveSchema, data)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const result = await ProjectPayrollService.saveCell(params.id, validation.data, auth.access)

    return NextResponse.json({
      success: true,
      cell: result.cell,
    })
  } catch (error) {
    console.error('Error saving project payroll cell:', error)

    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }
    const routeError = getProjectPayrollErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }

    return NextResponse.json(
      { error: 'Не удалось сохранить начисление' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'projectPayroll.delete')
  if (auth.response) return auth.response

  const params = await props.params;
  if (!auth.access.allows('projectPayroll.delete', { projectId: params.id })) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  try {
    const data = await request.json()
    const validation = validateRequest(projectPayrollDeleteSchema, data)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    await ProjectPayrollService.clearCell(params.id, validation.data, auth.access)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error clearing project payroll cell:', error)

    const routeError = getProjectPayrollErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }

    return NextResponse.json(
      { error: 'Не удалось очистить начисление' },
      { status: 500 }
    )
  }
}
