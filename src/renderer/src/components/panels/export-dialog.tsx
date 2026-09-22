import { ModalDialog } from '@/components/ui/modal-dialog'
import { t } from '@/i18n/ui-strings'
import { exportFormatNames } from '@/lib/export-format'
import { selectDocument, useDocumentStore } from '@/store/document-store'
import { useExportDialogStore } from '@/store/modal-dialogs'
import { HtmlExportPanel } from './html-export-panel'
import { PdfExportPanel } from './pdf-export-panel'

/** Modal: everything the format the caller asked for decides, and nothing the other one does. */
export function ExportDialog() {
  const open = useExportDialogStore((s) => s.open)
  const hide = useExportDialogStore((s) => s.hide)
  // The format comes from the button that opened this dialog; there is nothing to switch here.
  const format = useExportDialogStore((s) => s.format)
  const document = useDocumentStore(selectDocument)

  if (!open) {
    return null
  }
  return (
    <ModalDialog label={t('export.dialog')} onClose={hide} className="w-96">
      <h2 className="text-sm font-semibold">
        {t('export.title', { format: exportFormatNames[format] })}
      </h2>
      {format === 'html' ? (
        <HtmlExportPanel document={document} onClose={hide} />
      ) : (
        <PdfExportPanel document={document} onClose={hide} />
      )}
    </ModalDialog>
  )
}
