/**
 * The one way to replace the open document: guard unsaved work, read the replacement, leave
 * presentation, load it, drop launch links that no longer name it, and place the camera.
 */
import { cameraForOpenedDocument } from '@shared/canvas/frame-fit'
import { clearShareQuery } from '@/platform/cloud-share'
import { confirmDiscardChanges, type OpenedDocument } from '@/platform/document-file-access'
import { useCameraStore } from '@/store/camera-store'
import { useCloudShareStore } from '@/store/cloud-share-store'
import { useDocumentStore, watchDocumentChanges } from '@/store/document-store'
import { hideExampleDialog, hideShareDialog } from './launch-link-session'
import { usePresentationStore } from '@/store/presentation-store'

export type Placement = {
  /**
   * 'fit' shows the whole board, since a saved camera may point at empty space; 'saved' returns to
   * the document's own camera; 'keep' leaves the camera to a caller that moves it next.
   */
  camera: 'fit' | 'saved' | 'keep'
  /** Recovered work has no copy on disk, so it opens unsaved. */
  recovered?: boolean
  /** The launch link (share or example) that named this document stays so a reload reopens it. */
  keepLink?: boolean
}

export type ReplacementRequest = {
  /** Resolves to the replacement, or null when there is none to load (cancelled, unreadable). */
  read: () => Promise<OpenedDocument | null>
  /**
   * 'ask' confirms discarding unsaved work, for a replacement the author chose; 'refuse' keeps it
   * untouched, for one a link started, whose author is told to open the link in a new window.
   */
  onDirty: 'ask' | 'refuse'
  /** How the editor shows it, or a caller that loads it later with `loadReplacement`. */
  load: Placement | ((opened: OpenedDocument) => void)
}

/**
 * - `declined`: the author kept their unsaved work at the confirmation.
 * - `refused`: an edit gesture in progress, or unsaved work a replacement may not ask about.
 * - `changed`: the document changed, or an edit gesture was in progress, when it was ready.
 * - `cancelled`: `read` found nothing to load.
 */
export type ReplacementOutcome = 'replaced' | 'declined' | 'refused' | 'changed' | 'cancelled'

export async function replaceDocument({
  read,
  onDirty,
  load
}: ReplacementRequest): Promise<ReplacementOutcome> {
  const before = useDocumentStore.getState()
  // Why before asking: a gesture still running when the replacement is ready cancels it anyway.
  if (before.editBaseline || (onDirty === 'refuse' && before.dirty)) {
    return 'refused'
  }
  let changed = false
  // Content, not identity: a text remeasurement (e.g. a web font loading) must not cancel it, and
  // an edit that Undo later reverts still counts.
  const unwatch = watchDocumentChanges(() => {
    changed = true
  })
  try {
    if (before.dirty && !(await confirmDiscardChanges())) {
      return 'declined'
    }
    if (changed) {
      return 'changed'
    }
    const opened = await read()
    if (!opened) {
      return 'cancelled'
    }
    // Why the edit check: a gesture still in progress would carry on into the replacement.
    if (changed || useDocumentStore.getState().editBaseline) {
      return 'changed'
    }
    unwatch()
    if (typeof load === 'function') {
      load(opened)
    } else {
      loadReplacement(opened, load)
    }
    return 'replaced'
  } finally {
    unwatch()
  }
}

/** Loads a replacement that already passed `replaceDocument`'s guard. */
export function loadReplacement(
  { document, filePath }: OpenedDocument,
  { camera, recovered = false, keepLink = false }: Placement
): void {
  usePresentationStore.getState().exit()
  const store = useDocumentStore.getState()
  if (recovered) {
    store.restoreDocument(document, filePath)
  } else {
    store.loadDocument(document, filePath)
  }
  if (!keepLink) {
    const share = useCloudShareStore.getState()
    // A share link still loading would otherwise finish and report the new document as changed.
    if (share.open && share.mode === 'load') {
      hideShareDialog()
    }
    clearShareQuery()
    hideExampleDialog()
  }
  if (camera !== 'keep') {
    const current = useCameraStore.getState()
    current.setCamera(
      (camera === 'saved' && document.camera) || cameraForOpenedDocument(document, current.viewport)
    )
  }
}
