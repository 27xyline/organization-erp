import path from 'node:path'
import { DOCUMENT_MIME_BY_EXTENSION } from './document-file-types'

const HARD_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024
const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024

export class DocumentFilePolicyError extends Error {
  constructor(
    public readonly code:
      | 'EMPTY_FILE'
      | 'FILE_TOO_LARGE'
      | 'INVALID_FILENAME'
      | 'UNSUPPORTED_EXTENSION'
      | 'MIME_MISMATCH',
    message: string,
  ) {
    super(message)
    this.name = 'DocumentFilePolicyError'
  }
}

export interface ValidatedDocumentFile {
  originalFilename: string
  extension: string
  mimeType: string
}

export function getDocumentMaxFileSizeBytes(): number {
  const raw = process.env.DOCUMENT_MAX_FILE_SIZE_BYTES
  if (!raw) return DEFAULT_MAX_FILE_SIZE_BYTES

  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > HARD_MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `DOCUMENT_MAX_FILE_SIZE_BYTES must be an integer between 1 and ${HARD_MAX_FILE_SIZE_BYTES}`,
    )
  }
  return parsed
}

function normalizeFilename(filename: string): string {
  const basename = path.basename(filename.replaceAll('\\', '/')).normalize('NFC').trim()
  const withoutControls = basename.replace(/[\u0000-\u001f\u007f]/g, '')

  if (
    withoutControls.length === 0
    || withoutControls === '.'
    || withoutControls === '..'
    || withoutControls.length > 255
  ) {
    throw new DocumentFilePolicyError('INVALID_FILENAME', 'Некорректное имя файла')
  }

  return withoutControls
}

export function validateDocumentFile(input: {
  filename: string
  mimeType?: string | null
  sizeBytes?: number
  maxSizeBytes?: number
}): ValidatedDocumentFile {
  const maxSizeBytes = input.maxSizeBytes ?? getDocumentMaxFileSizeBytes()
  if (input.sizeBytes !== undefined) {
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
      throw new DocumentFilePolicyError('EMPTY_FILE', 'Файл пуст')
    }
    if (input.sizeBytes > maxSizeBytes) {
      throw new DocumentFilePolicyError(
        'FILE_TOO_LARGE',
        `Размер файла превышает ${Math.floor(maxSizeBytes / 1024 / 1024)} МБ`,
      )
    }
  }

  const originalFilename = normalizeFilename(input.filename)
  const extension = path.extname(originalFilename).slice(1).toLowerCase()
  const allowedMimes = DOCUMENT_MIME_BY_EXTENSION[
    extension as keyof typeof DOCUMENT_MIME_BY_EXTENSION
  ]
  if (!allowedMimes) {
    throw new DocumentFilePolicyError(
      'UNSUPPORTED_EXTENSION',
      'Поддерживаются PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, PNG, JPG и ZIP',
    )
  }

  const declaredMime = input.mimeType?.split(';', 1)[0]?.trim().toLowerCase()
  const mimeType = declaredMime || allowedMimes[0]
  if (!(allowedMimes as readonly string[]).includes(mimeType)) {
    throw new DocumentFilePolicyError(
      'MIME_MISMATCH',
      'Тип файла не соответствует его расширению',
    )
  }

  return { originalFilename, extension, mimeType }
}
