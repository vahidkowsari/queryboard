import { describe, it, expect } from 'vitest'
import { ROLES, type AppRole } from '../auth.js'

describe('auth constants', () => {
  describe('ROLES', () => {
    it('defines admin, editor, and viewer roles', () => {
      expect(ROLES.ADMIN).toBe('admin')
      expect(ROLES.EDITOR).toBe('editor')
      expect(ROLES.VIEWER).toBe('viewer')
    })

    it('has exactly 3 roles', () => {
      expect(Object.keys(ROLES)).toHaveLength(3)
    })

    it('all values are unique', () => {
      const values = Object.values(ROLES)
      expect(new Set(values).size).toBe(values.length)
    })

    it('role values are lowercase strings', () => {
      for (const role of Object.values(ROLES)) {
        expect(role).toBe(role.toLowerCase())
        expect(typeof role).toBe('string')
      }
    })
  })

  describe('AppRole type coverage', () => {
    it('accepts all valid role values', () => {
      const validRoles: AppRole[] = ['admin', 'editor', 'viewer']
      expect(validRoles).toContain(ROLES.ADMIN)
      expect(validRoles).toContain(ROLES.EDITOR)
      expect(validRoles).toContain(ROLES.VIEWER)
    })
  })
})
