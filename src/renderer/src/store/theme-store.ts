import { create } from 'zustand'

export const themePreferences = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof themePreferences)[number]
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'canvaslide.theme'
export const darkSchemeQuery = '(prefers-color-scheme: dark)'

function isPreference(value: unknown): value is ThemePreference {
  return themePreferences.includes(value as ThemePreference)
}

function readStored(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isPreference(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

/** Reads the OS preference; false where the webview cannot answer (older shells, tests). */
export function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia(darkSchemeQuery).matches
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') {
    return systemDark ? 'dark' : 'light'
  }
  return preference
}

/** Why: `data-theme` on <html> is what selects the token block in main.css. */
function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme
}

export type ThemeStore = {
  preference: ThemePreference
  systemDark: boolean
  setPreference: (preference: ThemePreference) => void
  setSystemDark: (systemDark: boolean) => void
}

/** App-level appearance preference, persisted so a chosen theme survives restarts. */
export const useThemeStore = create<ThemeStore>()((set, get) => ({
  preference: readStored(),
  systemDark: prefersDark(),
  setPreference: (preference) => {
    set({ preference })
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // Why: private mode or a full quota must never block the switch itself.
    }
    applyTheme(resolveTheme(preference, get().systemDark))
  },
  setSystemDark: (systemDark) => {
    set({ systemDark })
    applyTheme(resolveTheme(get().preference, systemDark))
  }
}))

/** Paints the stored preference onto <html> before React renders, so there is no light flash. */
export function syncTheme(): void {
  const { preference, systemDark } = useThemeStore.getState()
  applyTheme(resolveTheme(preference, systemDark))
}

export const selectThemePreference = (s: ThemeStore): ThemePreference => s.preference
