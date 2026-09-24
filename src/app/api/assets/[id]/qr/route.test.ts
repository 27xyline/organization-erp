import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getAsset: vi.fn(),
  encode: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/features/assets/application/asset.service', () => ({ AssetService: { get: mocks.getAsset } }))
vi.mock('qrcode', () => ({ default: { toString: mocks.encode } }))

import { GET } from './route'

describe('assets/[id]/qr route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://erp.example.com')
    mocks.authorize.mockResolvedValue({ access: {}, response: null })
    mocks.encode.mockImplementation(async (value: string) => `<svg>${value}</svg>`)
  })

  afterEach(() => vi.unstubAllEnvs())

  it('returns a scoped QR label target as private SVG', async () => {
    mocks.getAsset.mockResolvedValue({ id: 'asset-4', inventoryNumber: 'INV 42' })
    const request = new NextRequest('http://untrusted.example/api/assets/asset-4/qr')

    const response = await GET(request, { params: Promise.resolve({ id: 'asset-4' }) })

    expect(mocks.authorize).toHaveBeenCalledWith(request, 'assets.read')
    expect(mocks.getAsset).toHaveBeenCalledWith('asset-4', expect.anything())
    expect(mocks.encode).toHaveBeenCalledWith(
      'https://erp.example.com/assets/inventory/scan?number=INV+42',
      expect.objectContaining({ type: 'svg', errorCorrectionLevel: 'Q' }),
    )
    expect(response.headers.get('content-type')).toContain('image/svg+xml')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toContain('https://erp.example.com/assets/inventory/scan')
  })

  it('does not generate a QR code for an asset outside the user scope', async () => {
    mocks.getAsset.mockResolvedValue(null)
    const request = new NextRequest('http://localhost:3001/api/assets/hidden/qr')

    const response = await GET(request, { params: Promise.resolve({ id: 'hidden' }) })

    expect(response.status).toBe(404)
    expect(mocks.encode).not.toHaveBeenCalled()
  })
})
