import type { NextRequest } from 'next/server'
import { PersonnelActionService } from '@/features/employees/application/personnel-action.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'personnelActions.sync')
  if (auth.response) return auth.response
  const createdCount = await PersonnelActionService.syncExpiredContracts(auth.access)
  return apiData({ success: true, createdCount })
}
