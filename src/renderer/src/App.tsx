import { CanvasViewport } from '@/components/canvas/canvas-viewport'
import { ExportDialog } from '@/components/panels/export-dialog'
import { FrameListPanel } from '@/components/panels/frame-list-panel'
import { PropertiesPanel } from '@/components/panels/properties-panel'
import { SettingsDialog } from '@/components/panels/settings-dialog'
import { ShortcutHelpDialog } from '@/components/panels/shortcut-help-dialog'
import { ToolBar } from '@/components/toolbar/tool-bar'
import { TopBar } from '@/components/toolbar/top-bar'
import { ZoomControls } from '@/components/toolbar/zoom-controls'
import { useDocumentCommands, useWindowTitle } from '@/hooks/use-document-commands'
import { useClipboard } from '@/hooks/use-clipboard'
import { useCloseGuard } from '@/hooks/use-close-guard'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useUpdateCheck } from '@/hooks/use-update-check'
import { selectPresentationActive, usePresentationStore } from '@/store/presentation-store'

export function App() {
  const commands = useDocumentCommands()
  const presenting = usePresentationStore(selectPresentationActive)
  useKeyboardShortcuts(commands)
  useClipboard()
  useWindowTitle()
  useCloseGuard()
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
        {!presenting && (
          <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-background p-3">
            <FrameListPanel />
            <PropertiesPanel />
          </aside>
        )}
      </div>
    </div>
  )
}
