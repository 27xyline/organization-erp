import { Readable } from 'node:stream'
import {
  DocumentStatus,
  Prisma,
  type PrismaClient,
  DocumentCategory,
} from '@prisma/client'
import type {
  AddDocumentVersionMetadata,
  ChangeDocumentStatus,
  CreateDocumentMetadata,
  DocumentsQuery,
  GenerateDocumentInput,
} from '../contracts/document'
import {
  assertDocumentPermission,
  documentVisibilityWhere,
  DocumentAuthorizationError,
  type DocumentActor,
} from '../domain/document-access'
import {
  getDocumentMaxFileSizeBytes,
  validateDocumentFile,
} from '../domain/file-policy'
import { getDocumentStorage } from '../infrastructure/document-storage'
import type { StoragePort } from '../infrastructure/storage.port'
import { renderDocumentTemplate } from '../domain/document-template'
import { generateDocxBuffer, generatePdfBuffer } from '../domain/template-generator'
import { getDb } from '@/lib/prisma'
import type { PermissionTarget } from '@/lib/auth/access-context'
import type { Permission } from '@/lib/auth/permissions'

const detailInclude = Prisma.validator<Prisma.DocumentInclude>()({
  project: { select: { id: true, code: true, name: true } },
  employee: { select: { id: true, code: true, fullName: true } },
  asset: { select: { id: true, inventoryNumber: true, name: true } },
  createdBy: { select: { id: true, name: true, username: true } },
  versions: {
    orderBy: { versionNumber: 'desc' },
    include: {
      uploadedBy: { select: { id: true, name: true, username: true } },
    },
  },
})

type DocumentWithDetails = Prisma.DocumentGetPayload<{ include: typeof detailInclude }>

export type DocumentServiceErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'OPTIMISTIC_LOCK_CONFLICT'
  | 'LINK_NOT_FOUND'
  | 'STORAGE_CORRUPTED'

export class DocumentServiceError extends Error {
  constructor(
    public readonly code: DocumentServiceErrorCode,
    message?: string,
  ) {
    super(message || code)
    this.name = 'DocumentServiceError'
  }
}

export interface DocumentUpload {
  stream: Readable
  filename: string
  mimeType?: string | null
  declaredSizeBytes?: number
}

export interface DocumentDownload {
  stream: Readable
  sizeBytes: bigint
  filename: string
  mimeType: string
  sha256: string
}

const STATUS_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  DRAFT: [DocumentStatus.IN_REVIEW],
  IN_REVIEW: [DocumentStatus.DRAFT, DocumentStatus.APPROVED],
  APPROVED: [DocumentStatus.IN_REVIEW, DocumentStatus.SIGNED],
  SIGNED: [],
  ARCHIVED: [],
}

export function canTransitionDocumentStatus(
  from: DocumentStatus,
  to: DocumentStatus,
): boolean {
  return STATUS_TRANSITIONS[from].includes(to)
}

function serializeVersion(version: DocumentWithDetails['versions'][number]) {
  return {
    id: version.id,
    documentId: version.documentId,
    versionNumber: version.versionNumber,
    originalFilename: version.originalFilename,
    mimeType: version.mimeType,
    extension: version.extension,
    sizeBytes: version.sizeBytes.toString(),
    sha256: version.sha256,
    comment: version.comment,
    uploadedById: version.uploadedById,
    uploadedBy: version.uploadedBy,
    createdAt: version.createdAt,
  }
}

function serializeDocument(document: DocumentWithDetails) {
  return {
    ...document,
    versions: document.versions.map(serializeVersion),
  }
}

function mapAuthorizationError(error: unknown): never {
  if (error instanceof DocumentAuthorizationError) {
    throw new DocumentServiceError('FORBIDDEN')
  }
  throw error
}

