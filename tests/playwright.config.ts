import { defineConfig, devices } from '@playwright/test'
import { portForCheckout } from './e2e-server'

const port = portForCheckout()
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  // Why: a committed `test.only` would otherwise pass CI while running a single test.
  forbidOnly: !!process.env.CI,
  // Why: when the dev server breaks, every remaining test would otherwise wait out its timeout.
  maxFailures: process.env.CI ? 10 : 0,
  fullyParallel: false,
  // Why: CI parallelizes by shard, one runner each, keeping the single browser per runner that the
  // timing-sensitive checks have always passed with. Files share no state (each worker launches its
  // own browser, clipboard included), so local runs use Playwright's default of half the cores.
  workers: process.env.CI ? 1 : '50%',
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
      // Why: the `@webkit` scenarios (AGENTS.md, Verify) add minutes, so they are opt-in locally;
      // CI runs them on macOS.
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
