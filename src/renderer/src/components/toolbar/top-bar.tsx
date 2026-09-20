import {
  Circle,
  CircleQuestionMark,
  Ellipsis,
  FilePlus2,
  FolderOpen,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Redo2,
  Save,
  Settings,
  Share2,
  Sparkles,
  Undo2
} from 'lucide-react'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import { ActionMenu } from '@/components/ui/action-menu'
import { IconButton } from '@/components/ui/icon-button'
import { GitHubIcon } from '@/components/ui/github-icon'
import { TextButton } from '@/components/ui/text-button'
import { inputClass } from '@/components/ui/field-row'
import type { DocumentCommands } from '@/hooks/use-document-commands'
import { t } from '@/i18n/ui-strings'
import { shortcutLabel } from '@/lib/platform-keys'
import { openRepositoryPage } from '@/platform/external-links'
import {
  selectCanRedo,
  selectCanUndo,
  selectDocument,
  useDocumentStore
} from '@/store/document-store'
import {
  useAboutDialogStore,
  useAiGuideStore,
  useSettingsDialogStore,
  useShortcutHelpStore
} from '@/store/modal-dialogs'
import { selectUpdateAvailable, useUpdateStore } from '@/store/update-store'
import { usePresentationStore } from '@/store/presentation-store'
import { useCloudShareStore } from '@/store/cloud-share-store'

function ShortcutHelpIcon() {
  return (
    <Circle size={16} aria-hidden>
      <text
        x={12}
        y={16}
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize={12}
        fontWeight={600}
      >
        K
      </text>
    </Circle>
  )
}

