import { useEffect, useRef, useState } from 'react'
import { useCompactLayout } from '@/hooks/use-compact-layout'
import { t } from '@/i18n/ui-strings'
import { CanvasViewport } from '@/components/canvas/canvas-viewport'
import { SharedSlideShow } from '@/components/canvas/shared-slide-show'
import { ExportDialog } from '@/components/panels/export-dialog'
import { FigImportDialog } from '@/components/panels/fig-import-dialog'
import { CloudShareDialog } from '@/components/panels/cloud-share-dialog'
import { SidePanel } from '@/components/panels/side-panel'
import { SettingsDialog } from '@/components/panels/settings-dialog'
import { ShortcutHelpDialog } from '@/components/panels/shortcut-help-dialog'
import { AboutDialog } from '@/components/panels/about-dialog'
import { AiGuideDialog } from '@/components/panels/ai-guide-dialog'
import { ToolBar } from '@/components/toolbar/tool-bar'
import { TopBar } from '@/components/toolbar/top-bar'
import { ZoomControls } from '@/components/toolbar/zoom-controls'
import { useDocumentCommands, useWindowTitle } from '@/hooks/use-document-commands'
import { useClipboard } from '@/hooks/use-clipboard'
import { useCloseGuard } from '@/hooks/use-close-guard'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useLaunchDocument } from '@/hooks/use-launch-document'
import { useSharedDocument } from '@/hooks/use-shared-document'
import { useSystemTheme } from '@/hooks/use-system-theme'
import { useUpdateCheck } from '@/hooks/use-update-check'
import { preventPageContextMenu } from '@/lib/native-context-menu'
import { selectLocale, useLanguageStore } from '@/store/language-store'
import { selectSlideShowActive, usePresentationStore } from '@/store/presentation-store'
import { useCloudShareStore } from '@/store/cloud-share-store'

export function App() {
  const presentation = useCloudShareStore((s) => s.presentation)
  useSharedDocument()
  return presentation ? <SharedSlideShow document={presentation} /> : <Editor />
}

function Editor() {
  const commands = useDocumentCommands()
  const presenting = usePresentationStore(selectSlideShowActive)
  const compact = useCompactLayout()
  const [panels, setPanels] = useState({ compact: false, wide: true })
  const panelOpen = compact ? panels.compact : panels.wide
  const panelRef = useRef<HTMLDivElement>(null)
  const togglePanel = () => {
    const mode = compact ? 'compact' : 'wide'
    setPanels((state) => ({ ...state, [mode]: !state[mode] }))
  }
  useEffect(() => {
    if (!compact || !panelOpen || presenting) {
      return
    }
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        document.querySelector('dialog[open], [role="dialog"], [role="menu"], [role="listbox"]')
      ) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      setPanels((state) => ({ ...state, compact: false }))
      document.querySelector<HTMLButtonElement>('[aria-controls="editor-side-panel"]')?.focus()
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as Element
      if (!panelRef.current?.contains(target) && !target.closest('header, dialog')) {
        setPanels((state) => ({ ...state, compact: false }))
      }
    }
    // Let editors cancel their draft before Escape can dismiss the panel.
    document.addEventListener('keydown', escape)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', escape)
      document.removeEventListener('pointerdown', outside)
    }
  }, [compact, panelOpen, presenting])
  // Why: t() reads the active locale as it renders, so the tree has to re-render when it changes.
  const locale = useLanguageStore(selectLocale)
  useKeyboardShortcuts(commands)
  useClipboard()
  useWindowTitle()
  useCloseGuard()
  useLaunchDocument(commands)
  useUpdateCheck()
  useSystemTheme()

  return (
    <div
      lang={locale}
      className="flex h-full flex-col bg-background text-foreground"
      onContextMenuCapture={preventPageContextMenu}
    >
      {!presenting && (
        <TopBar
          commands={commands}
          compact={compact}
          panelOpen={panelOpen}
          onTogglePanel={togglePanel}
        />
      )}
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
        {!presenting && <CloudShareDialog commands={commands} />}
        {!presenting && <FigImportDialog />}
        {!presenting && <SettingsDialog />}
        {!presenting && <ShortcutHelpDialog />}
        {!presenting && <AboutDialog />}
        {!presenting && <AiGuideDialog />}
        {!presenting && (
          <div
            ref={panelRef}
            id="editor-side-panel"
            hidden={!panelOpen}
            role="region"
            aria-label={t('panel.title')}
            className={
              compact
                ? 'absolute inset-y-0 right-0 z-20 max-w-full overflow-y-auto shadow-xl'
                : 'shrink-0'
            }
          >
            <SidePanel />
          </div>
        )}
      </div>
    </div>
  )
}
