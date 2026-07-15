import React, { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'niyanHireFlowTheme'
const DEFAULT_MODE = 'light'

const ThemeContext = createContext({
  themeMode: DEFAULT_MODE,
  resolvedTheme: 'light',
  setThemeMode: () => {},
  isDark: false,
})

function getSystemPreference() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeModeState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored && ['dark', 'light', 'system'].includes(stored) ? stored : DEFAULT_MODE
    } catch {
      return DEFAULT_MODE
    }
  })

  const [systemTheme, setSystemTheme] = useState(getSystemPreference)

  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e) => setSystemTheme(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } catch {}
  }, [])

  const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode

  useEffect(() => {
    // "system" gets its own data-theme value so CSS @media (prefers-color-scheme)
    // can handle the adaptation with the System palette (cyan/aurora aesthetic).
    // "dark" and "light" use their own explicit palette.
    const attr = themeMode === 'system' ? 'system' : resolvedTheme
    document.documentElement.setAttribute('data-theme', attr)
    try { localStorage.setItem(STORAGE_KEY, themeMode) } catch {}
  }, [themeMode, resolvedTheme])

  const setThemeMode = (mode) => {
    if (['dark', 'light', 'system'].includes(mode)) setThemeModeState(mode)
  }

  return (
    <ThemeContext.Provider value={{ themeMode, resolvedTheme, setThemeMode, isDark: resolvedTheme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
