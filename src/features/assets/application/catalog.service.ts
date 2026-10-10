import { getDb } from '@/lib/prisma'
import type { AccessContext } from '@/lib/auth/access-context'

/** Transitional read-only Prisma access for TypeScript modules outside Stage 04. */
export class CatalogService {
  static listGroups() {
    return getDb().assetGroup.findMany({ orderBy: { code: 'asc' } })
  }

  static listMols(access?: AccessContext) {
    const departmentIds = access?.allowedDepartmentIds('mols.read')
    return getDb().mol.findMany({
      where: departmentIds === null || departmentIds === undefined
        ? undefined
        : { departmentId: { in: departmentIds } },
      orderBy: { code: 'asc' },
    })
  }

  static getGroup(id: string) {
    return getDb().assetGroup.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    })
  }

  static getMol(id: string, access?: AccessContext) {
    const departmentIds = access?.allowedDepartmentIds('mols.read')
    return getDb().mol.findFirst({
      where: {
        id,
        ...(departmentIds === null || departmentIds === undefined
          ? {}
          : { departmentId: { in: departmentIds } }),
      },
      include: { _count: { select: { holdings: true, assets: true } } },
    })
  }
}
