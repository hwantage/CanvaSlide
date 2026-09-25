import { create } from 'zustand'
import { pushRecentColor } from '@shared/ui/color-input'

const STORAGE_KEY = 'canvaslide.recentColors'

function readStored(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : []
  } catch {
    return []
  }
}

export type RecentColorsStore = {
  colors: string[]
  push: (color: string) => void
}

/** Colours the user picked, newest first; persisted so a palette survives restarts. */
export const useRecentColorsStore = create<RecentColorsStore>()((set, get) => ({
  colors: readStored(),
  push: (color) => {
    const colors = pushRecentColor(get().colors, color)
    set({ colors })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
    } catch {
      // Why: private mode or a full quota must never break colour editing.
    }
  }
}))