async function acquireDocumentLock(
  tx: Prisma.TransactionClient,
  documentId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${documentId}, 0))::text AS "lock"
  `
}

export class DocumentService {
  constructor(
    private readonly db: PrismaClient = getDb(),
    private readonly storage: StoragePort = getDocumentStorage(),
  ) {}

  private ensurePermission(
    actor: DocumentActor,
    permission: Extract<Permission, `documents.${string}`>,
    target?: PermissionTarget,
  ): void {
    try {
      assertDocumentPermission(actor, permission, target)
    } catch (error) {
      mapAuthorizationError(error)
    }
  }

  private visibility(
    actor: DocumentActor,
    permission: Extract<Permission, `documents.${string}`>,
  ): Prisma.DocumentWhereInput {
    try {
      return documentVisibilityWhere(actor, permission)
    } catch (error) {
      mapAuthorizationError(error)
    }
  }

  private async validateLinks(input: {
    projectId?: string
    employeeId?: string
    assetId?: string
  }): Promise<PermissionTarget> {
    const [project, employee, asset] = await Promise.all([
      input.projectId
        ? this.db.project.findUnique({ where: { id: input.projectId }, select: { id: true } })
        : Promise.resolve(null),
      input.employeeId
        ? this.db.employee.findUnique({
            where: { id: input.employeeId },
            select: { id: true, departmentId: true },
          })
        : Promise.resolve(null),
      input.assetId
        ? this.db.asset.findUnique({
            where: { id: input.assetId },
            select: {
              id: true,
              projectId: true,
              mol: { select: { departmentId: true } },
              holdings: {
                where: { quantity: { gt: 0 } },
                select: { mol: { select: { departmentId: true } } },
              },
            },
          })
        : Promise.resolve(null),
    ])

    if (
      (input.projectId && !project)
      || (input.employeeId && !employee)
      || (input.assetId && !asset)
    ) {
      throw new DocumentServiceError('LINK_NOT_FOUND')
    }
    return {
      documentProjectId: project?.id,
      documentEmployeeId: employee?.id,
      documentEmployeeDepartmentId: employee?.departmentId,
      documentAssetProjectId: asset?.projectId || undefined,
      documentAssetDepartmentIds: asset
        ? Array.from(new Set([
            asset.mol.departmentId,
            ...asset.holdings.map((holding) => holding.mol.departmentId),
          ]))
        : [],
    }
  }

  async list(query: DocumentsQuery, actor: DocumentActor) {
    const where: Prisma.DocumentWhereInput = {
      AND: [
        this.visibility(actor, 'documents.read'),
        query.archived
          ? { status: DocumentStatus.ARCHIVED }
          : { status: { not: DocumentStatus.ARCHIVED } },
        query.status ? { status: query.status } : {},
        query.category ? { category: query.category } : {},
        query.projectId ? { projectId: query.projectId } : {},
        query.employeeId ? { employeeId: query.employeeId } : {},
        query.assetId ? { assetId: query.assetId } : {},
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
                {
                  versions: {
                    some: {
                      originalFilename: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              ],
            }
          : {},
      ],
    }

    const [documents, total] = await Promise.all([
      this.db.document.findMany({
        where,
        include: {
          project: { select: { id: true, code: true, name: true } },
          employee: { select: { id: true, code: true, fullName: true } },
          asset: { select: { id: true, inventoryNumber: true, name: true } },
          createdBy: { select: { id: true, name: true, username: true } },
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: {
              uploadedBy: { select: { id: true, name: true, username: true } },
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.document.count({ where }),
    ])

    return {
      documents: documents.map((document) => ({
        ...document,
        versions: document.versions.map(serializeVersion),
      })),
      total,
    }
  }

  async get(documentId: string, actor: DocumentActor) {
    const document = await this.db.document.findFirst({
      where: {
        id: documentId,
        ...this.visibility(actor, 'documents.read'),
      },
      include: detailInclude,
    })
    if (!document) throw new DocumentServiceError('NOT_FOUND')
    return serializeDocument(document)
  }

  async create(
    metadata: CreateDocumentMetadata,
    upload: DocumentUpload,
    actor: DocumentActor,
    requestId?: string,
  ) {
    const target = await this.validateLinks(metadata)
    this.ensurePermission(actor, 'documents.create', target)

    const maxSizeBytes = getDocumentMaxFileSizeBytes()
    const file = validateDocumentFile({
      filename: upload.filename,
      mimeType: upload.mimeType,
      sizeBytes: upload.declaredSizeBytes,
      maxSizeBytes,
    })
    const stored = await this.storage.write(upload.stream, { maxSizeBytes })

    try {
      const document = await this.db.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            title: metadata.title,
            description: metadata.description || null,
            category: metadata.category,
            projectId: metadata.projectId || null,
            employeeId: metadata.employeeId || null,
            assetId: metadata.assetId || null,
            createdById: actor.id,
            versions: {
              create: {
                versionNumber: 1,
                storageKey: stored.storageKey,
                originalFilename: file.originalFilename,
                mimeType: file.mimeType,
                extension: file.extension,
                sizeBytes: stored.sizeBytes,
                sha256: stored.sha256,
                uploadedById: actor.id,
              },
            },
          },
          include: detailInclude,
        })

        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'DOCUMENT_CREATED',
            entityType: 'Document',
            entityId: created.id,
            requestId,
            details: {
              category: created.category,
              status: created.status,
              version: 1,
              mimeType: file.mimeType,
              sizeBytes: stored.sizeBytes.toString(),
              projectId: created.projectId,
              employeeId: created.employeeId,
              assetId: created.assetId,
            },
          },
        })
        return created
      })
      return serializeDocument(document)
    } catch (error) {
      await this.storage.delete(stored.storageKey)
      throw error
    }
  }

  async createGenerated(
    input: GenerateDocumentInput,
    actor: DocumentActor,
    requestId?: string,
  ) {
    const isOrder = input.template === 'PERSONNEL_ORDER'
    const dateStr = new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(input.date)

    const format = input.format || 'docx'
    let content: Buffer
    let mimeType: string
    let extension: string

    if (format === 'pdf') {
      content = await generatePdfBuffer(
        input.number,
        dateStr,
        input.subject,
        input.details,
        input.basis || undefined,
        isOrder,
      )
      mimeType = 'application/pdf'
      extension = '.pdf'
    } else {
      content = await generateDocxBuffer(
        input.number,
        dateStr,
        input.subject,
        input.details,
        input.basis || undefined,
        isOrder,
      )
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      extension = '.docx'
    }

    const category = isOrder ? DocumentCategory.ORDER : DocumentCategory.ACT
    const cleanFilename = input.title
      .normalize('NFC')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 80)
    const filename = `${cleanFilename}${extension}`

    return this.create(
      {
        title: input.title,
        description: `Создано по шаблону: ${isOrder ? 'приказ' : 'акт'} (${format.toUpperCase()})`,
        category,
        projectId: input.projectId,
        employeeId: input.employeeId,
        assetId: input.assetId,
        filename,
      },
      {
        stream: Readable.from(content),
        filename,
        mimeType,
        declaredSizeBytes: content.byteLength,
      },
      actor,
      requestId,
    )
  }

  async addVersion(
    documentId: string,
    metadata: AddDocumentVersionMetadata,
    upload: DocumentUpload,
    actor: DocumentActor,
    requestId?: string,
  ) {
    const preflight = await this.db.document.findFirst({
      where: { id: documentId, ...this.visibility(actor, 'documents.update') },
      select: { id: true, status: true, lockVersion: true },
    })
    if (!preflight) throw new DocumentServiceError('NOT_FOUND')
    if (preflight.status === DocumentStatus.ARCHIVED) {
      throw new DocumentServiceError('INVALID_STATE')
    }
    if (preflight.lockVersion !== metadata.lockVersion) {
      throw new DocumentServiceError('OPTIMISTIC_LOCK_CONFLICT')
    }

    const maxSizeBytes = getDocumentMaxFileSizeBytes()
    const file = validateDocumentFile({
      filename: upload.filename,
      mimeType: upload.mimeType,
      sizeBytes: upload.declaredSizeBytes,
      maxSizeBytes,
    })
    const stored = await this.storage.write(upload.stream, { maxSizeBytes })

    try {
      const document = await this.db.$transaction(async (tx) => {
        await acquireDocumentLock(tx, documentId)
        const current = await tx.document.findFirst({
          where: { id: documentId, ...this.visibility(actor, 'documents.update') },
          select: {
            id: true,
            status: true,
            currentVersion: true,
            lockVersion: true,
          },
        })
        if (!current) throw new DocumentServiceError('NOT_FOUND')
        if (current.status === DocumentStatus.ARCHIVED) {
          throw new DocumentServiceError('INVALID_STATE')
        }
        if (current.lockVersion !== metadata.lockVersion) {
          throw new DocumentServiceError('OPTIMISTIC_LOCK_CONFLICT')
        }

        const nextVersion = current.currentVersion + 1
        await tx.documentVersion.create({
          data: {
            documentId,
            versionNumber: nextVersion,
            storageKey: stored.storageKey,
            originalFilename: file.originalFilename,
            mimeType: file.mimeType,
            extension: file.extension,
            sizeBytes: stored.sizeBytes,
            sha256: stored.sha256,
            comment: metadata.comment || null,
            uploadedById: actor.id,
          },
        })

        const updated = await tx.document.update({
          where: { id: documentId },
          data: {
            currentVersion: nextVersion,
            lockVersion: { increment: 1 },
          },
          include: detailInclude,
        })

        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'DOCUMENT_VERSION_ADDED',
            entityType: 'Document',
            entityId: documentId,
            requestId,
            details: {
              version: nextVersion,
              mimeType: file.mimeType,
              sizeBytes: stored.sizeBytes.toString(),
            },
          },
        })
        return updated
      })
      return serializeDocument(document)
    } catch (error) {
      await this.storage.delete(stored.storageKey)
      throw error
    }
  }

  async changeStatus(
    documentId: string,
    input: ChangeDocumentStatus,
    actor: DocumentActor,
    requestId?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await acquireDocumentLock(tx, documentId)
      const current = await tx.document.findFirst({
        where: { id: documentId, ...this.visibility(actor, 'documents.update') },
        select: { id: true, status: true, lockVersion: true },
      })
      if (!current) throw new DocumentServiceError('NOT_FOUND')
      if (current.lockVersion !== input.lockVersion) {
        throw new DocumentServiceError('OPTIMISTIC_LOCK_CONFLICT')
      }
      if (!canTransitionDocumentStatus(current.status, input.status)) {
        throw new DocumentServiceError('INVALID_STATE')
      }

      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          status: input.status,
          lockVersion: { increment: 1 },
        },
        include: detailInclude,
      })
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'DOCUMENT_STATUS_CHANGED',
          entityType: 'Document',
          entityId: documentId,
          requestId,
          details: { from: current.status, to: input.status },
        },
      })
      return serializeDocument(updated)
    })
  }

  async archive(
    documentId: string,
    lockVersion: number,
    actor: DocumentActor,
    requestId?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await acquireDocumentLock(tx, documentId)
      const current = await tx.document.findFirst({
        where: { id: documentId, ...this.visibility(actor, 'documents.archive') },
        select: { id: true, status: true, lockVersion: true },
      })
      if (!current) throw new DocumentServiceError('NOT_FOUND')
      if (current.lockVersion !== lockVersion) {
        throw new DocumentServiceError('OPTIMISTIC_LOCK_CONFLICT')
      }
      if (current.status === DocumentStatus.ARCHIVED) {
        throw new DocumentServiceError('INVALID_STATE')
      }

      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.ARCHIVED,
          archivedAt: new Date(),
          lockVersion: { increment: 1 },
        },
        include: detailInclude,
      })
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'DOCUMENT_ARCHIVED',
          entityType: 'Document',
          entityId: documentId,
          requestId,
          details: { previousStatus: current.status },
        },
      })
      return serializeDocument(updated)
    })
  }

  async download(
    documentId: string,
    versionNumber: number | undefined,
    actor: DocumentActor,
    requestId?: string,
  ): Promise<DocumentDownload> {
    // Authorization and metadata lookup intentionally happen before any file is opened.
    const document = await this.db.document.findFirst({
      where: { id: documentId, ...this.visibility(actor, 'documents.download') },
      select: {
        id: true,
        currentVersion: true,
        versions: {
          where: versionNumber ? { versionNumber } : undefined,
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            storageKey: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            sha256: true,
          },
        },
      },
    })
    if (!document || document.versions.length === 0) {
      throw new DocumentServiceError('NOT_FOUND')
    }
    const version = document.versions[0]

    const verified = await this.storage.verify(version.storageKey, {
      sizeBytes: version.sizeBytes,
      sha256: version.sha256,
    })
    if (!verified) throw new DocumentServiceError('STORAGE_CORRUPTED')

    const opened = await this.storage.open(version.storageKey, {
      sizeBytes: version.sizeBytes,
      sha256: version.sha256,
    })
    await this.db.auditLog.create({
      data: {
        userId: actor.id,
        action: 'DOCUMENT_DOWNLOADED',
        entityType: 'Document',
        entityId: documentId,
        requestId,
        details: { version: version.versionNumber },
      },
    })

    return {
      stream: opened.stream,
      sizeBytes: opened.sizeBytes,
      filename: version.originalFilename,
      mimeType: version.mimeType,
      sha256: version.sha256,
    }
  }

  async listLinkOptions(actor: DocumentActor) {
    this.ensurePermission(actor, 'documents.create')
    const [projects, employees, assets] = await Promise.all([
      this.db.project.findMany({
        where: {
          AND: [
            actor.access.projectWhere('documents.create'),
            { status: { not: 'ARCHIVED' } },
          ],
        },
        orderBy: { name: 'asc' },
        take: 200,
        select: { id: true, code: true, name: true },
      }),
      this.db.employee.findMany({
        where: {
          AND: [
            actor.access.employeeWhere('documents.create'),
            { status: { not: 'DISMISSED' } },
          ],
        },
        orderBy: { fullName: 'asc' },
        take: 500,
        select: { id: true, code: true, fullName: true },
      }),
      this.db.asset.findMany({
        where: {
          AND: [
            actor.access.assetWhere('documents.create'),
            { isArchived: false },
          ],
        },
        orderBy: { name: 'asc' },
        take: 500,
        select: { id: true, inventoryNumber: true, name: true },
      }),
    ])
    return { projects, employees, assets }
  }
}

let service: DocumentService | undefined

export function getDocumentService(): DocumentService {
  service ??= new DocumentService()
  return service
}

export function setDocumentServiceForTests(value: DocumentService | undefined): void {
  service = value
}
