import { adminKeyMatches } from './workspaceDomain'

export function isAdminRequest(req: Request): boolean {
  return adminKeyMatches(
    req.headers.get('x-admin-key'),
    process.env.ADMIN_KEY
  )
}
