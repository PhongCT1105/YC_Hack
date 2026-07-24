import { describe, expect, it } from 'vitest'
import { expertJoinBody } from './expertJoin'

describe('expertJoinBody', () => {
  it('preserves the workspace selected by the Terac task URL', () => {
    expect(expertJoinBody('sub-1', 'ws-7')).toEqual({
      submissionId: 'sub-1',
      workspaceId: 'ws-7',
    })
  })

  it('keeps legacy links usable without inventing a workspace id', () => {
    expect(expertJoinBody('sub-1', null)).toEqual({
      submissionId: 'sub-1',
    })
  })
})
