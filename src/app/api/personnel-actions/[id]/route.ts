import type { NextRequest } from 'next/server'
import { PersonnelActionService } from '@/features/employees/application/personnel-action.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  return apiData(await PersonnelActionService.delete((await params).id, auth.user.id, auth.requestId))
}
