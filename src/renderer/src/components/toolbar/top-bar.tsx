import {
  Circle,
  CircleQuestionMark,
  FilePlus2,
  FolderOpen,
  Play,
  Redo2,
  Save,
  Settings,
  Share2,
  Undo2
} from 'lucide-react'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
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
  useSettingsDialogStore,
  useShortcutHelpStore
} from '@/store/modal-dialogs'
import { selectUpdateAvailable, useUpdateStore } from '@/store/update-store'
import { usePresentationStore } from '@/store/presentation-store'
import { useCloudShareStore } from '@/store/cloud-share-store'

export function TopBar({ commands }: { commands: DocumentCommands }) {
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
  const updateAvailable = useUpdateStore(selectUpdateAvailable)
  const frameCount = orderedFrames(document).length

  return (
    <header className="flex h-11 items-center gap-2 border-b border-border bg-background px-3 [&_button]:shrink-0 [&_button]:whitespace-nowrap">
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
      <div className="mx-1 h-5 w-px bg-border" />
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
      <div className="mx-1 h-5 w-px bg-border" />
      <input
        aria-label={t('file.documentName')}
        className={`${inputClass} min-w-0 w-48`}
        value={document.name}
        onChange={(event) => renameDocument(event.target.value)}
      />
      {dirty && (
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {t('file.unsaved')}
        </span>
      )}
      <div className="flex-1" />
      <IconButton label={`${t('help.title')} (K)`} onClick={showHelp} aria-keyshortcuts="K">
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
      <IconButton label={`${t('settings.title')} (${shortcutLabel(',')})`} onClick={showSettings}>
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
    </header>
  )
}
