/**
 * The formats the export dialog can write. File formats are product names, not translatable
 * strings, so their names live here rather than in the i18n resources.
 */
export type ExportFormat = 'html' | 'pdf'

export const exportFormatNames: Record<ExportFormat, string> = { html: 'HTML', pdf: 'PDF' }

export const defaultExportFormat: ExportFormat = 'html'
