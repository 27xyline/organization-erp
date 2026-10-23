import type { NextRequest } from 'next/server'
import {
  projectPayrollDeleteSchema,
  projectPayrollSaveSchema,
} from '@/features/finance/contracts/project-payroll'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage10Request } from '@/lib/backend/stage10'
import { validateRequest } from '@/lib/http/validate-request'

export const dynamic = 'force-dynamic'

type RouteProps = { params: Promise<{ id: string }> }

const getCurrentYear = () => new Date().getFullYear()

export async function GET(request: NextRequest, props: RouteProps) {
  const auth = await authorizeApiRequest(request, 'projectPayroll.read')
  if (auth.response) return auth.response
  const { id } = await props.params
  if (!auth.access.allows('projectPayroll.read', { projectId: id })) {
    return Response.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  const yearParam = request.nextUrl.searchParams.get('year')
  const year = yearParam ? Number.parseInt(yearParam, 10) : getCurrentYear()
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: 'Invalid payroll year' }, { status: 400 })
  }
  return proxyStage10Request(
    request,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    auth.user,
    auth.requestId,
  )
}

export async function PUT(request: NextRequest, props: RouteProps) {
  const auth = await authorizeApiRequest(request, {
    anyOf: ['projectPayroll.create', 'projectPayroll.update'],
  })
  if (auth.response) return auth.response
  const { id } = await props.params
  if (
    !auth.access.allows('projectPayroll.create', { projectId: id }) &&
    !auth.access.allows('projectPayroll.update', { projectId: id })
  ) {
    return Response.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  const validation = validateRequest(
    projectPayrollSaveSchema,
    await request.clone().json().catch(() => null),
  )
  if (!validation.success) return Response.json({ error: validation.error }, { status: 400 })
  return proxyStage10Request(request, `/api/projects/${id}/payroll`, auth.user, auth.requestId)
}

export async function DELETE(request: NextRequest, props: RouteProps) {
  const auth = await authorizeApiRequest(request, 'projectPayroll.delete')
  if (auth.response) return auth.response
  const { id } = await props.params
  if (!auth.access.allows('projectPayroll.delete', { projectId: id })) {
    return Response.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  const validation = validateRequest(
    projectPayrollDeleteSchema,
    await request.clone().json().catch(() => null),
  )
  if (!validation.success) return Response.json({ error: validation.error }, { status: 400 })
  return proxyStage10Request(request, `/api/projects/${id}/payroll`, auth.user, auth.requestId)
}
