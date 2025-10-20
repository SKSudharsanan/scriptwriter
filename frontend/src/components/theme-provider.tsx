import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = 'scriptwriter-theme'

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const resolveSystemTheme = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

const applyThemeClass = (next: 'light' | 'dark') => {
  const root = document.documentElement
  if (next === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null
    return stored ?? 'system'
  })

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    return theme === 'system' ? resolveSystemTheme() : theme
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const next = theme === 'system' ? resolveSystemTheme() : theme
    setResolvedTheme(next)
    applyThemeClass(next)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => {
      const next = resolveSystemTheme()
      setResolvedTheme(next)
      applyThemeClass(next)
    }
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [theme])

  const handleSetTheme = useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: handleSetTheme,
    }),
    [theme, resolvedTheme, handleSetTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }

  return context
}
