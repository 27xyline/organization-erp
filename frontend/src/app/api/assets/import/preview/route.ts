import type { NextRequest } from 'next/server'
import { MAX_ASSET_IMPORT_FILE_BYTES } from '@/features/assets/contracts/asset-import'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError } from '@/lib/http/api-response'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.create')
  if (auth.response) return auth.response

  const form = await request.clone().formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function' || typeof file.size !== 'number') {
    return apiError('ASSET_IMPORT_FILE_REQUIRED', 'Выберите файл Excel для проверки', 422)
  }
  if (!file.name.toLocaleLowerCase('ru-RU').endsWith('.xlsx')) {
    return apiError('ASSET_IMPORT_FORMAT_UNSUPPORTED', 'Поддерживается шаблон Excel в формате .xlsx', 422)
  }
  if (file.size > MAX_ASSET_IMPORT_FILE_BYTES) {
    return apiError('ASSET_IMPORT_FILE_TOO_LARGE', 'Файл слишком большой. Максимальный размер — 5 МБ', 422)
  }

  return proxyStage07Request(request, '/api/assets/import/preview', auth.user, auth.requestId)
}
