import { apiData } from '@/lib/http/api-response'

export const dynamic = 'force-dynamic'

export async function GET() {
  return apiData({ status: 'ok', timestamp: new Date().toISOString() })
}
