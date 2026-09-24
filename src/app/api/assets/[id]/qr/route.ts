import type { NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { AssetService } from '@/features/assets/application/asset.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError } from '@/lib/http/api-response'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response
  const { id } = await context.params
  const asset = await AssetService.get(id, auth.access)
  if (!asset) return apiError('ASSET_NOT_FOUND', 'Имущество не найдено', 404)

  const url = new URL('/assets/inventory/scan', process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin)
  url.searchParams.set('number', asset.inventoryNumber)
  const svg = await QRCode.toString(url.toString(), {
    type: 'svg',
    errorCorrectionLevel: 'Q',
    margin: 2,
    width: 256,
  })
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
