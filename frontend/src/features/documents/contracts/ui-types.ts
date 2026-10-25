export type DocumentStatusValue =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'SIGNED'
  | 'ARCHIVED'

export type DocumentCategoryValue =
  | 'GENERAL'
  | 'CONTRACT'
  | 'ORDER'
  | 'ACT'
  | 'INVOICE'
  | 'PERSONNEL'
  | 'PROJECT'
  | 'ASSET'
  | 'OTHER'

export interface DocumentLinkOptions {
  projects: Array<{ id: string; code: string; name: string }>
  employees: Array<{ id: string; code: string; fullName: string }>
  assets: Array<{ id: string; inventoryNumber: string; name: string }>
}

export interface DocumentVersionView {
  id: string
  versionNumber: number
  originalFilename: string
  mimeType: string
  extension: string
  sizeBytes: string
  sha256: string
  comment: string | null
  createdAt: string
  uploadedBy: { id: string; name: string; username: string }
}

export interface DocumentView {
  id: string
  title: string
  description: string | null
  category: DocumentCategoryValue
  status: DocumentStatusValue
  currentVersion: number
  lockVersion: number
  project: { id: string; code: string; name: string } | null
  employee: { id: string; code: string; fullName: string } | null
  asset: { id: string; inventoryNumber: string; name: string } | null
  createdBy: { id: string; name: string; username: string }
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  versions: DocumentVersionView[]
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatusValue, string> = {
  DRAFT: 'Черновик',
  IN_REVIEW: 'На согласовании',
  APPROVED: 'Согласован',
  SIGNED: 'Подписан',
  ARCHIVED: 'В архиве',
}

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategoryValue, string> = {
  GENERAL: 'Общий',
  CONTRACT: 'Договор',
  ORDER: 'Приказ',
  ACT: 'Акт',
  INVOICE: 'Счёт',
  PERSONNEL: 'Кадровый',
  PROJECT: 'Проектный',
  ASSET: 'Имущество',
  OTHER: 'Другое',
}

