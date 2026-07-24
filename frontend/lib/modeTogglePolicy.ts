export function shouldShowModeToggle(pathname: string): boolean {
  return !(
    pathname === '/sprint' ||
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/')
  )
}
