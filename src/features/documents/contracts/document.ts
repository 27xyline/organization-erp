import { DocumentCategory, DocumentStatus } from '@prisma/client'
import { z } from 'zod'

const optionalId = z
  .union([
    z.string().trim().min(1).max(100),
    z.literal('').transform(() => undefined),
  ])
  .optional()

export const documentCategorySchema = z.nativeEnum(DocumentCategory)
export const documentStatusSchema = z.nativeEnum(DocumentStatus)

export const createDocumentMetadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  category: documentCategorySchema.default(DocumentCategory.GENERAL),
  projectId: optionalId,
  employeeId: optionalId,
  assetId: optionalId,
  filename: z.string().min(1).max(1024),
})

export const addDocumentVersionMetadataSchema = z.object({
  filename: z.string().min(1).max(1024),
  comment: z.string().trim().max(500).optional(),
  lockVersion: z.coerce.number().int().positive(),
})

export const changeDocumentStatusSchema = z.object({
  status: z.enum([
    DocumentStatus.DRAFT,
    DocumentStatus.IN_REVIEW,
    DocumentStatus.APPROVED,
    DocumentStatus.SIGNED,
  ]),
  lockVersion: z.coerce.number().int().positive(),
})

export const archiveDocumentSchema = z.object({
  lockVersion: z.coerce.number().int().positive(),
})

export const generateDocumentSchema = z.object({
  template: z.enum(['PERSONNEL_ORDER', 'ACCEPTANCE_ACT']),
  title: z.string().trim().min(1).max(200),
  number: z.string().trim().min(1).max(50),
  date: z.coerce.date(),
  subject: z.string().trim().min(1).max(500),
  details: z.string().trim().min(1).max(5000),
  basis: z.string().trim().max(1000).optional(),
  projectId: optionalId,
  employeeId: optionalId,
  assetId: optionalId,
})

export const documentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  status: documentStatusSchema.optional(),
  category: documentCategorySchema.optional(),
  projectId: optionalId,
  employeeId: optionalId,
  assetId: optionalId,
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default('false'),
})

export type CreateDocumentMetadata = z.infer<typeof createDocumentMetadataSchema>
export type AddDocumentVersionMetadata = z.infer<typeof addDocumentVersionMetadataSchema>
export type ChangeDocumentStatus = z.infer<typeof changeDocumentStatusSchema>
export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>
export type DocumentsQuery = z.infer<typeof documentsQuerySchema>
