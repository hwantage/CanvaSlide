import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { createImageAsset } from '@shared/canvas/document-assets'
import type { DocumentCodecRequest, DocumentCodecResponse } from './document-file-codec'

class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: { data: DocumentCodecResponse }) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn<(request: DocumentCodecRequest, transfer: Transferable[]) => void>()
  terminate = vi.fn()
  constructor() {
    TestWorker.instances.push(this)
  }
  respond(data: DocumentCodecResponse) {
    this.onmessage!({ data })
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  TestWorker.instances = []
  vi.stubGlobal('Worker', TestWorker)
})
afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('sends only changed asset payloads while preserving metadata and queued edits', async () => {
  const { encodeDocumentFile } = await import('./document-file-codec')
  const document = createEmptyDocument()
  const asset = createImageAsset('data:image/png;base64,AQIDBA==', 1, 1)
  document.assets[asset.id] = asset
  const first = encodeDocumentFile(document)
  await Promise.resolve()
  const worker = TestWorker.instances[0]!
  const second = encodeDocumentFile({ ...document, name: 'Edited' })
  expect(worker.postMessage).toHaveBeenCalledTimes(1)
  worker.respond({ kind: 'encoded', bytes: new Uint8Array([1]) })
  await first
  await Promise.resolve()
  expect(worker.postMessage).toHaveBeenLastCalledWith(
    {
      kind: 'encode',
      document: {
        ...document,
        name: 'Edited',
        assets: { [asset.id]: { id: asset.id, mime: asset.mime, width: 1, height: 1 } }
      }
    },
    []
  )
  worker.respond({ kind: 'encoded', bytes: new Uint8Array([2]) })
  await second
  const changed = {
    ...document,
    assets: { [asset.id]: { ...asset, data: 'data:image/png;base64,BQYHCA==' } }
  }
  const third = encodeDocumentFile(changed)
  await Promise.resolve()
  expect(worker.postMessage).toHaveBeenLastCalledWith({ kind: 'encode', document: changed }, [])
  worker.respond({ kind: 'encoded', bytes: new Uint8Array([3]) })
  await third
  expect(document.assets[asset.id]!.data).toBe(asset.data)
})

it('resends full assets after worker failure and releases the cache after idle', async () => {
  const { encodeDocumentFile } = await import('./document-file-codec')
  const document = createEmptyDocument()
  document.assets.image = createImageAsset('data:image/png;base64,AQIDBA==', 1, 1)
  const first = encodeDocumentFile(document)
  const rejected = expect(first).rejects.toThrow('failed')
  await Promise.resolve()
  TestWorker.instances[0]!.respond({ kind: 'error', message: 'failed' })
  await rejected
  expect(TestWorker.instances[0]!.terminate).toHaveBeenCalledOnce()
  const retry = encodeDocumentFile(document)
  await Promise.resolve()
  const worker = TestWorker.instances[1]!
  expect(worker.postMessage).toHaveBeenCalledWith({ kind: 'encode', document }, [])
  vi.advanceTimersByTime(30_001)
  expect(worker.terminate).not.toHaveBeenCalled()
  worker.respond({ kind: 'encoded', bytes: new Uint8Array() })
  await retry
  vi.advanceTimersByTime(30_000)
  expect(worker.terminate).toHaveBeenCalledOnce()
  const afterIdle = encodeDocumentFile(document)
  await Promise.resolve()
  const restarted = TestWorker.instances[2]!
  expect(restarted.postMessage).toHaveBeenCalledWith({ kind: 'encode', document }, [])
  restarted.respond({ kind: 'encoded', bytes: new Uint8Array([4]) })
  expect(await afterIdle).toEqual(new Uint8Array([4]))
})

it('keeps native transport conversions inside the worker', async () => {
  const { encodeNativeDocumentFile, decodeNativeDocumentFile } =
    await import('./document-file-codec')
  const document = createEmptyDocument()
  const save = encodeNativeDocumentFile(document)
  await Promise.resolve()
  const worker = TestWorker.instances[0]!
  expect(worker.postMessage).toHaveBeenCalledWith({ kind: 'encode-native', document }, [])
  worker.respond({ kind: 'encoded-native', contents: 'canvaslide-zip:encoded' })
  expect(await save).toBe('canvaslide-zip:encoded')
  const open = decodeNativeDocumentFile('canvaslide-zip:encoded')
  await Promise.resolve()
  expect(worker.postMessage).toHaveBeenLastCalledWith(
    { kind: 'decode-native', contents: 'canvaslide-zip:encoded' },
    []
  )
  worker.respond({ kind: 'decoded', result: { ok: true, document } })
  expect(await open).toEqual({ ok: true, document })
})
