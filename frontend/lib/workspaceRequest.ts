export function requiredWorkspaceId(req: Request): string | null {
  const value = new URL(req.url).searchParams.get('sprintId')?.trim()
  return value || null
}
