import { Focus, Maximize, Minus, Plus } from 'lucide-react'
import { contentBounds } from '@shared/canvas/element-bounds'
import { IconButton } from '@/components/ui/icon-button'
import { t } from '@/i18n/ui-strings'
import { shiftLabel, shortcutLabel } from '@/lib/platform-keys'
import { zoomToSelection } from '@/lib/selection-commands'
import { selectZoom, useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'

export function ZoomControls() {
  const zoom = useCameraStore(selectZoom)
  const zoomStep = useCameraStore((s) => s.zoomStep)
  const resetZoom = useCameraStore((s) => s.resetZoom)
  const fitContent = useCameraStore((s) => s.fitContent)
  const hasSelection = useDocumentStore((s) => s.selectedIds.length > 0)
  const fitAll = () => {
    const bounds = contentBounds(useDocumentStore.getState().document)
    if (bounds) {
      fitContent(bounds)
    }
  }
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md">
      <IconButton label={`${t('zoom.out')} (${shortcutLabel('-')})`} onClick={() => zoomStep(-1)}>
        <Minus size={14} />
      </IconButton>
      <button
        type="button"
        data-testid="zoom-level"
        title={`${t('zoom.reset')} (${shortcutLabel('0')})`}
        className="h-8 min-w-14 rounded-md px-1 text-xs tabular-nums hover:bg-accent"
        onClick={resetZoom}
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton label={`${t('zoom.in')} (${shortcutLabel('+')})`} onClick={() => zoomStep(1)}>
        <Plus size={14} />
      </IconButton>
      <IconButton label={`${t('zoom.fit')} (${shiftLabel()}1)`} onClick={fitAll}>
        <Maximize size={14} />
      </IconButton>
      <IconButton
        label={`${t('selection.zoom')} (${shiftLabel()}2)`}
        disabled={!hasSelection}
        onClick={zoomToSelection}
      >
        <Focus size={14} />
      </IconButton>
    </div>
  )
}
