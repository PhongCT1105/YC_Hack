export function dashboardWorkspaceHref(
  workspaceId: string,
  adminKey: string | null
): string {
  const path = `/dashboard/${encodeURIComponent(workspaceId)}`
  if (!adminKey) return path
  const query = new URLSearchParams({ key: adminKey })
  return `${path}?${query.toString()}`
}
