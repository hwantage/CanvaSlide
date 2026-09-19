import type { CanvasDocument } from '@shared/canvas/element-types'
import type { ParseDocumentResult } from '@shared/canvas/document-file'
import type { DocumentEncodingInput } from '@shared/canvas/document-archive-encoder'

export type DocumentCodecRequest =
  | { kind: 'encode' | 'encode-native'; document: DocumentEncodingInput }
  | { kind: 'decode'; bytes: Uint8Array<ArrayBuffer> }
  | { kind: 'decode-native'; contents: string }
export type DocumentCodecResponse =
  | { kind: 'encoded'; bytes: Uint8Array<ArrayBuffer> }
  | { kind: 'encoded-native'; contents: string }
  | { kind: 'decoded'; result: ParseDocumentResult }
  | { kind: 'error'; message: string }
type Request =
  | { kind: 'encode' | 'encode-native'; document: CanvasDocument }
  | Exclude<DocumentCodecRequest, { document: DocumentEncodingInput }>

let worker: Worker | null = null
let previousAssets: CanvasDocument['assets'] = {}
let idleTimer: ReturnType<typeof setTimeout> | undefined
let pending: Promise<unknown> = Promise.resolve()

function resetWorker(): void {
  clearTimeout(idleTimer)
  worker?.terminate()
  worker = null
  previousAssets = {}
}

function execute(request: Request): Promise<DocumentCodecResponse> {
  clearTimeout(idleTimer)
  return new Promise((resolve, reject) => {
    worker ??= new Worker(new URL('./document-file.worker.ts', import.meta.url), { type: 'module' })
    const fail = (error: unknown) => {
      resetWorker()
      reject(error)
    }
    worker.onmessage = (event: MessageEvent<DocumentCodecResponse>) => {
      if (event.data.kind === 'error') {
        fail(new Error(event.data.message))
        return
      }
      previousAssets = 'document' in request ? request.document.assets : {}
      // Release cached resources and old document references after a pause between saves.
      idleTimer = setTimeout(resetWorker, 30_000)
      resolve(event.data)
    }
    worker.onerror = (event) => fail(new Error(event.message))
    worker.onmessageerror = () => fail(new Error('Could not read document worker response'))
    let message: DocumentCodecRequest = request
    if ('document' in request) {
      const assets = Object.fromEntries(
        Object.entries(request.document.assets).map(([id, asset]) => {
          if (previousAssets[id] !== asset) {
            return [id, asset]
          }
          const { data: _data, ...metadata } = asset
          return [id, metadata]
        })
      )
      message = { ...request, document: { ...request.document, assets } }
    }
    try {
      worker.postMessage(message, request.kind === 'decode' ? [request.bytes.buffer] : [])
    } catch (error) {
      fail(error)
    }
  })
}

function runCodec(request: Request): Promise<DocumentCodecResponse> {
  const task = pending.then(() => execute(request))
  pending = task.catch(() => {})
  return task
}

export async function encodeDocumentFile(
  document: CanvasDocument
): Promise<Uint8Array<ArrayBuffer>> {
  const result = await runCodec({ kind: 'encode', document })
  if (result.kind !== 'encoded') {
    throw new Error('Unexpected document worker response')
  }
  return result.bytes
}

export async function encodeNativeDocumentFile(document: CanvasDocument): Promise<string> {
  const result = await runCodec({ kind: 'encode-native', document })
  if (result.kind !== 'encoded-native') {
    throw new Error('Unexpected document worker response')
  }
  return result.contents
}

export async function decodeDocumentFile(
  bytes: Uint8Array<ArrayBuffer>
): Promise<ParseDocumentResult> {
  const result = await runCodec({ kind: 'decode', bytes })
  if (result.kind !== 'decoded') {
    throw new Error('Unexpected document worker response')
  }
  return result.result
}

export async function decodeNativeDocumentFile(contents: string): Promise<ParseDocumentResult> {
  const result = await runCodec({ kind: 'decode-native', contents })
  if (result.kind !== 'decoded') {
    throw new Error('Unexpected document worker response')
  }
  return result.result
}
