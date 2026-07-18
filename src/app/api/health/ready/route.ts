import { getDb } from '@/lib/prisma'
import { apiData, apiError } from '@/lib/http/api-response'
import { logger } from '@/lib/logger'
import { getDocumentStorage } from '@/features/documents/infrastructure/document-storage'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestId = request.headers.get('x-request-id')?.slice(0, 128) || crypto.randomUUID()
  try {
    await Promise.all([
      getDb().$queryRaw`SELECT 1`,
      getDocumentStorage().healthCheck(),
    ])
    return apiData({ status: 'ready', timestamp: new Date().toISOString() }, {
      headers: { 'x-request-id': requestId },
    })
  } catch (error) {
    logger.error('readiness_check_failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
    const response = apiError('DATABASE_UNAVAILABLE', 'База данных недоступна', 503)
    response.headers.set('x-request-id', requestId)
    return response
  }
}
