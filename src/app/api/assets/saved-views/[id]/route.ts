import type { NextRequest } from 'next/server'
import { getAssetSavedViewService } from '@/features/assets/application/saved-view.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError } from '@/lib/http/api-response'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response

  const { id } = await context.params
  const deleted = await getAssetSavedViewService().delete(auth.user.id, id)
  if (!deleted) {
    return apiError('SAVED_VIEW_NOT_FOUND', 'Представление не найдено', 404)
  }
  return new Response(null, { status: 204 })
}
