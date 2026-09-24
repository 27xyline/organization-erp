import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { getAssetSavedViewService } from '@/features/assets/application/saved-view.service'
import {
  assetSavedViewFiltersSchema,
  createAssetSavedViewSchema,
} from '@/features/assets/contracts/saved-view'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response

  const views = await getAssetSavedViewService().list(auth.user.id)
  return apiData(views.map((view) => ({
    ...view,
    filters: assetSavedViewFiltersSchema.parse(view.filters),
  })))
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response

  const input = createAssetSavedViewSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)

  try {
    return apiData(
      await getAssetSavedViewService().create(auth.user.id, input.data),
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('SAVED_VIEW_EXISTS', 'Представление с таким названием уже существует', 409)
    }
    throw error
  }
}
