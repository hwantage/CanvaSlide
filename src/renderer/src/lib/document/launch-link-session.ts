import { clearShareQuery } from '@/platform/cloud-share'
import { clearExampleQuery } from '@/platform/example-document'
import { useCloudShareStore } from '@/store/cloud-share-store'
import { useExampleStore } from '@/store/example-store'

function createLinkRequest() {
  let pending: AbortController | null = null
  return {
    start(): AbortController {
      pending?.abort()
      pending = new AbortController()
      return pending
    },
    cancel(): void {
      pending?.abort()
      pending = null
    },
    finish(request: AbortController): void {
      if (pending === request) {
        pending = null
      }
    }
  }
}

export const shareRequest = createLinkRequest()
export const exampleRequest = createLinkRequest()

// StrictMode cleanup must cancel requests without clearing the launch query.
export function cancelShareRequest(): void {
  shareRequest.cancel()
}

export function cancelExampleRequest(): void {
  exampleRequest.cancel()
}

export function hideShareDialog(): void {
  cancelShareRequest()
  const share = useCloudShareStore.getState()
  if (share.open && share.mode === 'load') {
    clearShareQuery()
  }
  useCloudShareStore.setState({ open: false, busy: false })
}

export function hideExampleDialog(): void {
  cancelExampleRequest()
  clearExampleQuery()
  useExampleStore.setState({ open: false, busy: false, error: null })
}
