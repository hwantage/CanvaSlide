import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { readNativeClipboardImage, readNativeClipboardText } from '@/platform/native-clipboard'
import { insertClipboardText, pasteFromSystemClipboard } from './external-content'
import { createObjectClipboard, type ObjectClipboard } from './object-clipboard'

vi.mock('@/platform/native-clipboard', () => ({
  readNativeClipboardImage: vi.fn(async () => null),
  readNativeClipboardText: vi.fn(async () => '')
}))

let pointer: { revision: number; world: { x: number; y: number } | null }
let payload: string
let clipboard: ObjectClipboard
const selected = () => {
  const state = useDocumentStore.getState()
  return state.document.elements[state.selectedIds[0]!]!
}

beforeEach(() => {
  pointer = { revision: 1, world: { x: 100, y: 100 } }
  clipboard = createObjectClipboard(() => pointer)
  useCameraStore.setState({
    camera: { x: 0, y: 0, zoom: 1 },
    viewport: { width: 1000, height: 800 }
  })
  useDocumentStore.getState().loadDocument(createEmptyDocument(), null)
  useDocumentStore.getState().insertElement({
    id: 'a',
    type: 'text',
    text: 'Source',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    textStyle: { color: '#000', fontSize: 20, align: 'left', bold: false }
  })
  payload = JSON.stringify(clipboard.copySelection())
  vi.mocked(readNativeClipboardText).mockResolvedValue(payload)
  pointer = { revision: 2, world: { x: 800, y: 600 } }
})

afterEach(() => vi.restoreAllMocks())

describe('clipboard placement routes', () => {
  it.each([true, false])(
    'resets offsets for changed contents (pointer target: %s)',
    (atPointer) => {
      if (!atPointer) {
        pointer.world = null
      }
      const firstPosition = atPointer ? { x: 750, y: 580 } : { x: 24, y: 24 }
      insertClipboardText(clipboard, payload)
      expect(selected()).toMatchObject(firstPosition)
      insertClipboardText(clipboard, payload)
      expect(selected()).toMatchObject({ x: firstPosition.x + 24, y: firstPosition.y + 24 })
      insertClipboardText(clipboard, payload.replace('Source', 'Edited source'))
      expect(selected()).toMatchObject({ ...firstPosition, text: 'Edited source' })
    }
  )

  it('continues the cascade across repeated parsing and the same remembered payload', async () => {
    insertClipboardText(clipboard, payload)
    await pasteFromSystemClipboard(clipboard)
    expect(selected()).toMatchObject({ x: 774, y: 604 })
    vi.mocked(readNativeClipboardText).mockResolvedValueOnce('')
    vi.stubGlobal('navigator', { clipboard: { readText: async () => '' } })
    try {
      await pasteFromSystemClipboard(clipboard)
      expect(selected()).toMatchObject({ x: 798, y: 628 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('resets placement when the remembered fallback differs from the last system payload', async () => {
    vi.mocked(readNativeClipboardText).mockResolvedValueOnce(payload.replace('Source', 'Other'))
    await pasteFromSystemClipboard(clipboard)
    expect(selected()).toMatchObject({ text: 'Other', x: 750, y: 580 })
    vi.mocked(readNativeClipboardText).mockResolvedValueOnce('')
    vi.stubGlobal('navigator', { clipboard: { readText: async () => '' } })
    try {
      await pasteFromSystemClipboard(clipboard)
      expect(selected()).toMatchObject({ text: 'Source', x: 750, y: 580 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('holds the requested location while the OS clipboard read is pending', async () => {
    let resolveText!: (value: string) => void
    const text = new Promise<string>((resolve) => {
      resolveText = resolve
    })
    vi.mocked(readNativeClipboardText).mockReturnValueOnce(text)
    const paste = pasteFromSystemClipboard(clipboard)
    pointer = { revision: 3, world: { x: 100, y: 100 } }
    resolveText(payload)
    await paste
    expect(selected()).toMatchObject({ x: 750, y: 580 })
  })

  it('retains the requested location when clipboard reads fail and memory is used', async () => {
    vi.mocked(readNativeClipboardText).mockResolvedValueOnce('')
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: async () => {
          throw new Error('denied')
        }
      }
    })
    try {
      await pasteFromSystemClipboard(clipboard)
      expect(selected()).toMatchObject({ x: 750, y: 580 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps the original object cascade for context-menu paste despite pointer movement', async () => {
    await pasteFromSystemClipboard(clipboard, { x: 300, y: 400 })
    expect(selected()).toMatchObject({ x: 24, y: 24 })
    pointer.world = null
    await pasteFromSystemClipboard(clipboard, { x: 300, y: 400 })
    expect(selected()).toMatchObject({ x: 48, y: 48 })
  })

  it('keeps context-menu object offsets when clipboard reads fall back to memory', async () => {
    vi.mocked(readNativeClipboardText).mockResolvedValueOnce('')
    vi.stubGlobal('navigator', { clipboard: { readText: async () => '' } })
    try {
      await pasteFromSystemClipboard(clipboard, { x: 300, y: 400 })
      expect(selected()).toMatchObject({ x: 24, y: 24 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps context-menu plain text at its explicit destination', () => {
    insertClipboardText(clipboard, 'External text', { x: 300, y: 400 })
    const element = selected()
    expect(element.x + element.width / 2).toBe(300)
    expect(element.y + element.height / 2).toBe(400)
  })

  it('keeps external plain text at the viewport centre despite pointer movement', () => {
    insertClipboardText(clipboard, 'External text')
    const element = selected()
    expect(element.x + element.width / 2).toBe(500)
    expect(element.y + element.height / 2).toBe(400)
    expect(readNativeClipboardImage).not.toHaveBeenCalled()
  })
})
