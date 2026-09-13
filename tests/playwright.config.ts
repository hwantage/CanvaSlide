import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:1420',
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
    }
  ],
  webServer: {
    command: 'pnpm dev:web',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: true,
    timeout: 60_000
  }
})
