import { expect, test } from '@playwright/test'
import type { CanvasDocument } from '../../src/shared/canvas/element-types'
import { primaryModifier } from './canvas-gestures'

for (const example of [
  { id: 'inside', name: /^INSIDE\./, frames: 13, photos: 9, animatedImage: undefined },
  { id: 'freefall', name: /^FREEFALL\./, frames: 10, photos: 8, animatedImage: 'image-12' }
]) {
  test(`${example.id} preserves photo previews through every frame and reload @webkit`, async ({
    page
  }, testInfo) => {
    test.setTimeout(120_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/?example=${example.id}`)
    await expect(page.getByRole('textbox', { name: 'Document name' })).toHaveValue(example.name, {
      timeout: 30_000
    })
    await page.keyboard.press(`${await primaryModifier(page)}+Enter`)
    await expect(page.getByTestId('presentation-counter')).toContainText(`1 / ${example.frames}`)
    const report = await page.evaluate(
      async ({ frameCount, animatedImage }) => {
        const module = async (part: string) =>
          import(
            performance
              .getEntriesByType('resource')
              .map((r) => r.name)
              .filter((name) => name.includes(part))
              .at(-1)!
          )
        const { useCameraStore } = await module('/src/store/camera-store.ts')
        const { useDocumentStore } = await module('/src/store/document-store.ts')
        const { usePresentationStore } = await module('/src/store/presentation-store.ts')
        const original = useDocumentStore.getState().document as CanvasDocument
        const photos = Object.values(original.elements)
          .filter((element) => {
            if (element.type !== 'image') {
              return false
            }
            const data = original.assets[element.assetId]!.data
            if (!data.startsWith('data:image/svg+xml')) {
              return false
            }
            const comma = data.indexOf(',')
            const svg = data.slice(0, comma).includes(';base64')
              ? atob(data.slice(comma + 1))
              : decodeURIComponent(data.slice(comma + 1))
            return /data:image\/(?:png|webp);/.test(svg) && !/<animate/.test(svg)
          })
          .map((element) => element.id)
        const seen = new Set<string>()
        const invalid = new Set<string>()
        const flights: { target: number; samples: number; worstIntervalMs: number }[] = []
        const settled = () =>
          new Promise<void>((resolve) => {
            const tick = () =>
              useCameraStore.getState().isAnimating() ? requestAnimationFrame(tick) : resolve()
            requestAnimationFrame(tick)
          })
        await settled()
        for (let index = 1; index < frameCount; index++) {
          const before = useCameraStore.getState().camera
          const intervals: number[] = []
          let previous: number | undefined
          usePresentationStore.getState().goTo(index)
          await new Promise<void>((resolve) => {
            const sample = (time: number) => {
              const state = useCameraStore.getState()
              if (state.camera !== before && state.animationActive) {
                if (previous !== undefined) {
                  intervals.push(time - previous)
                }
                previous = time
                for (const id of photos) {
                  const image = document.querySelector<HTMLImageElement>(
                    `img[data-element-id="${id}"]`
                  )
                  if (!image?.getAttribute('src') || image.style.visibility === 'hidden') {
                    continue
                  }
                  seen.add(id)
                  if (
                    !image.src.startsWith('blob:') ||
                    !image.complete ||
                    image.naturalWidth === 0 ||
                    Math.max(image.naturalWidth, image.naturalHeight) > 2048
                  ) {
                    invalid.add(id)
                  }
                }
              }
              if (state.isAnimating()) {
                requestAnimationFrame(sample)
              } else {
                resolve()
              }
            }
            requestAnimationFrame(sample)
          })
          flights.push({
            target: index + 1,
            samples: intervals.length,
            worstIntervalMs: Math.max(0, ...intervals)
          })
        }
        const animatedElement = animatedImage ? original.elements[animatedImage] : undefined
        return {
          photos,
          seen: [...seen],
          invalid: [...invalid],
          flights,
          unchanged: original === useDocumentStore.getState().document,
          finalCounter: document.querySelector('[data-testid="presentation-counter"]')?.textContent,
          animatedOriginal:
            !animatedImage ||
            (animatedElement?.type === 'image' &&
              document.querySelector<HTMLImageElement>(`img[data-element-id="${animatedImage}"]`)
                ?.src === original.assets[animatedElement.assetId]!.data)
        }
      },
      { frameCount: example.frames, animatedImage: example.animatedImage }
    )
    await testInfo.attach(`${example.id} photo frame flights`, {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json'
    })
    expect(report.photos).toHaveLength(example.photos)
    expect(report.seen.sort()).toEqual(report.photos.sort())
    expect(report.invalid).toEqual([])
    expect(report.flights).toHaveLength(example.frames - 1)
    expect(report.flights.every((flight) => flight.samples > 0)).toBe(true)
    expect(report.unchanged).toBe(true)
    expect(report.finalCounter).toContain(`${example.frames} / ${example.frames}`)
    expect(report.animatedOriginal).toBe(true)
    await page.keyboard.press('Escape')
    const name = page.getByRole('textbox', { name: 'Document name' })
    await name.fill('Local edits')
    await name.press('Tab')
    await page.reload()
    await expect(name).toHaveValue(example.name, { timeout: 30_000 })
    await page.keyboard.press(`${await primaryModifier(page)}+Enter`)
    expect(errors).toEqual([])
    await expect(page.getByTestId('presentation-counter')).toContainText(`1 / ${example.frames}`)
  })
}
