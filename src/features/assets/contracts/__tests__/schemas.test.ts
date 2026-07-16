import { describe, it, expect } from 'vitest'
import { createAssetSchema, createMolSchema, createGroupSchema } from '@/features/assets/contracts/schemas'

describe('Zod Validations', () => {
  describe('createMolSchema', () => {
    it('should validate correctly when all required fields are provided', () => {
      const validMol = {
        code: 'M001',
        department: 'IT',
        fullName: 'Иван Иванов',
        storageLocation: 'Офис 1',
      }
      const result = createMolSchema.safeParse(validMol)
      expect(result.success).toBe(true)
    })

    it('should fail when code is missing', () => {
      const invalidMol = {
        department: 'IT',
        fullName: 'Иван Иванов',
        storageLocation: 'Офис 1',
      }
      const result = createMolSchema.safeParse(invalidMol)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Required')
      }
    })

    it('should fail when fullName exceeds length limit', () => {
      const invalidMol = {
        code: 'M001',
        department: 'IT',
        fullName: 'a'.repeat(201),
        storageLocation: 'Офис 1',
      }
      const result = createMolSchema.safeParse(invalidMol)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('too_big')
      }
    })
  })

  describe('createAssetSchema', () => {
    it('should validate standard asset input', () => {
      const validAsset = {
        name: 'Ноутбук',
        inventoryNumber: 'A123',
        unitPrice: 1000,
        unitOfMeasure: 'шт',
        quantity: 1,
        molId: 'mol_1',
        groupId: 'grp_1',
        recordingDate: '2023-01-01',
        documentType: 'Накладная',
        documentDetails: '№1 от 01.01.2023',
      }
      const result = createAssetSchema.safeParse(validAsset)
      expect(result.success).toBe(true)
    })

    it('should properly coerce unitPrice to number', () => {
      const stringPriceAsset = {
        name: 'Ноутбук',
        inventoryNumber: 'A123',
        unitPrice: '1000.5',
        unitOfMeasure: 'шт',
        quantity: 1,
        molId: 'mol_1',
        groupId: 'grp_1',
        recordingDate: '2023-01-01',
        documentType: 'Накладная',
        documentDetails: '№1 от 01.01.2023',
      }
      const result = createAssetSchema.safeParse(stringPriceAsset)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.unitPrice).toBe(1000.5)
      }
    })

    it('should fail if unitPrice is negative', () => {
      const invalidAsset = {
        name: 'Ноутбук',
        inventoryNumber: 'A123',
        unitPrice: -10,
        unitOfMeasure: 'шт',
        quantity: 1,
        molId: 'mol_1',
        groupId: 'grp_1',
        recordingDate: '2023-01-01',
        documentType: 'Накладная',
        documentDetails: '№1 от 01.01.2023',
      }
      const result = createAssetSchema.safeParse(invalidAsset)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Цена должна быть больше нуля')
      }
    })
  })

  describe('createGroupSchema', () => {
    it('should validate standard group input', () => {
      const validGroup = {
        name: 'Оргтехника',
        code: 'G1',
      }
      const result = createGroupSchema.safeParse(validGroup)
      expect(result.success).toBe(true)
    })
  })
})
