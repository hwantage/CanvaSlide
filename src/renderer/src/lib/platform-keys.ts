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

export function shortcutLabel(key: string, options: { shift?: boolean } = {}): string {
  return `${primaryModifierLabel()}${options.shift ? shiftLabel() : ''}${key}`
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
