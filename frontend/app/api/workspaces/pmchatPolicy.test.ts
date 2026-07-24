import { describe, expect, it } from 'vitest'
import { canLaunchFromMessage } from './pmchatPolicy'

describe('planner launch policy', () => {
  it('requires both a real draft and explicit confirmation', () => {
    expect(
      canLaunchFromMessage('Yes, launch recruitment for $30', 'opp-1')
    ).toBe(true)
    expect(canLaunchFromMessage('What is the price?', 'opp-1')).toBe(false)
    expect(
      canLaunchFromMessage('Yes, launch recruitment', 'estimate-1')
    ).toBe(false)
    expect(canLaunchFromMessage('Yes, launch recruitment', null)).toBe(false)
  })
})
