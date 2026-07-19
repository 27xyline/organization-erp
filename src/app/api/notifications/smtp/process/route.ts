import type { NextRequest } from 'next/server'
import { SmtpService } from '@/features/notifications/application/smtp.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.update')
  if (auth.response) return auth.response

  const result = await SmtpService.processOutbox()
  return apiData(result)
}
