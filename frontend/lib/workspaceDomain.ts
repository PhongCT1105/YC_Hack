export type WorkspaceStage = 'planning' | 'recruiting' | 'active' | 'complete'

export function buildExpertTaskUrl(appUrl: string, workspaceId: string): string {
  const url = new URL('/sprint', appUrl.endsWith('/') ? appUrl : `${appUrl}/`)
  url.searchParams.set('workspaceId', workspaceId)
  return url.toString()
}

export function isExplicitLaunchConfirmation(message: string): boolean {
  const value = message.trim().toLowerCase()
  const approval = /\b(yes|confirm(ed)?|approve(d)?|go ahead|proceed|do it)\b/.test(value)
  const action = /\b(launch|recruit(ment)?|spend|start|hire)\b/.test(value)
  // A short, bare approval ("approve", "yes please") is explicit consent when
  // it's the whole reply to the agent's spend question — don't force the user
  // to repeat an action word they were just asked to confirm.
  const bareApproval = approval && value.length <= 40
  return (approval && action) || bareApproval
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
