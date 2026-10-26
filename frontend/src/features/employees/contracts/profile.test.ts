import { describe, expect, it } from 'vitest'
import { employeeProfileSchema } from './profile'

const valid = {
  birthDate: '2000-01-01',
  education: 'Высшее',
  qualification: 'Инженер',
  managerId: null,
  skills: [{ name: 'TypeScript', level: 4 }],
  certificates: [{
    name: 'Охрана труда',
    issuedAt: '2026-01-01',
    expiresAt: '2027-01-01',
  }],
}

describe('employeeProfileSchema', () => {
  it('accepts a complete profile', () => {
    expect(employeeProfileSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects duplicate skills and invalid certificate dates', () => {
    const result = employeeProfileSchema.safeParse({
      ...valid,
      skills: [{ name: 'TypeScript' }, { name: 'typescript' }],
      certificates: [{
        name: 'Охрана труда',
        issuedAt: '2027-01-01',
        expiresAt: '2026-01-01',
      }],
    })
    expect(result.success).toBe(false)
  })
})
