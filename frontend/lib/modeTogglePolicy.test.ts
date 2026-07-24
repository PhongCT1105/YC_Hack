import { describe, expect, it } from 'vitest'
import { shouldShowModeToggle } from './modeTogglePolicy'

describe('shouldShowModeToggle', () => {
  it('keeps the mode switcher on setup surfaces', () => {
    expect(shouldShowModeToggle('/')).toBe(true)
    expect(shouldShowModeToggle('/config')).toBe(true)
  })

  it('removes the global switcher from focused workspace surfaces', () => {
    expect(shouldShowModeToggle('/dashboard/new')).toBe(false)
    expect(shouldShowModeToggle('/dashboard/sp_123')).toBe(false)
    expect(shouldShowModeToggle('/sprint')).toBe(false)
  })
})
