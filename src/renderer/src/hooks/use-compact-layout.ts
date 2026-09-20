import { useSyncExternalStore } from 'react'

const query = '(max-width: 1100px)'
let media: MediaQueryList | undefined
const getMedia = () => (media ??= window.matchMedia(query))
const getSnapshot = () => getMedia().matches
const getServerSnapshot = () => false
const subscribe = (notify: () => void) => {
  const queryList = getMedia()
  queryList.addEventListener('change', notify)
  return () => queryList.removeEventListener('change', notify)
}

export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
