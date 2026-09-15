import { useEffect } from 'react'
import { onLaunchDocument } from '@/platform/launch-document'
import type { DocumentCommands } from './use-document-commands'

/** Opens the document the app was launched with, or one opened while it was already running. */
export function useLaunchDocument(commands: DocumentCommands): void {
  useEffect(() => onLaunchDocument((path) => void commands.openDocumentPath(path)), [commands])
}
