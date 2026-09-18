export function hasNativeTextMenu(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) {
    return (
      !target.disabled &&
      ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(target.type)
    )
  }
  if (target instanceof HTMLTextAreaElement) {
    return !target.disabled
  }
  return target instanceof HTMLElement && target.isContentEditable
}

export function preventPageContextMenu(event: Pick<MouseEvent, 'target' | 'preventDefault'>): void {
  // WebView Reload discards even a clean opened document; keep native menus only for text editing.
  if (!hasNativeTextMenu(event.target)) {
    event.preventDefault()
  }
}
