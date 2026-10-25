import { describe, expect, it } from 'vitest'
import { PROJECT_TEMPLATES } from './templates'

describe('PROJECT_TEMPLATES', () => {
  it('references only earlier tasks and ends with a milestone', () => {
    Object.values(PROJECT_TEMPLATES).forEach((template) => {
      template.tasks.forEach((task, index) => {
        expect(task.predecessors.every((predecessor) => predecessor < index)).toBe(true)
      })
      expect('isMilestone' in template.tasks.at(-1)!).toBe(true)
    })
  })
})
