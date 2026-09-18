import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { isTauriRuntime } from './tauri-runtime'
import { canInstallInApp, openReleasesPage } from './app-update'
import { useUpdateStore } from '@/store/update-store'

const { openUrl, message } = vi.hoisted(() => ({ openUrl: vi.fn(), message: vi.fn() }))
vi.mock('./tauri-runtime', () => ({ isTauriRuntime: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ message }))

const releasesUrl = 'https://github.com/hwantage/CanvaSlide/releases'

beforeEach(() => {
  openUrl.mockReset().mockResolvedValue(undefined)
  message.mockReset().mockResolvedValue(undefined)
})

afterEach(() => vi.restoreAllMocks())

test.each([
  { agent: 'Macintosh', installable: false },
  { agent: 'Windows NT 10.0', installable: true }
])(
  'opens releases through the default native browser on $agent',
  async ({ agent, installable }) => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent)
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    await openReleasesPage()
    expect(openUrl).toHaveBeenCalledExactlyOnceWith(releasesUrl)
    expect(openWindow).not.toHaveBeenCalled()
    expect(canInstallInApp()).toBe(installable)
  }
)

test('opens the exact release page synchronously in browser mode', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(false)
  const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
  const opened = openReleasesPage()
  expect(openWindow).toHaveBeenCalledExactlyOnceWith(releasesUrl, '_blank', 'noopener')
  await opened
  expect(openUrl).not.toHaveBeenCalled()
  expect(canInstallInApp()).toBe(false)
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
