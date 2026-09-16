import { useEffect } from 'react'
import { darkSchemeQuery, useThemeStore } from '@/store/theme-store'

/** Keeps `system` mode in step with the OS while the app is running. */
export function useSystemTheme(): void {
  const setSystemDark = useThemeStore((s) => s.setSystemDark)
  useEffect(() => {
    if (typeof matchMedia !== 'function') {
      return
    }
    const query = matchMedia(darkSchemeQuery)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    setSystemDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [setSystemDark])
}
