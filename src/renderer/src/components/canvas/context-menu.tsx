import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Point } from '@shared/canvas/element-types'
import { contentBounds } from '@shared/canvas/element-bounds'
import { canGroup, canUngroup } from '@shared/canvas/element-groups'
import { t } from '@/i18n/ui-strings'
import { importPickedFiles, pasteFromSystemClipboard } from '@/lib/external-content'
import { copySelection, cutSelection } from '@/lib/object-clipboard'
import { shiftLabel, shortcutLabel } from '@/lib/platform-keys'
import { selectionIsOnlyFrames } from '@shared/canvas/frame-from-selection'
import {
  frameSelection,
  presentFromSelection,
  selectedFrameIndex,
  startEditingSelection,
  zoomToSelection
} from '@/lib/selection-commands'
import { copySelectedStyle, hasCopiedStyle, pasteStyleToSelection } from '@/lib/style-clipboard'
import { selectViewport, useCameraStore } from '@/store/camera-store'
import { useContextMenuStore } from '@/store/context-menu-store'
import { selectDocument, selectSelectedIds, useDocumentStore } from '@/store/document-store'

type MenuItem =
  | {
      kind: 'item'
      label: string
      shortcut?: string
      disabled?: boolean
      danger?: boolean
      run: () => void
    }
  | { kind: 'separator' }

const separator: MenuItem = { kind: 'separator' }
const item = (
  label: string,
  run: () => void,
  extra: { shortcut?: string; disabled?: boolean; danger?: boolean } = {}
): MenuItem => ({ kind: 'item', label, run, ...extra })

function selectionItems(world: Point | null): MenuItem[] {
  const store = useDocumentStore.getState()
  const { document, selectedIds } = store
  const only = selectedIds.length === 1 ? document.elements[selectedIds[0] as string] : undefined
  // Why: z-order moves nothing a user can see for frames, and wrapping one adds a duplicate slide.
  const onlyFrames = selectionIsOnlyFrames(document, selectedIds)
  const items: MenuItem[] = []
  if (only && only.type !== 'image') {
    items.push(
      only.type === 'frame'
        ? item(t('edit.renameFrame'), () => startEditingSelection({ frames: true }), {
            shortcut: 'F2'
          })
        : item(t('edit.editText'), () => startEditingSelection({ frames: false }), {
            shortcut: '⏎'
          }),
      separator
    )
  }
  items.push(
    item(t('edit.cut'), () => cutSelection(), { shortcut: shortcutLabel('X') }),
    item(t('edit.copy'), () => copySelection(), { shortcut: shortcutLabel('C') }),
    item(t('edit.paste'), () => void pasteFromSystemClipboard(world ?? undefined), {
      shortcut: shortcutLabel('V')
    }),
    item(t('edit.duplicate'), store.duplicateSelected, { shortcut: shortcutLabel('D') }),
    item(t('edit.delete'), store.deleteSelected, { shortcut: 'Del', danger: true }),
    separator,
    item(t('edit.copyStyle'), () => copySelectedStyle(), {
      shortcut: shortcutLabel('C', { alt: true }),
      disabled: !only || only.type === 'image' || only.type === 'frame'
    }),
    item(t('edit.pasteStyle'), () => pasteStyleToSelection(), {
      shortcut: shortcutLabel('V', { alt: true }),
      disabled: !hasCopiedStyle()
    }),
    separator,
    item(t('edit.group'), store.groupSelected, {
      shortcut: shortcutLabel('G'),
      disabled: !canGroup(document, selectedIds)
    }),
    item(t('edit.ungroup'), store.ungroupSelected, {
      shortcut: shortcutLabel('G', { shift: true }),
      disabled: !canUngroup(document, selectedIds)
    }),
    separator,
    item(t('order.front'), () => store.reorderSelected('front'), {
      shortcut: shortcutLabel(']', { shift: true }),
      disabled: onlyFrames
    }),
    item(t('order.forward'), () => store.reorderSelected('forward'), {
      shortcut: shortcutLabel(']'),
      disabled: onlyFrames
    }),
    item(t('order.backward'), () => store.reorderSelected('backward'), {
      shortcut: shortcutLabel('['),
      disabled: onlyFrames
    }),
    item(t('order.back'), () => store.reorderSelected('back'), {
      shortcut: shortcutLabel('[', { shift: true }),
      disabled: onlyFrames
    }),
    separator,
    item(t('selection.frame'), () => frameSelection(), {
      shortcut: shortcutLabel('F', { shift: true }),
      disabled: onlyFrames
    }),
    item(t('selection.zoom'), () => zoomToSelection(), { shortcut: `${shiftLabel()}2` })
  )
  if (selectedFrameIndex() !== -1) {
    items.push(
      item(t('present.fromFrame'), presentFromSelection, {
        shortcut: shortcutLabel('⏎', { shift: true })
      })
    )
  }
  return items
}

