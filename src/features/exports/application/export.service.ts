import { getDb } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access-context'

export class ExportService {
  static async assets(archived?: boolean, access?: AccessContext) {
    const filters: Prisma.AssetWhereInput = archived === undefined ? {} : { isArchived: archived }
    return getDb().asset.findMany({
      where: access
        ? { AND: [filters, access.assetWhere('assets.export') as Prisma.AssetWhereInput] }
        : filters,
      include: {
        group: true,
        holdings: {
          where: { quantity: { gt: 0 } },
          include: { mol: true },
          orderBy: { mol: { code: 'asc' } },
        },
      },
      orderBy: { orderNumber: 'asc' },
    })
  }

  static async operations(access?: AccessContext) {
    return getDb().operation.findMany({
      where: access
        ? { asset: access.assetWhere('assets.export') as Prisma.AssetWhereInput }
        : undefined,
      include: {
        asset: { include: { group: true } },
        fromMol: true,
        toMol: true,
      },
      orderBy: { date: 'desc' },
    })
  }
}
