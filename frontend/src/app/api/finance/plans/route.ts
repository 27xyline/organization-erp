import type { NextRequest } from 'next/server'
import { financePlanDeleteSchema, financePlanSaveSchema } from '@/features/finance/contracts/finance-plan'
import { FinancePlanType } from '@/lib/contracts/enums'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyFinanceRequest } from '@/lib/backend/finance'
import { validateRequest } from '@/lib/http/validate-request'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'financePlans.read')
  if (auth.response) return auth.response

  const rawYear = request.nextUrl.searchParams.get('year')
  const year = rawYear ? Number.parseInt(rawYear, 10) : new Date().getFullYear()
  const planType = request.nextUrl.searchParams.get('type')
  const normalizedPlanType = planType === 'oklad'
    ? FinancePlanType.OKLAD
    : planType === 'nadbavka'
      ? FinancePlanType.NADBAVKA
      : planType
  if (!Object.values(FinancePlanType).includes(normalizedPlanType as FinancePlanType)) {
    return Response.json({ error: 'Invalid finance plan type' }, { status: 400 })
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: 'Invalid finance year' }, { status: 400 })
  }
  return proxyFinanceRequest(
    request,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    auth.user,
    auth.requestId,
  )
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, {
    anyOf: ['financePlans.create', 'financePlans.update'],
  })
  if (auth.response) return auth.response
  const validation = validateRequest(
    financePlanSaveSchema,
    await request.clone().json().catch(() => null),
  )
  if (!validation.success) return Response.json({ error: validation.error }, { status: 400 })
  return proxyFinanceRequest(request, '/api/finance/plans', auth.user, auth.requestId)
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'financePlans.delete')
  if (auth.response) return auth.response
  const validation = validateRequest(
    financePlanDeleteSchema,
    await request.clone().json().catch(() => null),
  )
  if (!validation.success) return Response.json({ error: validation.error }, { status: 400 })
  return proxyFinanceRequest(request, '/api/finance/plans', auth.user, auth.requestId)
}
