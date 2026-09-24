import { Prisma, type PrismaClient } from '@prisma/client'
import { getDb } from '@/lib/prisma'
import type { CreateAssetSavedViewInput } from '../contracts/saved-view'

const summary = { id: true, name: true, filters: true } satisfies Prisma.AssetSavedViewSelect

export class AssetSavedViewService {
  constructor(private readonly db: PrismaClient = getDb()) {}

  list(userId: string) {
    return this.db.assetSavedView.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      select: summary,
    })
  }

  create(userId: string, input: CreateAssetSavedViewInput) {
    const filters = Object.fromEntries(
      Object.entries(input.filters).filter(([, value]) => value !== undefined),
    ) as Prisma.InputJsonValue

    return this.db.assetSavedView.create({
      data: {
        userId,
        name: input.name,
        filters,
      },
      select: summary,
    })
  }

  async delete(userId: string, viewId: string): Promise<boolean> {
    const result = await this.db.assetSavedView.deleteMany({
      where: { id: viewId, userId },
    })
    return result.count === 1
  }
}

let service: AssetSavedViewService | undefined

export function getAssetSavedViewService() {
  service ??= new AssetSavedViewService()
  return service
}
