import { NextRequest, NextResponse } from 'next/server'
import { ReportService } from '@/features/reporting/application/report.service'
import { reportPresetSchema } from '@/features/reporting/contracts/report-presets'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'reports.read')
  if (auth.response) return auth.response

  const presets = await ReportService.listPresets(auth.user.id)
  return NextResponse.json(presets)
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'reports.read')
  if (auth.response) return auth.response

  try {
    const body = await request.json()
    const parsed = reportPresetSchema.safeParse(body)
    if (!parsed.success) return apiValidationError(parsed.error)

    const saved = await ReportService.savePreset(auth.user.id, parsed.data)
    return NextResponse.json(saved, { status: 201 })
  } catch (error) {
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

  await ReportService.deletePreset(auth.user.id, id)
  return new Response(null, { status: 204 })
}
