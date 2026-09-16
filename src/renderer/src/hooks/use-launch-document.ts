import { useEffect } from 'react'
import { onLaunchDocument } from '@/platform/launch-document'
import type { DocumentCommands } from './use-document-commands'

/** Opens the document the app was launched with, or one opened while it was already running. */
export function useLaunchDocument(commands: DocumentCommands): void {
  // Why return the promise: the drain waits on it, so two documents never load at once.
  useEffect(() => onLaunchDocument((path) => commands.openDocumentPath(path)), [commands])
}
