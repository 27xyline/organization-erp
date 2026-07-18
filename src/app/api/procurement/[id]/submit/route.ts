import type { NextRequest } from 'next/server'
import { ApprovalService } from '@/features/approvals/application/approval.service'
import { getProcurementService } from '@/features/procurement/application/procurement.service'
import { procurementApiError } from '@/features/procurement/application/http'
import { submitProcurementSchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.submit')
  if (auth.response) return auth.response
  const input = submitProcurementSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(
      await getProcurementService().submit(
        (await context.params).id,
        input.data,
        auth.user.id,
        auth.requestId,
        (approvalInput) => new ApprovalService().create(
          approvalInput,
          auth.user.id,
          auth.requestId,
        ),
      ),
    )
  } catch (error) {
    return procurementApiError(error)
  }
}
