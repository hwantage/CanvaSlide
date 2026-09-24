import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  outputDir: '../test-results/website',
  timeout: 30_000,
  expect: { timeout: 7000 },
  // Why: a committed `test.only` would otherwise pass CI while running a single test.
  forbidOnly: !!process.env.CI,
  // Why: when the preview server breaks, every remaining test would otherwise wait out its timeout.
  maxFailures: process.env.CI ? 10 : 0,
  fullyParallel: true,
  // Why: CI runners render WebGL in software; three parallel browsers starve the mascot animation.
  workers: process.env.CI ? 1 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:1422/CanvaSlide/',
    locale: 'en-US',
    colorScheme: 'light',
    viewport: { width: 1440, height: 1000 },
    // CI bots need a deterministic graphics driver for the wing-rendering checks.
    launchOptions: { args: process.env.CI ? ['--use-gl=angle', '--use-angle=swiftshader'] : [] },
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'website-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }
    }
  ],
  webServer: {
    command: 'pnpm preview:site',
    url: 'http://127.0.0.1:1422/CanvaSlide/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
})
