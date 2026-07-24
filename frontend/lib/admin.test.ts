import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAdminRequest } from './admin'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isAdminRequest', () => {
  it('accepts only the configured x-admin-key', () => {
    vi.stubEnv('ADMIN_KEY', 'owner-key')
    expect(
      isAdminRequest(
        new Request('http://test', {
          headers: { 'x-admin-key': 'owner-key' },
        })
      )
    ).toBe(true)
    expect(isAdminRequest(new Request('http://test'))).toBe(false)
  })
})
