'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useMode } from '@/lib/modeContext'
import { shouldShowModeToggle } from '@/lib/modeTogglePolicy'

export function ModeToggle() {
  const { mode, setMode } = useMode()
  const router = useRouter()
  const pathname = usePathname()
  const isLive = mode === 'live'

  if (!shouldShowModeToggle(pathname)) return null

  function handleToggle() {
    setMode(isLive ? 'mock' : 'live')
    router.push('/')
  }

  return (
    <button
      onClick={handleToggle}
      title={isLive ? 'Switch to static mock data' : 'Switch to live APIs'}
      className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all select-none"
      style={{
        background: isLive ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
        borderColor: isLive ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.12)',
        color: isLive ? 'rgb(134,239,172)' : 'rgba(255,255,255,0.4)',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: isLive ? 'rgb(34,197,94)' : 'rgba(255,255,255,0.3)' }}
      />
      {isLive ? 'Live' : 'Mock'}
    </button>
  )
}
