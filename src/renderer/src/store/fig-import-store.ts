import { create } from 'zustand'
import { MAX_FIG_BYTES, type FigPage, type FigWarnings } from '@shared/fig/fig-types'
import { fitContentToViewport } from '@shared/canvas/frame-fit'
import type { FigImportOptions } from '@shared/fig/fig-convert'
import type { Point } from '@shared/canvas/element-types'
import { nextFrameOrder } from '@shared/canvas/presentation-sequence'
import { visibleWorldRect } from '@shared/canvas/camera-transform'
import type { FigImportRequest, FigImportResponse } from '@/lib/workers/fig-import.worker'
import { useCameraStore } from './camera-store'
import { newElementId, useDocumentStore } from './document-store'
import { useToolStore } from './tool-store'

type FigImportSummary = { pages: number; elements: number; texts: number; warnings: FigWarnings }
type FigImportState = {
  open: boolean
  phase: 'reading' | 'ready' | 'converting' | 'done' | 'error'
  name: string
  pages: FigPage[]
  selected: string[]
  mode: FigImportOptions['mode']
  summary: FigImportSummary | null
  error: string
  hide: () => void
  select: (ids: string[]) => void
  setMode: (mode: FigImportOptions['mode']) => void
  convert: () => void
}

type ImportSession = {
  worker: Worker | null
  finish: () => void
  origin: Point
  documentSession: number
}
let active: ImportSession | null = null

function stopWorker(session: ImportSession): void {
  session.worker?.terminate()
  session.worker = null
}

function fail(session: ImportSession, error: string): void {
  if (active === session) {
    stopWorker(session)
    useFigImportStore.setState({ phase: 'error', error })
  }
}

export const useFigImportStore = create<FigImportState>()((set, get) => ({
  open: false,
  phase: 'reading',
  name: '',
  pages: [],
  selected: [],
  mode: 'editable',
  summary: null,
  error: '',
  hide: () => {
    const session = active
    active = null
    if (session) {
      stopWorker(session)
      session.finish()
    }
    set({ open: false, summary: null, pages: [], selected: [] })
  },
  select: (selected) => set({ selected }),
  setMode: (mode) => set({ mode }),
  convert: () => {
    const state = get()
    const session = active
    if (!session?.worker || state.phase !== 'ready' || state.selected.length === 0) {
      return
    }
    set({ phase: 'converting' })
    try {
      session.worker.postMessage({
        type: 'convert',
        options: {
          pages: state.selected,
          mode: state.mode,
          origin: session.origin,
          firstFrameOrder: nextFrameOrder(useDocumentStore.getState().document),
          idPrefix: newElementId()
        }
      } satisfies FigImportRequest)
    } catch {
      fail(session, 'FIG_INVALID')
    }
  }
}))

function receive(session: ImportSession, message: FigImportResponse): void {
  if (active !== session || !session.worker) {
    return
  }
  if (message.type === 'error') {
    fail(session, message.code)
  } else if (message.type === 'ready') {
    const selected = message.pages.find((page) => page.count > 0)
    if (!selected) {
      fail(session, 'FIG_EMPTY')
      return
    }
    useFigImportStore.setState({
      name: message.name,
      pages: message.pages,
      selected: [selected.id],
      phase: 'ready'
    })
  } else {
    const store = useDocumentStore.getState()
    if (store.session !== session.documentSession) {
      fail(session, 'FIG_DOCUMENT_CHANGED')
      return
    }
    const result = message.result
    store.insertImported(result.assets, result.elements, result.frameIds)
    useToolStore.getState().setTool('select')
    const firstPage = result.elements.find((element) => element.id === result.frameIds[0])
    if (firstPage) {
      const cameraStore = useCameraStore.getState()
      cameraStore.setCamera(fitContentToViewport(firstPage, cameraStore.viewport))
    }
    stopWorker(session)
    useFigImportStore.setState({
      phase: 'done',
      summary: {
        pages: result.pages,
        elements: result.elements.length,
        texts: result.elements.filter((element) => element.type === 'text').length,
        warnings: result.warnings
      }
    })
  }
}

async function read(file: File, session: ImportSession): Promise<void> {
  try {
    const worker = new Worker(new URL('../lib/workers/fig-import.worker.ts', import.meta.url), {
      type: 'module'
    })
    session.worker = worker
    worker.onerror = () => {
      if (session.worker === worker) {
        fail(session, 'FIG_INVALID')
      }
    }
    worker.onmessage = (event: MessageEvent<FigImportResponse>) => receive(session, event.data)
    const bytes = await file.arrayBuffer()
    if (active === session && session.worker === worker) {
      worker.postMessage(
        { type: 'read', bytes, name: file.name.replace(/\.fig$/i, '') } satisfies FigImportRequest,
        [bytes]
      )
    }
  } catch {
    fail(session, 'FIG_INVALID')
  }
}

export function importFigFile(file: File, at?: Point): Promise<void> {
  if (active) {
    return Promise.resolve()
  }
  const { camera, viewport } = useCameraStore.getState()
  const visible = visibleWorldRect(camera, viewport)
  let finish!: () => void
  const closed = new Promise<void>((resolve) => {
    finish = resolve
  })
  const session: ImportSession = {
    worker: null,
    finish,
    origin: at ?? { x: visible.x + visible.width * 0.1, y: visible.y + visible.height * 0.1 },
    documentSession: useDocumentStore.getState().session
  }
  active = session
  useFigImportStore.setState({
    open: true,
    phase: 'reading',
    name: file.name,
    pages: [],
    selected: [],
    summary: null,
    error: ''
  })
  if (file.size > MAX_FIG_BYTES) {
    fail(session, 'FIG_LIMIT')
  } else {
    void read(file, session)
  }
  return closed
}
