import { useEffect } from 'react'
import { cancelShareRequest, useCloudShareStore } from '@/store/cloud-share-store'

export function useSharedDocument(): void {
  useEffect(() => {
    void useCloudShareStore.getState().openLink(window.location.search)
    return cancelShareRequest
  }, [])
}
