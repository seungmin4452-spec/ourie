import { createContext } from 'react'

export type ColorMode = 'light' | 'dark'

export interface ColorModeContextValue {
  mode: ColorMode
  toggle: () => void
}

export const ColorModeContext = createContext<ColorModeContextValue | null>(null)
