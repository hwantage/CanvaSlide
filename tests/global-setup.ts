import type { FullConfig } from '@playwright/test'
import { assertServerServesThisCheckout } from './e2e-server'

/** Runs once `webServer` is up and before the first test; see `assertServerServesThisCheckout`. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL
  if (baseURL) {
    await assertServerServesThisCheckout(baseURL)
  }
}
