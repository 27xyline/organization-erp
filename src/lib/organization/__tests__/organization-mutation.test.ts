import { describe, expect, it, vi } from 'vitest'
import {
  ORGANIZATION_ADVISORY_LOCK_KEY,
  withOrganizationMutation,
} from '../organization-mutation'

describe('withOrganizationMutation', () => {
  it('acquires the shared transaction lock before invoking domain work', async () => {
    const events: string[] = []
    const tx = {
      $queryRaw: vi.fn().mockImplementation(async () => {
        events.push('lock')
        return [{ lock: '' }]
      }),
    }
    const db = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    }

    const result = await withOrganizationMutation(db as never, async (lockedTx) => {
      expect(lockedTx).toBe(tx)
      events.push('operation')
      return 'done'
    })

    expect(result).toBe('done')
    expect(events).toEqual(['lock', 'operation'])
    const [query, lockKey] = tx.$queryRaw.mock.calls[0]
    expect(Array.from(query).join('?')).toContain('pg_advisory_xact_lock(?)::text')
    expect(lockKey).toBe(ORGANIZATION_ADVISORY_LOCK_KEY)
  })
})
