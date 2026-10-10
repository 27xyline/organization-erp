import { describe, expect, it } from 'vitest'
import { CatalogService } from '../catalog.service'

describe('catalog TypeScript service ownership', () => {
  it('keeps catalog reads while removing migrated group and MOL writers', () => {
    expect(CatalogService).toHaveProperty('listGroups')
    expect(CatalogService).toHaveProperty('getGroup')
    expect(CatalogService).toHaveProperty('listMols')
    expect(CatalogService).toHaveProperty('getMol')
    for (const writer of [
      'createGroup', 'updateGroup', 'deleteGroup',
      'createMol', 'updateMol', 'deleteMol',
    ]) {
      expect(CatalogService).not.toHaveProperty(writer)
    }
  })
})
