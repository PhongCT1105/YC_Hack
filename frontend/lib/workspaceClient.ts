export function adminHeaders(
  adminKey: string | null
): Record<string, string> {
  return adminKey ? { 'x-admin-key': adminKey } : {}
}
