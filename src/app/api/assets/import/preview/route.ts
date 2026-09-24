import type { NextRequest } from 'next/server'
import {
  AssetImportError,
  AssetImportService,
  MAX_ASSET_IMPORT_FILE_BYTES,
} from '@/features/assets/application/asset-import.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError } from '@/lib/http/api-response'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.create')
  if (auth.response) return auth.response

  const form = await request.formData().catch(() => null)
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

  try {
    const rows = await AssetImportService.parseWorkbook(Buffer.from(await file.arrayBuffer()))
    const preview = await AssetImportService.preview(rows, auth.access)
    return apiData({
      rows: preview,
      validCount: preview.filter((row) => row.input && row.errors.length === 0).length,
      errorCount: preview.filter((row) => row.errors.length > 0).length,
    })
  } catch (error) {
    if (error instanceof AssetImportError) {
      return apiError('ASSET_IMPORT_INVALID_FILE', error.message, 422)
    }
    throw error
  }
}
