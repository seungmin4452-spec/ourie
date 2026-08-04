import { useEffect, useState, type ReactNode } from 'react'

import { ColorModeContext, type ColorMode } from './color-mode-context'

const STORAGE_KEY = 'ourie-color-mode'

function getInitialMode(): ColorMode {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(getInitialMode)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  function toggle() {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  return <ColorModeContext.Provider value={{ mode, toggle }}>{children}</ColorModeContext.Provider>
}
