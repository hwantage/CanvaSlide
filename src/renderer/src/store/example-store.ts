import { create } from 'zustand'
import { loadExampleDocument } from '@/lib/document/load-example-document'
import { clearExampleQuery, ExampleError, type ExampleErrorCode } from '@/platform/example-document'
import { isTauriRuntime } from '@/platform/tauri-runtime'

type ExampleState = {
  open: boolean
  busy: boolean
  error: ExampleErrorCode | null
  openLink: (search: string) => Promise<void>
  hide: () => void
}
let pending: AbortController | null = null

export const useExampleStore = create<ExampleState>((set) => ({
  open: false,
  busy: false,
  error: null,
  openLink: async (search) => {
    pending?.abort()
    const params = new URLSearchParams(search)
    // A cloud link owns its access mode; an example parameter must not redirect that entry.
    if (isTauriRuntime() || params.has('share') || !params.has('example')) {
      pending = null
      set({ open: false, busy: false, error: null })
      return
    }
    const request = new AbortController()
    pending = request
    set({ open: true, busy: true, error: null })
    try {
      if (params.getAll('example').length !== 1) {
        throw new ExampleError('unknown')
      }
      await loadExampleDocument(params.get('example')!, request.signal)
      if (!request.signal.aborted) {
        set({ open: false, busy: false })
      }
    } catch (error) {
      if (!request.signal.aborted) {
        set({ busy: false, error: error instanceof ExampleError ? error.code : 'network' })
      }
    } finally {
      if (pending === request) {
        pending = null
      }
    }
  },
  hide: () => {
    pending?.abort()
    pending = null
    clearExampleQuery()
    set({ open: false, busy: false, error: null })
  }
}))

export function cancelExampleRequest(): void {
  pending?.abort()
}
