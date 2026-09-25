import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { SIDE_PANEL_SPLIT, clampSplit, defaultSplit } from '@shared/ui/panel-split'
import { t } from '@/i18n/ui-strings'
import { selectSelectedIds, useDocumentStore } from '@/store/document-store'
import { FrameListPanel } from './frame-list-panel'
import { PropertiesPanel } from './properties-panel'

const STORAGE_KEY = 'canvaslide.sidePanel.frameHeight'
const KEYBOARD_STEP = 24

function readStoredHeight(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** Frames above, properties below; the handle between them drags, and each pane scrolls alone. */
export function SidePanel() {
  const ref = useRef<HTMLElement>(null)
  const [total, setTotal] = useState(0)
  const [wanted, setWanted] = useState<number | null>(readStoredHeight)
  const hasSelection = useDocumentStore((s) => selectSelectedIds(s).length > 0)

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(() => setTotal(element.clientHeight))
    observer.observe(element)
    setTotal(element.clientHeight)
    return () => observer.disconnect()
  }, [])

  const top =
    total === 0
      ? 0
      : clampSplit(wanted ?? defaultSplit(total, SIDE_PANEL_SPLIT), total, SIDE_PANEL_SPLIT)

  const commit = (height: number) => {
    setWanted(height)
    try {
      localStorage.setItem(STORAGE_KEY, String(height))
    } catch {
      // Why: the split is a convenience; blocked storage must not break the panel.
    }
  }

  const onHandleDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startTop = top
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const onMove = (move: globalThis.PointerEvent) => {
      commit(clampSplit(startTop + move.clientY - startY, total, SIDE_PANEL_SPLIT))
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  const onHandleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === 'ArrowUp' ? -KEYBOARD_STEP : event.key === 'ArrowDown' ? KEYBOARD_STEP : 0
    if (delta !== 0) {
      event.preventDefault()
      commit(clampSplit(top + delta, total, SIDE_PANEL_SPLIT))
    }
  }

  return (
    <aside
      ref={ref}
      data-testid="side-panel"
      className="flex h-full w-64 max-w-[100vw] shrink-0 flex-col border-l border-border bg-background"
    >
      <div
        data-testid="frames-pane"
        data-scroll-pane
        className="shrink-0 overflow-y-auto p-3"
        style={{ height: total === 0 ? undefined : top }}
      >
        <FrameListPanel />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('panel.resize')}
        aria-valuenow={top}
        tabIndex={0}
        data-testid="panel-split-handle"
        className="group flex shrink-0 cursor-row-resize items-center justify-center bg-border/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ height: SIDE_PANEL_SPLIT.handle }}
        onPointerDown={onHandleDown}
        onKeyDown={onHandleKey}
      >
        <span className="h-0.5 w-8 rounded-full bg-muted-foreground/50 group-hover:bg-muted-foreground" />
      </div>
      <div
        data-testid="properties-pane"
        className="min-h-0 flex-1 overflow-y-auto p-3"
        style={{ minHeight: SIDE_PANEL_SPLIT.minBottom }}
      >
        {hasSelection ? (
          <PropertiesPanel />
        ) : (
          <p className="px-1 text-xs text-muted-foreground">{t('props.empty')}</p>
        )}
      </div>
    </aside>
  )
}
