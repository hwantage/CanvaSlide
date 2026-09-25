import { expect, type Page } from '@playwright/test'

/**
 * Waits until the editor listens for keys and pastes. The canvas is on screen before its effects
 * run; the window title is set by an effect that runs after the keyboard and clipboard hooks.
 */
export async function waitForEditor(page: Page) {
  await expect(page).toHaveTitle(/ — CanvaSlide$/)
}
