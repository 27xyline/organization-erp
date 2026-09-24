export const DOCUMENT_MIME_BY_EXTENSION = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv: ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
  txt: ['text/plain'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  zip: ['application/zip', 'application/x-zip-compressed'],
} as const

export const DOCUMENT_ACCEPT_ATTRIBUTE = Object.keys(DOCUMENT_MIME_BY_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(',')
