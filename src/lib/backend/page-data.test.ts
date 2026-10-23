import { describe, expect, it } from 'vitest'
import { readBackendList } from './page-data'

describe('readBackendList', () => {
  it('returns the typed data rows and pagination metadata', async () => {
    const result = await readBackendList<{ id: string }>(new Response(JSON.stringify({
      data: [{ id: 'doc-1' }],
      pagination: { page: 2, pageSize: 10, total: 21, totalPages: 3 },
    })), 'Documents unavailable')

    expect(result).toEqual({
      data: [{ id: 'doc-1' }],
      pagination: { page: 2, pageSize: 10, total: 21, totalPages: 3 },
    })
  })

  it('rejects a missing pagination envelope', async () => {
    await expect(readBackendList(new Response(JSON.stringify({ data: [] })), 'Documents unavailable'))
      .rejects.toMatchObject({ name: 'BackendRequestError', status: 502 })
  })
})
