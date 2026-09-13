/** Stable callback ref: focuses a modal panel once when it appears, without stealing focus later. */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus()
}
