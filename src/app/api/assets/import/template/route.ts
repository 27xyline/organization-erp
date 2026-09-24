import { AssetImportService } from '@/features/assets/application/asset-import.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import type { NextRequest } from 'next/server'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.create')
  if (auth.response) return auth.response

  const buffer = await AssetImportService.createTemplate(auth.access)
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': XLSX_MIME,
      'content-disposition': 'attachment; filename="asset-import-template.xlsx"',
      'cache-control': 'no-store',
    },
  })
}
