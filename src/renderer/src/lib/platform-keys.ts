export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
}

/** ⌘ on macOS, Ctrl elsewhere. */
export function hasPrimaryModifier(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isMacPlatform() ? event.metaKey : event.ctrlKey
}

export function primaryModifierLabel(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl+'
}

export function shiftLabel(): string {
  return isMacPlatform() ? '⇧' : 'Shift+'
}

export function altLabel(): string {
  return isMacPlatform() ? '⌥' : 'Alt+'
}

export type ShortcutOptions = { shift?: boolean; alt?: boolean }

/** `⌘⇧K` on macOS, `Ctrl+Shift+K` elsewhere; the modifier order follows each platform's HIG. */
export function shortcutLabel(key: string, options: ShortcutOptions = {}): string {
  const alt = options.alt ? altLabel() : ''
  const shift = options.shift ? shiftLabel() : ''
  return isMacPlatform()
    ? `${alt}${shift}${primaryModifierLabel()}${key}`
    : `${primaryModifierLabel()}${alt}${shift}${key}`
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
