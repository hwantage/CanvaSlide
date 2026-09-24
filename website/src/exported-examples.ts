import type { ExampleId } from '@shared/example-catalog'

/** Examples the home page offers as standalone HTML, generated at build time from the catalog. */
export const exportedExampleIds = [
  'flowchart',
  'erd',
  'slides'
] as const satisfies readonly ExampleId[]

export type ExportedExampleId = (typeof exportedExampleIds)[number]
