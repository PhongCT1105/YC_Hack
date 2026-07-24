export type WorkspaceStage = 'planning' | 'recruiting' | 'active' | 'complete'

export function buildExpertTaskUrl(appUrl: string, workspaceId: string): string {
  const url = new URL('/sprint', appUrl.endsWith('/') ? appUrl : `${appUrl}/`)
  url.searchParams.set('workspaceId', workspaceId)
  return url.toString()
}

export function isExplicitLaunchConfirmation(message: string): boolean {
  const value = message.trim().toLowerCase()
  const approval = /\b(yes|confirm|approve|go ahead|proceed)\b/.test(value)
  const action = /\b(launch|recruit|recruitment|spend)\b/.test(value)
  return approval && action
}

export function stageAfterParticipantJoin(stage: WorkspaceStage): WorkspaceStage {
  return stage === 'complete' ? 'complete' : 'active'
}

export function stageAfterTaskSubmission(statuses: string[]): WorkspaceStage | null {
  return statuses.length > 0 && statuses.every((status) => status === 'submitted')
    ? 'complete'
    : null
}

export function adminKeyMatches(
  provided: string | null,
  configured: string | undefined
): boolean {
  return Boolean(
    provided &&
      configured &&
      provided.length === configured.length &&
      provided === configured
  )
}
