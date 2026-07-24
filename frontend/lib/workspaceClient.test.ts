import { describe, expect, it } from 'vitest'
import { adminHeaders } from './workspaceClient'

describe('adminHeaders', () => {
  it('never fabricates an admin key', () => {
    expect(adminHeaders('owner')).toEqual({ 'x-admin-key': 'owner' })
    expect(adminHeaders(null)).toEqual({})
  })
})
