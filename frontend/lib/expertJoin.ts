export function expertJoinBody(
  submissionId: string,
  workspaceId: string | null,
  kind?: 'real' | 'simulated'
) {
  return {
    submissionId,
    ...(workspaceId ? { workspaceId } : {}),
    ...(kind ? { kind } : {}),
  }
}
