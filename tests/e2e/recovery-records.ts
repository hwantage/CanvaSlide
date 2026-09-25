import type { Page } from '@playwright/test'

/** The stored recovery records, by the name of the document each one holds. */
export function storedDocuments(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('canvaslide-recovery', 2)
        const done = (value: string[]) => {
          open.result?.close()
          resolve(value)
        }
        // Never create the database from the test: the app owns its schema.
        open.onupgradeneeded = () => open.transaction?.abort()
        open.onerror = () => resolve([])
        open.onsuccess = () => {
          if (!open.result.objectStoreNames.contains('snapshots')) {
            done([])
            return
          }
          const all = open.result
            .transaction('snapshots', 'readonly')
            .objectStore('snapshots')
            .getAll()
          all.onerror = () => done([])
          all.onsuccess = () =>
            done(
              (all.result as unknown[]).flatMap((value) =>
                value && typeof value === 'object' && 'info' in value
                  ? [(value.info as { documentName: string }).documentName]
                  : []
              )
            )
        }
      })
  )
}
