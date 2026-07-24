'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type AppMode = 'mock' | 'live'

const STORAGE_KEY = 'yc-hack-mode'

interface ModeContextValue {
  mode: AppMode
  setMode: (m: AppMode) => void
}

const ModeContext = createContext<ModeContextValue>({
  mode: 'mock',
  setMode: () => {},
})

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('mock')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'live' || stored === 'mock') setModeState(stored)
  }, [])

  function setMode(m: AppMode) {
    setModeState(m)
    localStorage.setItem(STORAGE_KEY, m)
  }

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  )
}

export function useMode() {
  return useContext(ModeContext)
}
