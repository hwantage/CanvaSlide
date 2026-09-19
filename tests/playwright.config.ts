import { defineConfig, devices } from '@playwright/test'
import { portForCheckout } from './e2e-server'

const port = portForCheckout()
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    // Why: selectors match English UI strings; the app follows navigator.language otherwise.
    locale: 'en-US',
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure'
  },
  // Why: the device preset carries its own 1280×720 viewport, so restate ours after spreading it.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } }
    },
    {
      name: 'firefox',
      grep: /@core-interaction/,
      use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 900 } }
    },
    {
      name: 'webkit',
      // Keep macOS font/rendering regressions opt-in; core input runs on every CI host.
      grep: process.env.CANVASLIDE_E2E_WEBKIT ? /@core-interaction|@webkit/ : /@core-interaction/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1400, height: 900 } }
    }
  ],
  webServer: {
    // Why: the port is this checkout's own, so a dev server on 1420 is left alone and a sibling
    // worktree cannot be reused by accident. `strictPort` turns the remaining collisions into a
    // failed run, and `global-setup.ts` proves whatever answers really is this tree.
    command: 'pnpm dev:web',
    env: { CANVASLIDE_DEV_PORT: String(port) },
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000
  }
})
