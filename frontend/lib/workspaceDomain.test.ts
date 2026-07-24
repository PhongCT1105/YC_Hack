import { describe, expect, it } from 'vitest'
import {
  adminKeyMatches,
  buildExpertTaskUrl,
  isExplicitLaunchConfirmation,
  stageAfterParticipantJoin,
  stageAfterTaskSubmission,
} from './workspaceDomain'

describe('workspace domain', () => {
  it('builds an expert URL containing only the workspace id', () => {
    expect(buildExpertTaskUrl('https://minion.example/', 'sprint 1')).toBe(
      'https://minion.example/sprint?workspaceId=sprint+1'
    )
  })

  it('requires an explicit launch confirmation', () => {
    expect(isExplicitLaunchConfirmation('Yes, launch recruitment for $30.00')).toBe(true)
    expect(isExplicitLaunchConfirmation('How much would four people cost?')).toBe(false)
  })

  it('moves a joined recruiting workspace to active without reopening complete work', () => {
    expect(stageAfterParticipantJoin('recruiting')).toBe('active')
    expect(stageAfterParticipantJoin('complete')).toBe('complete')
  })

  it('completes only when every nonempty task list is submitted', () => {
    expect(stageAfterTaskSubmission(['submitted', 'submitted'])).toBe('complete')
    expect(stageAfterTaskSubmission(['submitted', 'claimed'])).toBeNull()
    expect(stageAfterTaskSubmission([])).toBeNull()
  })

  it('matches only a nonempty configured admin key', () => {
    expect(adminKeyMatches('secret', 'secret')).toBe(true)
    expect(adminKeyMatches('wrong', 'secret')).toBe(false)
    expect(adminKeyMatches(null, undefined)).toBe(false)
  })
})
