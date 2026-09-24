import { invoke, isTauri } from '@tauri-apps/api/core'
import type { VideoOptions } from '@shared/media/linked-video'
import { reportError } from './document-file-access'

export function videoPlaybackAccess(): Pick<VideoOptions, 'embedOrigin' | 'openOriginal'> {
  return {
    ...(isTauri() ? { embedOrigin: () => invoke<string>('video_embed_origin') } : {}),
    openOriginal: (url) => {
      if (isTauri()) {
        void import('@tauri-apps/plugin-opener')
          .then(({ openUrl }) => openUrl(url))
          .catch(reportError)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    }
  }
}
