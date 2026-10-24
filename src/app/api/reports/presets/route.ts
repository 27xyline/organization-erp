import { NextRequest, NextResponse } from 'next/server'
import { reportPresetSchema } from '@/features/reporting/contracts/report-presets'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage12Request } from '@/lib/backend/stage12'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'reports.read')
  if (auth.response) return auth.response

  return proxyStage12Request(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'reports.read')
  if (auth.response) return auth.response

  try {
    const body = await request.clone().json()
    const parsed = reportPresetSchema.safeParse(body)
    if (!parsed.success) return apiValidationError(parsed.error)

    return proxyStage12Request(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'reports.read')
  if (auth.response) return auth.response

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 })
  }

  return proxyStage12Request(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}
