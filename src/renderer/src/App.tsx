import { CanvasViewport } from '@/components/canvas/canvas-viewport'
import { ExportDialog } from '@/components/panels/export-dialog'
import { SidePanel } from '@/components/panels/side-panel'
import { SettingsDialog } from '@/components/panels/settings-dialog'
import { ShortcutHelpDialog } from '@/components/panels/shortcut-help-dialog'
import { ToolBar } from '@/components/toolbar/tool-bar'
import { TopBar } from '@/components/toolbar/top-bar'
import { ZoomControls } from '@/components/toolbar/zoom-controls'
import { useDocumentCommands, useWindowTitle } from '@/hooks/use-document-commands'
import { useClipboard } from '@/hooks/use-clipboard'
import { useCloseGuard } from '@/hooks/use-close-guard'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useLaunchDocument } from '@/hooks/use-launch-document'
import { useUpdateCheck } from '@/hooks/use-update-check'
import { selectPresentationActive, usePresentationStore } from '@/store/presentation-store'

export function App() {
  const commands = useDocumentCommands()
  const presenting = usePresentationStore(selectPresentationActive)
  useKeyboardShortcuts(commands)
  useClipboard()
  useWindowTitle()
  useCloseGuard()
  useLaunchDocument(commands)
  useUpdateCheck()

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {!presenting && <TopBar commands={commands} />}
      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <CanvasViewport />
          {!presenting && (
            <>
              <div className="absolute left-3 top-3">
                <ToolBar />
              </div>
              <div className="absolute bottom-3 right-3">
                <ZoomControls />
              </div>
            </>
          )}
        </main>
        {!presenting && <ExportDialog />}
        {!presenting && <SettingsDialog />}
        {!presenting && <ShortcutHelpDialog />}
        {!presenting && <SidePanel />}
      </div>
    </div>
  )
}