function canvasItems(world: Point | null): MenuItem[] {
  const store = useDocumentStore.getState()
  return [
    item(t('edit.paste'), () => void pasteFromSystemClipboard(world ?? undefined), {
      shortcut: shortcutLabel('V')
    }),
    item(t('edit.selectAll'), store.selectAll, { shortcut: shortcutLabel('A') }),
    separator,
    item(t('import.files'), () => void importPickedFiles(world ?? undefined), {
      shortcut: shortcutLabel('I')
    }),
    item(
      t('zoom.fit'),
      () => {
        const bounds = contentBounds(store.document)
        if (bounds) {
          useCameraStore.getState().fitContent(bounds)
        }
      },
      { shortcut: `${shiftLabel()}1` }
    )
  ]
}

function MenuButton({ entry, onDone }: { entry: MenuItem; onDone: () => void }): ReactNode {
  if (entry.kind === 'separator') {
    return <div role="separator" className="my-1 h-px bg-border" />
  }
  return (
    <button
      type="button"
      role="menuitem"
      disabled={entry.disabled}
      className={`flex h-7 w-full items-center justify-between gap-6 rounded-md px-2 text-left text-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-40 ${
        entry.danger ? 'text-destructive' : ''
      }`}
      onClick={() => {
        onDone()
        entry.run()
      }}
    >
      <span>{entry.label}</span>
      {entry.shortcut && <span className="text-muted-foreground">{entry.shortcut}</span>}
    </button>
  )
}

/** Right-click menu anchored inside the viewport; flips to stay fully visible near the edges. */
export function ContextMenu() {
  const position = useContextMenuStore((s) => s.position)
  const world = useContextMenuStore((s) => s.world)
  const hide = useContextMenuStore((s) => s.hide)
  const viewport = useCameraStore(selectViewport)
  // Why: subscribing keeps the item list in sync when the selection changes underneath the menu.
  useDocumentStore(selectSelectedIds)
  useDocumentStore(selectDocument)
  const ref = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<Point | null>(null)

  useLayoutEffect(() => {
    if (!position || !ref.current) {
      setPlaced(null)
      return
    }
    const { offsetWidth, offsetHeight } = ref.current
    setPlaced({
      x: Math.max(0, Math.min(position.x, viewport.width - offsetWidth - 4)),
      y: Math.max(0, Math.min(position.y, viewport.height - offsetHeight - 4))
    })
  }, [position, viewport])

  if (!position) {
    return null
  }
  const items =
    useDocumentStore.getState().selectedIds.length > 0 ? selectionItems(world) : canvasItems(world)
  const at = placed ?? position
  return (
    <>
      <div
        className="absolute inset-0 z-20"
        data-canvas-ui
        onPointerDown={hide}
        onContextMenu={(e) => {
          e.preventDefault()
          hide()
        }}
      />
      <div
        ref={ref}
        role="menu"
        data-testid="context-menu"
        data-canvas-ui
        className="absolute z-30 min-w-52 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        style={{ left: at.x, top: at.y, visibility: placed ? 'visible' : 'hidden' }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {items.map((entry, index) => (
          <MenuButton key={index} entry={entry} onDone={hide} />
        ))}
      </div>
    </>
  )
}
