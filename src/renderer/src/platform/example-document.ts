import { exampleAssetPath, findExample, MAX_EXAMPLE_BYTES } from '@shared/example-catalog'
import { decodeDocumentFile } from '@/lib/workers/document-file-codec'

export type ExampleErrorCode = 'unknown' | 'missing' | 'network' | 'invalid' | 'changed'
export class ExampleError extends Error {
  constructor(public readonly code: ExampleErrorCode) {
    super(code)
  }
}

async function readExampleBytes(response: Response) {
  if (!response.body || Number(response.headers.get('content-length')) > MAX_EXAMPLE_BYTES) {
    throw new ExampleError('invalid')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      length += value.byteLength
      if (length > MAX_EXAMPLE_BYTES) {
        throw new ExampleError('invalid')
      }
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function fetchExampleDocument(id: string, signal: AbortSignal) {
  const example = findExample(id)
  if (!example) {
    throw new ExampleError('unknown')
  }
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) {
    cancel()
  }
  const timeout = setTimeout(cancel, 30_000)
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${exampleAssetPath(example.id)}`, {
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error'
    })
    if (!response.ok) {
      throw new ExampleError(response.status === 404 ? 'missing' : 'network')
    }
    const bytes = await readExampleBytes(response)
    const result = await decodeDocumentFile(bytes)
    if (!result.ok) {
      throw new ExampleError('invalid')
    }
    return result.document
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ExampleError('network')
    }
    throw error instanceof ExampleError ? error : new ExampleError('network')
  } finally {
    // Stop an unread response body too, including rejection based on Content-Length.
    controller.abort()
    clearTimeout(timeout)
    signal.removeEventListener('abort', cancel)
  }
}

export function clearExampleQuery(): void {
  const url = new URL(window.location.href)
  if (url.searchParams.has('example')) {
    url.searchParams.delete('example')
    window.history.replaceState(window.history.state, '', url)
  }
}
