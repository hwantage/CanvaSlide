import {
  shortcutLabel as platformShortcut,
  shiftLabel as platformShift
} from '@app/lib/platform-keys'
import { useSitePreferences } from './site-preferences'

// Static pages show both primary modifiers; platform-specific labels follow hydration.
export function shortcutLabel(key: string, options: { shift?: boolean } = {}): string {
  return useSitePreferences.getState().enhanced
    ? platformShortcut(key, options)
    : `Ctrl/⌘+${options.shift ? 'Shift+' : ''}${key}`
}

export function shiftLabel(): string {
  return useSitePreferences.getState().enhanced ? platformShift() : 'Shift+'
}
