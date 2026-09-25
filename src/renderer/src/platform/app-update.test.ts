import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { isTauriRuntime } from './tauri-runtime'
import { canInstallInApp, checkForAppUpdate, openReleasesPage } from './app-update'
import { useUpdateStore } from '@/store/update-store'
import { openRepositoryPage } from './external-links'

const { openUrl, message, check } = vi.hoisted(() => ({
  openUrl: vi.fn(),
  message: vi.fn(),
  check: vi.fn()
}))
vi.mock('./tauri-runtime', () => ({ isTauriRuntime: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ message }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check }))

const releasesUrl = 'https://github.com/hwantage/CanvaSlide/releases'
const repositoryUrl = 'https://github.com/hwantage/CanvaSlide'

beforeEach(() => {
  openUrl.mockReset().mockResolvedValue(undefined)
  message.mockReset().mockResolvedValue(undefined)
})

afterEach(() => vi.restoreAllMocks())

// A latest.json as the release workflow writes it, with the macOS entries marked as given.
function feedWith(...darwinMarks: (boolean | undefined)[]): Record<string, unknown> {
  const entry = { signature: 'c2ln', url: 'https://example.test/update' }
  const darwin = ['darwin-aarch64', 'darwin-x86_64', 'darwin-aarch64-app', 'darwin-x86_64-app']
  return {
    version: '99.0.0',
    platforms: {
      ...Object.fromEntries(
        darwin
          .slice(0, darwinMarks.length)
          .map((platform, i) => [
            platform,
            darwinMarks[i] === undefined ? entry : { ...entry, notarized: darwinMarks[i] }
          ])
      ),
      'windows-x86_64-nsis': entry
    }
  }
}
const notarized = feedWith(true, true, true, true)
const unmarked = feedWith(undefined, undefined, undefined, undefined)

test.each([
  { agent: 'Macintosh', feed: unmarked, installable: false },
  { agent: 'Macintosh', feed: notarized, installable: true },
  { agent: 'Macintosh', feed: feedWith(true, undefined, true, true), installable: false },
  { agent: 'Macintosh', feed: feedWith(true, 'yes' as never, true, true), installable: false },
  { agent: 'Macintosh', feed: feedWith(), installable: false },
  { agent: 'Macintosh', feed: { version: '99.0.0' }, installable: false },
  { agent: 'Windows NT 10.0', feed: unmarked, installable: true },
  { agent: 'Windows NT 10.0', feed: notarized, installable: true },
  { agent: 'X11; Linux x86_64', feed: notarized, installable: false }
])(
  'on $agent an update installs in the app: $installable',
  async ({ agent, feed, installable }) => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent)
    check.mockResolvedValueOnce({ version: '99.0.0', body: 'Notes', rawJson: feed })
    await expect(checkForAppUpdate()).resolves.toEqual({
      version: '99.0.0',
      notes: 'Notes',
      installable
    })
    expect(canInstallInApp(feed)).toBe(installable)
  }
)

test.each(['Macintosh', 'Windows NT 10.0'])(
  'opens releases through the default native browser on %s',
  async (agent) => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent)
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    await openReleasesPage()
    expect(openUrl).toHaveBeenCalledExactlyOnceWith(releasesUrl)
    expect(openWindow).not.toHaveBeenCalled()
  }
)

test('opens the exact release page synchronously in browser mode', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(false)
  const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
  const opened = openReleasesPage()
  expect(openWindow).toHaveBeenCalledExactlyOnceWith(releasesUrl, '_blank', 'noopener')
  await opened
  expect(openUrl).not.toHaveBeenCalled()
  expect(canInstallInApp(notarized)).toBe(false)
})

test.each(['Macintosh', 'Windows NT 10.0'])(
  'opens the repository natively on %s',
  async (agent) => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent)
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    await openRepositoryPage()
    expect(openUrl).toHaveBeenCalledExactlyOnceWith(repositoryUrl)
    expect(openWindow).not.toHaveBeenCalled()
  }
)

test('opens the repository synchronously in browser mode', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(false)
  const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
  const opened = openRepositoryPage()
  expect(openWindow).toHaveBeenCalledExactlyOnceWith(repositoryUrl, '_blank', 'noopener')
  await opened
  expect(openUrl).not.toHaveBeenCalled()
})

test('reports a rejected repository opener and allows retry', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  openUrl.mockRejectedValueOnce('URL is not allowed')
  await expect(openRepositoryPage()).resolves.toBeUndefined()
  expect(message).toHaveBeenCalledExactlyOnceWith(
    'Could not open the repository: URL is not allowed',
    { title: 'CanvaSlide', kind: 'error' }
  )
  await openRepositoryPage()
  expect(openUrl).toHaveBeenCalledTimes(2)
  expect(message).toHaveBeenCalledTimes(1)
})

test('reports a rejected native opener and keeps the available update for retry', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  openUrl.mockRejectedValueOnce('URL is not allowed')
  const update = { version: '99.0.0', notes: null, installable: false }
  useUpdateStore.setState({ status: 'available', update })
  await expect(useUpdateStore.getState().openReleases()).resolves.toBeUndefined()
  expect(message).toHaveBeenCalledExactlyOnceWith(
    'Could not open the download page: URL is not allowed',
    { title: 'CanvaSlide', kind: 'error' }
  )
  expect(useUpdateStore.getState()).toMatchObject({ status: 'available', update })
  await useUpdateStore.getState().openReleases()
  expect(openUrl).toHaveBeenCalledTimes(2)
  expect(message).toHaveBeenCalledTimes(1)
})

test('browser update checks never contact a desktop release feed', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(false)
  const fetch = vi.spyOn(window, 'fetch')
  await expect(checkForAppUpdate()).resolves.toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
