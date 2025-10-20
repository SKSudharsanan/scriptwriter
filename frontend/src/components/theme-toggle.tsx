import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/theme-provider'

const THEME_SEQUENCE = ['light', 'dark', 'system'] as const

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const currentIndex = THEME_SEQUENCE.indexOf(theme)

  const handleToggle = () => {
    const next = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length]
    setTheme(next)
  }

  const tooltipLabel = (() => {
    const next = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length]
    switch (next) {
      case 'light':
        return 'Switch to light mode'
      case 'dark':
        return 'Switch to dark mode'
      default:
        return 'Follow system appearance'
    }
  })()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      aria-label={tooltipLabel}
      title={tooltipLabel}
      className="relative"
    >
      <Sun
        className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-transform duration-200 ease-in-out dark:-rotate-90 dark:scale-0"
        aria-hidden={resolvedTheme === 'dark'}
      />
      <Moon
        className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-transform duration-200 ease-in-out dark:rotate-0 dark:scale-100"
        aria-hidden={resolvedTheme === 'light'}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
