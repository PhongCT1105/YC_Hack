import { describe, expect, it } from 'vitest'
import { requiredWorkspaceId } from './workspaceRequest'

describe('requiredWorkspaceId', () => {
  it('returns the selected workspace id', () => {
    expect(
      requiredWorkspaceId(
        new Request('https://app.test/api/workers?sprintId=ws-2')
      )
    ).toBe('ws-2')
  })

  it('does not invent a latest workspace fallback', () => {
    expect(
      requiredWorkspaceId(new Request('https://app.test/api/workers'))
    ).toBeNull()
  })
})
