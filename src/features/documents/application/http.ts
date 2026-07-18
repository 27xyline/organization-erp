import { Readable } from 'node:stream'
import type { NextRequest } from 'next/server'
import { z, ZodError } from 'zod'
import { DocumentServiceError } from './document.service'
import { DocumentFilePolicyError } from '../domain/file-policy'
import { LocalStorageError } from '../infrastructure/local-filesystem-storage'
import { apiError, apiValidationError } from '@/lib/http/api-response'

const MAX_METADATA_HEADER_BYTES = 12_000

export class DocumentUploadRequestError extends Error {
  constructor(
    public readonly code:
      | 'MISSING_BODY'
      | 'MISSING_METADATA'
      | 'INVALID_METADATA'
      | 'INVALID_CONTENT_LENGTH',
    message: string,
  ) {
    super(message)
    this.name = 'DocumentUploadRequestError'
  }
}

export function parseUploadMetadata<TSchema extends z.ZodTypeAny>(
  request: NextRequest,
  schema: TSchema,
): z.output<TSchema> {
  const encoded = request.headers.get('x-document-metadata')
  if (!encoded) {
    throw new DocumentUploadRequestError(
      'MISSING_METADATA',
      'Не переданы сведения о документе',
    )
  }
  if (encoded.length > MAX_METADATA_HEADER_BYTES) {
    throw new DocumentUploadRequestError(
      'INVALID_METADATA',
      'Сведения о документе слишком большие',
    )
  }

  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8')
    return schema.parse(JSON.parse(decoded))
  } catch (error) {
    if (error instanceof ZodError) throw error
    throw new DocumentUploadRequestError(
      'INVALID_METADATA',
      'Не удалось прочитать сведения о документе',
    )
  }
}

export function requestUploadStream(request: NextRequest) {
  if (!request.body) {
    throw new DocumentUploadRequestError('MISSING_BODY', 'Файл не передан')
  }

  const rawLength = request.headers.get('content-length')
  let declaredSizeBytes: number | undefined
  if (rawLength) {
    declaredSizeBytes = Number(rawLength)
    if (!Number.isSafeInteger(declaredSizeBytes) || declaredSizeBytes < 0) {
      throw new DocumentUploadRequestError(
        'INVALID_CONTENT_LENGTH',
        'Некорректный размер файла',
      )
    }
  }

  return {
    stream: Readable.fromWeb(request.body as never),
    mimeType: request.headers.get('content-type'),
    declaredSizeBytes,
  }
}

export async function parseJsonRequest(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new DocumentUploadRequestError(
      'INVALID_METADATA',
      'Тело запроса должно содержать корректный JSON',
    )
  }
}

export function documentApiError(error: unknown) {
  if (error instanceof ZodError) return apiValidationError(error)
  if (error instanceof DocumentUploadRequestError) {
    return apiError(error.code, error.message, 422)
  }
  if (error instanceof DocumentFilePolicyError) {
    return apiError(error.code, error.message, 422)
  }
  if (error instanceof LocalStorageError) {
    const status = error.code === 'OBJECT_NOT_FOUND' ? 404 : 422
    return apiError(error.code, error.message, status)
  }
  if (error instanceof DocumentServiceError) {
    const responses: Record<
      DocumentServiceError['code'],
      { message: string; status: number }
    > = {
      NOT_FOUND: { message: 'Документ или версия не найдены', status: 404 },
      FORBIDDEN: { message: 'Недостаточно прав', status: 403 },
      INVALID_STATE: {
        message: 'Операция недоступна в текущем статусе документа',
        status: 409,
      },
      OPTIMISTIC_LOCK_CONFLICT: {
        message: 'Документ уже изменён другим пользователем. Обновите страницу',
        status: 409,
      },
      LINK_NOT_FOUND: {
        message: 'Связанный проект, сотрудник или объект имущества не найден',
        status: 422,
      },
      STORAGE_CORRUPTED: {
        message: 'Файл повреждён или отсутствует в хранилище',
        status: 503,
      },
    }
    const response = responses[error.code]
    return apiError(error.code, response.message, response.status)
  }
  throw error
}

export function contentDisposition(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7E]/g, '_')
    .replaceAll('\\', '_')
    .replaceAll('"', '_')
    .slice(0, 120) || 'document'
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
