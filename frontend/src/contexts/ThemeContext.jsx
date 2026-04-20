import React, { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'niyanHireFlowTheme'
const DEFAULT_THEME = 'dark'

const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  toggleTheme: () => {},
  isDark: true,
})

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME
    } catch {
      return DEFAULT_THEME
    }
  })

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore storage errors
    }
  }, [theme])

  const toggleTheme = () =>
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
