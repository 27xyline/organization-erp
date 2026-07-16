import { getDb } from '@/lib/prisma'

export class ExportService {
  static async assets(archived?: boolean) {
    return getDb().asset.findMany({
      where: archived === undefined ? undefined : { isArchived: archived },
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

  static async operations() {
    return getDb().operation.findMany({
      include: {
        asset: { include: { group: true } },
        fromMol: true,
        toMol: true,
      },
      orderBy: { date: 'desc' },
    })
  }
}
