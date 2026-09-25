import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { checkForAppUpdate, installAppUpdate } from '@/platform/app-update'

vi.mock('@/platform/app-update', () => ({
  checkForAppUpdate: vi.fn(),
  installAppUpdate: vi.fn(),
  openReleasesPage: vi.fn()
}))

const STORAGE_KEY = 'canvaslide.updates.checkOnLaunch'

// Why: the preference is read when the store module loads, so each case imports a fresh copy.
async function loadStore() {
  vi.resetModules()
  return (await import('./update-store')).useUpdateStore
}

const found = { version: '9.9.9', notes: null, installable: true }

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

test('checks at launch unless the user turned it off', async () => {
  expect((await loadStore()).getState().checkOnLaunch).toBe(true)
  localStorage.setItem(STORAGE_KEY, 'off')
  expect((await loadStore()).getState().checkOnLaunch).toBe(false)
  localStorage.setItem(STORAGE_KEY, 'on')
  expect((await loadStore()).getState().checkOnLaunch).toBe(true)
})

test('persists the launch-check choice across restarts', async () => {
  const store = await loadStore()
  store.getState().setCheckOnLaunch(false)
  expect(store.getState().checkOnLaunch).toBe(false)
  expect(localStorage.getItem(STORAGE_KEY)).toBe('off')
  expect((await loadStore()).getState().checkOnLaunch).toBe(false)
  store.getState().setCheckOnLaunch(true)
  expect(localStorage.getItem(STORAGE_KEY)).toBe('on')
})

test('falls back to checking and still switches when storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota exceeded')
  })
  const store = await loadStore()
  expect(store.getState().checkOnLaunch).toBe(true)
  expect(() => store.getState().setCheckOnLaunch(false)).not.toThrow()
  expect(store.getState().checkOnLaunch).toBe(false)
})

test('an install cannot start while a check is running', async () => {
  const store = await loadStore()
  let finish: (value: null) => void = () => {}
  vi.mocked(checkForAppUpdate).mockReturnValue(new Promise((resolve) => (finish = resolve)))
  store.setState({ status: 'available', update: found })
  const checking = store.getState().check()
  await store.getState().install()
  expect(installAppUpdate).not.toHaveBeenCalled()
  finish(null)
  await checking
  expect(store.getState().status).toBe('upToDate')
})

test('a found update stays offered while a later check runs or fails', async () => {
  const { selectUpdateAvailable, useUpdateStore } = await import('./update-store')
  let fail: (error: Error) => void = () => {}
  vi.mocked(checkForAppUpdate).mockReturnValue(new Promise((_, reject) => (fail = reject)))
  useUpdateStore.setState({ status: 'available', update: found })
  const checking = useUpdateStore.getState().check()
  expect(selectUpdateAvailable(useUpdateStore.getState())).toBe(true)
  fail(new Error('offline'))
  await checking
  expect(useUpdateStore.getState().status).toBe('error')
  expect(selectUpdateAvailable(useUpdateStore.getState())).toBe(true)
  vi.mocked(checkForAppUpdate).mockResolvedValue(null)
  await useUpdateStore.getState().check()
  expect(selectUpdateAvailable(useUpdateStore.getState())).toBe(false)
})
