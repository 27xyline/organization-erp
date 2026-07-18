import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { FinancePlanService } from '@/features/finance/application/finance-plan.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

export const dynamic = 'force-dynamic'

const yearSchema = z.coerce.number().int().min(2000).max(2100)

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'finance.salary.read')
  if (auth.response) return auth.response
  const year = yearSchema.safeParse(request.nextUrl.searchParams.get('year') || new Date().getFullYear())
  if (!year.success) return apiValidationError(year.error)
  return apiData(await FinancePlanService.getSalaryTable(year.data, auth.access))
}
