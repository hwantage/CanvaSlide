import { beforeEach, expect, test, vi } from 'vitest'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { saveDocumentFile } from '@/platform/document-file-access'
import { useDocumentStore } from '@/store/document-store'
import { saveCurrentDocument } from './save-document'

vi.mock('@/platform/document-file-access', () => ({ saveDocumentFile: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks()
  useDocumentStore.getState().loadDocument(createEmptyDocument(), '/tmp/original.canvaslide')
})

test('passes Save As through and records the selected path', async () => {
  vi.mocked(saveDocumentFile).mockResolvedValue({ filePath: '/tmp/copy.canvaslide' })
  await expect(saveCurrentDocument(true)).resolves.toBe(true)
  expect(saveDocumentFile).toHaveBeenCalledWith(
    expect.any(Object),
    '/tmp/original.canvaslide',
    true
  )
  expect(useDocumentStore.getState().filePath).toBe('/tmp/copy.canvaslide')
})

test('a failed save does not block the next save', async () => {
  vi.mocked(saveDocumentFile).mockRejectedValueOnce(new Error('disk full'))
  await expect(saveCurrentDocument()).rejects.toThrow('disk full')
  vi.mocked(saveDocumentFile).mockResolvedValue({ filePath: '/tmp/retry.canvaslide' })
  await expect(saveCurrentDocument()).resolves.toBe(true)
})

test('a queued save refuses a replacement session', async () => {
  const task = saveCurrentDocument()
  useDocumentStore.getState().loadDocument(createEmptyDocument('Replacement'), null)
  await expect(task).resolves.toBe(false)
  expect(saveDocumentFile).not.toHaveBeenCalled()
})

test('a save finishing after replacement does not mark the replacement saved', async () => {
  vi.mocked(saveDocumentFile).mockImplementation(async () => {
    useDocumentStore.getState().restoreDocument(createEmptyDocument('Restored'), null)
    return { filePath: '/tmp/old.canvaslide' }
  })
  await expect(saveCurrentDocument()).resolves.toBe(false)
  expect(useDocumentStore.getState()).toMatchObject({ filePath: null, dirty: true })
})
