import type { Prisma } from '@prisma/client'

export interface DocumentActor {
  id: string
  role: string
}

export class DocumentAuthorizationError extends Error {
  constructor() {
    super('FORBIDDEN')
    this.name = 'DocumentAuthorizationError'
  }
}

/**
 * Compatibility boundary for the legacy ADMIN / EDITOR / VIEWER roles.
 * Scoped RBAC can replace these three functions without changing storage,
 * transaction, or HTTP streaming code.
 */
export function documentVisibilityWhere(_actor: DocumentActor): Prisma.DocumentWhereInput {
  return {}
}

export function assertCanReadDocument(_actor: DocumentActor): void {
  // Every authenticated legacy role can read document metadata and bytes.
}

export function assertCanManageDocuments(actor: DocumentActor): void {
  if (!['ADMIN', 'EDITOR'].includes(actor.role)) {
    throw new DocumentAuthorizationError()
  }
}

