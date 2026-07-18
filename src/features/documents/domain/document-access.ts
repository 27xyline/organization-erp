import type { Prisma } from '@prisma/client'
import type { AccessContext, PermissionTarget } from '@/lib/auth/access-context'
import type { Permission } from '@/lib/auth/permissions'

export interface DocumentActor {
  id: string
  access: AccessContext
}

export class DocumentAuthorizationError extends Error {
  constructor() {
    super('FORBIDDEN')
    this.name = 'DocumentAuthorizationError'
  }
}

export function documentVisibilityWhere(
  actor: DocumentActor,
  permission: Extract<Permission, `documents.${string}`>,
): Prisma.DocumentWhereInput {
  if (!actor.access.has(permission)) throw new DocumentAuthorizationError()
  return actor.access.documentWhere(permission) as Prisma.DocumentWhereInput
}

export function assertDocumentPermission(
  actor: DocumentActor,
  permission: Extract<Permission, `documents.${string}`>,
  target?: PermissionTarget,
): void {
  const allowed = target
    ? actor.access.allows(permission, target)
    : actor.access.has(permission)
  if (!allowed) throw new DocumentAuthorizationError()
}
