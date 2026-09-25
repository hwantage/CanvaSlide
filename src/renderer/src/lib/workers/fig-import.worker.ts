import { readFigFile } from '@shared/fig/fig-file'
import {
  convertFigFile,
  type FigImportOptions,
  type FigImportResult
} from '@shared/fig/fig-convert'
import { figPages } from '@shared/fig/fig-scene'
import type { FigFile, FigPage } from '@shared/fig/fig-types'

export type FigImportRequest =
  | { type: 'read'; bytes: ArrayBuffer; name: string }
  | { type: 'convert'; options: FigImportOptions }

export type FigImportResponse =
  | { type: 'ready'; name: string; pages: FigPage[] }
  | { type: 'result'; result: FigImportResult }
  | { type: 'error'; code: string }

let file: FigFile | null = null
self.onmessage = (event: MessageEvent<FigImportRequest>) => {
  try {
    if (event.data.type === 'read') {
      file = readFigFile(new Uint8Array(event.data.bytes), event.data.name)
      self.postMessage({
        type: 'ready',
        name: file.name,
        pages: figPages(file)
      } satisfies FigImportResponse)
    } else {
      if (!file) {
        throw new Error('FIG_INVALID')
      }
      self.postMessage({
        type: 'result',
        result: convertFigFile(file, event.data.options)
      } satisfies FigImportResponse)
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      code: error instanceof Error ? error.message : 'FIG_INVALID'
    } satisfies FigImportResponse)
  }
}
