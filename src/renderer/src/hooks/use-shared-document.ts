import { useEffect } from 'react'
import { cancelShareRequest } from '@/lib/document/launch-link-session'
import { openSharedLink } from '@/lib/document/launch-links'

export function useSharedDocument(): void {
  useEffect(() => {
    void openSharedLink(window.location.search)
    return cancelShareRequest
  }, [])
}
