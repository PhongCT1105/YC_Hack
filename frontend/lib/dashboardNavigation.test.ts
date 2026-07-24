import { describe, expect, it } from 'vitest'
import { dashboardWorkspaceHref } from './dashboardNavigation'

describe('dashboardWorkspaceHref', () => {
  it('preserves the admin key while switching workspaces', () => {
    expect(dashboardWorkspaceHref('ws 2', 'owner key')).toBe(
      '/dashboard/ws%202?key=owner+key'
    )
  })

  it('does not append an empty key', () => {
    expect(dashboardWorkspaceHref('ws-2', null)).toBe('/dashboard/ws-2')
  })
})
