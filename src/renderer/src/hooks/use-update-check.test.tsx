import { act, renderHook } from '@testing-library/react'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { useUpdateCheck } from './use-update-check'
import { isTauriRuntime } from '@/platform/tauri-runtime'
import { onCheckUpdatesRequested } from '@/platform/app-update'
import { useUpdateStore } from '@/store/update-store'
import { useAboutDialogStore, useSettingsDialogStore } from '@/store/modal-dialogs'

vi.mock('@/platform/tauri-runtime', () => ({ isTauriRuntime: vi.fn() }))
vi.mock('@/platform/app-update', () => ({ onCheckUpdatesRequested: vi.fn(() => vi.fn()) }))

beforeEach(() => {
  vi.useFakeTimers()
  useAboutDialogStore.getState().hide()
  useSettingsDialogStore.getState().hide()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.useRealTimers()
})

test('desktop checks after launch and cleans up its timer', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  const check = vi.spyOn(useUpdateStore.getState(), 'check').mockResolvedValue()
  const first = renderHook(useUpdateCheck)
  await act(() => vi.advanceTimersByTimeAsync(2999))
  expect(check).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(check).toHaveBeenCalledTimes(1)
  first.unmount()
  const second = renderHook(useUpdateCheck)
  second.unmount()
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(check).toHaveBeenCalledTimes(1)
})

test('browser startup does not schedule a check', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(false)
  const check = vi.spyOn(useUpdateStore.getState(), 'check').mockResolvedValue()
  const hook = renderHook(useUpdateCheck)
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(check).not.toHaveBeenCalled()
  hook.unmount()
})

test('the native update menu reports its result in About instead of Settings', () => {
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  const check = vi.spyOn(useUpdateStore.getState(), 'check').mockResolvedValue()
  const hook = renderHook(useUpdateCheck)
  act(() => vi.mocked(onCheckUpdatesRequested).mock.calls[0]![0]())
  expect(check).toHaveBeenCalledTimes(1)
  expect(useAboutDialogStore.getState().open).toBe(true)
  expect(useSettingsDialogStore.getState().open).toBe(false)
  hook.unmount()
})