export function TopBar({
  commands,
  compact,
  panelOpen,
  onTogglePanel
}: {
  commands: DocumentCommands
  compact: boolean
  panelOpen: boolean
  onTogglePanel: () => void
}) {
  const document = useDocumentStore(selectDocument)
  const dirty = useDocumentStore((s) => s.dirty)
  const canUndo = useDocumentStore(selectCanUndo)
  const canRedo = useDocumentStore(selectCanRedo)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)
  const renameDocument = useDocumentStore((s) => s.renameDocument)
  const start = usePresentationStore((s) => s.start)
  const showShare = useCloudShareStore((s) => s.show)
  const showSettings = useSettingsDialogStore((s) => s.show)
  const showHelp = useShortcutHelpStore((s) => s.show)
  const showAbout = useAboutDialogStore((s) => s.show)
  const showAiGuide = useAiGuideStore((s) => s.show)
  const updateAvailable = useUpdateStore(selectUpdateAvailable)
  const frameCount = orderedFrames(document).length

  return (
    <header className="editor-top-bar relative z-30 flex min-h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-3 [&_button]:shrink-0 [&_button]:whitespace-nowrap">
      {compact ? (
        <ActionMenu
          label={t('menu.file')}
          icon={<Menu size={18} />}
          actions={[
            {
              label: t('file.new'),
              icon: <FilePlus2 size={16} />,
              onSelect: () => void commands.newDocument()
            },
            {
              label: t('file.open'),
              icon: <FolderOpen size={16} />,
              onSelect: () => void commands.openDocument()
            },
            {
              label: t('file.save'),
              icon: <Save size={16} />,
              onSelect: () => void commands.saveDocument()
            },
            {
              label: t('file.saveAs'),
              icon: <Save size={16} />,
              onSelect: () => void commands.saveDocumentAs()
            }
          ]}
        />
      ) : (
        <div className="flex items-center gap-1">
          <IconButton
            label={`${t('file.new')} (${shortcutLabel('N')})`}
            onClick={() => void commands.newDocument()}
          >
            <FilePlus2 size={16} />
          </IconButton>
          <IconButton
            label={`${t('file.open')} (${shortcutLabel('O')})`}
            onClick={() => void commands.openDocument()}
          >
            <FolderOpen size={16} />
          </IconButton>
          <IconButton
            label={`${t('file.save')} (${shortcutLabel('S')})`}
            onClick={() => void commands.saveDocument()}
          >
            <Save size={16} />
          </IconButton>
          <TextButton variant="ghost" onClick={() => void commands.saveDocumentAs()}>
            {t('file.saveAs')}
          </TextButton>
        </div>
      )}
      {!compact && <div className="mx-1 h-5 w-px bg-border" />}
      <div className="flex items-center gap-1">
        <IconButton
          label={`${t('edit.undo')} (${shortcutLabel('Z')})`}
          onClick={undo}
          disabled={!canUndo}
        >
          <Undo2 size={16} />
        </IconButton>
        <IconButton
          label={`${t('edit.redo')} (${shortcutLabel('Z', { shift: true })})`}
          onClick={redo}
          disabled={!canRedo}
        >
          <Redo2 size={16} />
        </IconButton>
      </div>
      {!compact && <div className="mx-1 h-5 w-px bg-border" />}
      <div className={`flex min-w-0 flex-1 ${compact ? 'flex-col' : 'items-center gap-2'}`}>
        <input
          aria-label={t('file.documentName')}
          className={`${inputClass} min-w-0 w-full max-w-48`}
          value={document.name}
          onChange={(event) => renameDocument(event.target.value)}
        />
        {dirty && !compact && (
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
            {t('file.unsaved')}
          </span>
        )}
      </div>
      {compact && (
        <IconButton
          label={t('present.start')}
          aria-pressed={undefined}
          disabled={frameCount === 0}
          title={
            frameCount === 0
              ? t('present.needsFrame')
              : `${t('present.start')} (${shortcutLabel('⏎')})`
          }
          onClick={() => start(0)}
        >
          <Play size={18} fill="currentColor" aria-hidden />
        </IconButton>
      )}
      {compact ? (
        <ActionMenu
          label={t('menu.actions')}
          icon={<Ellipsis size={18} />}
          align="right"
          actions={[
            { label: t('aiGuide.button'), icon: <Sparkles size={16} />, onSelect: showAiGuide },
            { label: t('help.title'), icon: <ShortcutHelpIcon />, onSelect: showHelp },
            {
              label: t('about.repository', { host: 'GitHub' }),
              icon: <GitHubIcon />,
              onSelect: () => void openRepositoryPage()
            },
            {
              label: `${updateAvailable ? `${t('update.badge')} · ` : ''}${t('about.title', { app: 'CanvaSlide' })}`,
              icon: <CircleQuestionMark size={16} />,
              onSelect: showAbout
            },
            { label: t('settings.title'), icon: <Settings size={16} />, onSelect: showSettings },
            { label: t('share.button'), icon: <Share2 size={16} />, onSelect: showShare }
          ]}
        />
      ) : (
        <>
          <IconButton label={t('aiGuide.button')} onClick={showAiGuide} aria-haspopup="dialog">
            <Sparkles size={16} aria-hidden />
          </IconButton>
          <IconButton label={`${t('help.title')} (K)`} onClick={showHelp} aria-keyshortcuts="K">
            <ShortcutHelpIcon />
          </IconButton>
          <IconButton
            label={t('about.repository', { host: 'GitHub' })}
            onClick={() => void openRepositoryPage()}
          >
            <GitHubIcon />
          </IconButton>
          <IconButton
            label={`${updateAvailable ? `${t('update.badge')} · ` : ''}${t('about.title', { app: 'CanvaSlide' })}`}
            className="relative"
            onClick={showAbout}
          >
            <CircleQuestionMark size={16} aria-hidden />
            {updateAvailable && (
              <span
                data-testid="update-badge"
                className="absolute right-1 top-1 h-2 w-2 rounded-full bg-selection"
              />
            )}
          </IconButton>
          <IconButton
            label={`${t('settings.title')} (${shortcutLabel(',')})`}
            onClick={showSettings}
          >
            <Settings size={16} />
          </IconButton>
          <div className="mx-1 h-5 w-px bg-border" />
          <TextButton
            variant="primary"
            disabled={frameCount === 0}
            title={
              frameCount === 0
                ? t('present.needsFrame')
                : `${t('present.start')} (${shortcutLabel('⏎')})`
            }
            onClick={() => start(0)}
          >
            <Play size={14} /> {t('present.start')}
          </TextButton>
          <TextButton onClick={showShare}>
            <Share2 size={14} /> {t('share.button')}
          </TextButton>
        </>
      )}
      <IconButton
        label={t(panelOpen ? 'panel.close' : 'panel.open')}
        aria-pressed={undefined}
        aria-expanded={panelOpen}
        aria-controls="editor-side-panel"
        onClick={onTogglePanel}
      >
        {panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
      </IconButton>
    </header>
  )
}
