import { beforeEach, expect, it, vi } from 'vitest'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { buildClipboardPayload } from '@shared/canvas/clipboard-payload'
import { useDocumentStore } from '@/store/document-store'
import { useCameraStore } from '@/store/camera-store'
import { insertClipboardText, pasteFromSystemClipboard } from './external-content'
import { readNativeClipboardImage, readNativeClipboardText } from '@/platform/native-clipboard'
import { readVideoAspectRatio } from './video-metadata'
import { VIDEO_CHROME_HEIGHT } from '@shared/canvas/video-placement'

vi.mock('./video-metadata', () => ({ readVideoAspectRatio: vi.fn(async () => null) }))

vi.mock('@/platform/native-clipboard', () => ({
  readNativeClipboardImage: vi.fn(async () => null),
  readNativeClipboardText: vi.fn(async () => '')
}))

beforeEach(() => {
  vi.clearAllMocks()
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  useCameraStore.setState({
    camera: { x: 0, y: 0, zoom: 1 },
    viewport: { width: 1000, height: 800 }
  })
})

it('recognizes a standalone video as one undoable element while preserving text and object priority', () => {
  insertClipboardText('https://youtu.be/M7lc1UVf-VE')
  let state = useDocumentStore.getState()
  expect(state.document.order).toHaveLength(1)
  const video = state.document.elements[state.document.order[0]!]!
  expect(video.type).toBe('video')
  expect(video.x + video.width / 2).toBe(500)
  expect(video.y + video.height / 2).toBe(400)
  state.undo()
  expect(useDocumentStore.getState().document.order).toHaveLength(0)
  state.redo()
  const payload = buildClipboardPayload(useDocumentStore.getState().document, [video.id])!
  insertClipboardText(JSON.stringify(payload))
  insertClipboardText('https://example.org/page')
  state = useDocumentStore.getState()
  expect(state.document.order.map((id) => state.document.elements[id]!.type)).toEqual([
    'video',
    'video',
    'text'
  ])
  expect(state.document.assets).toEqual({})
})

it('routes the macOS native fallback through the same URL recognition', async () => {
  vi.mocked(readNativeClipboardText).mockResolvedValueOnce('https://vimeo.com/76979871')
  await pasteFromSystemClipboard()
  const state = useDocumentStore.getState()
  expect(state.document.order).toHaveLength(1)
  expect(state.document.elements[state.document.order[0]!]).toMatchObject({
    type: 'video',
    url: 'https://vimeo.com/76979871'
  })
  expect(readNativeClipboardImage).toHaveBeenCalledOnce()
})

it('drops a late native read after the DOM paste owns the gesture or the document changes', async () => {
  let resolve!: (value: string) => void
  vi.mocked(readNativeClipboardText).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    })
  )
  let valid = true
  const pending = pasteFromSystemClipboard(undefined, null, () => valid)
  await vi.waitFor(() => expect(readNativeClipboardText).toHaveBeenCalled())
  valid = false
  insertClipboardText('https://vimeo.com/76979871')
  resolve('https://vimeo.com/76979871')
  await pending
  expect(useDocumentStore.getState().document.order).toHaveLength(1)
  vi.mocked(readNativeClipboardText).mockImplementationOnce(async () => {
    useDocumentStore.getState().newDocument()
    return 'https://vimeo.com/76979871'
  })
  await pasteFromSystemClipboard()
  expect(useDocumentStore.getState().document.order).toHaveLength(0)
})

it('amends the initial size from metadata as one undo step and preserves the paste centre', async () => {
  vi.mocked(readVideoAspectRatio).mockResolvedValueOnce(9 / 16)
  insertClipboardText('https://example.org/portrait.mp4')
  await vi.waitFor(() => {
    const { document } = useDocumentStore.getState()
    const video = document.elements[document.order[0]!]!
    expect((video.width - 2) / (video.height - VIDEO_CHROME_HEIGHT)).toBeCloseTo(9 / 16)
    expect(video.x + video.width / 2).toBe(500)
    expect(video.y + video.height / 2).toBe(400)
  })
  const fitted = useDocumentStore.getState().document
  expect(useDocumentStore.getState().past).toHaveLength(1)
  useDocumentStore.getState().undo()
  expect(useDocumentStore.getState().document.order).toHaveLength(0)
  useDocumentStore.getState().redo()
  expect(useDocumentStore.getState().document).toEqual(fitted)
})

it.each(['resize', 'undo', 'new'] as const)(
  'does not apply late dimensions after %s',
  async (action) => {
    let resolve!: (ratio: number | null) => void
    vi.mocked(readVideoAspectRatio).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    insertClipboardText('https://example.org/portrait.mp4')
    const state = useDocumentStore.getState()
    if (action === 'resize') {
      state.patchElements(state.selectedIds, { width: 200, height: 200 })
    } else if (action === 'undo') {
      state.undo()
    } else {
      state.newDocument()
    }
    const expected = useDocumentStore.getState().document
    resolve(9 / 16)
    await Promise.resolve()
    expect(useDocumentStore.getState().document).toBe(expected)
    expect(vi.mocked(readVideoAspectRatio).mock.calls.at(-1)![1].aborted).toBe(true)
  }
)
