import type { NextRequest } from 'next/server'
import { PersonnelActionService } from '@/features/employees/application/personnel-action.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'
import { apiError } from '@/lib/http/api-response'
import { personnelActionTarget } from '@/lib/auth/resource-scopes'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'personnelActions.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await personnelActionTarget(id)
  if (target && !auth.access.allows('personnelActions.delete', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  return apiData(await PersonnelActionService.delete(id, auth.user.id, auth.requestId))
}
