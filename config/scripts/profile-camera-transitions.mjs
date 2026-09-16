import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, webkit } from '@playwright/test'

const [
  file,
  engine = 'webkit',
  passesArg = '2',
  output = '/tmp/camera-transitions.json',
  mode = 'slideshow'
] = process.argv.slice(2)
const passes = Number(passesArg)
const settleMs = Number(process.env.CANVASLIDE_PROFILE_SETTLE_MS || 300)
const deviceScaleFactor = Number(process.env.CANVASLIDE_PROFILE_DPR || 1)
if (
  !Number.isFinite(settleMs) ||
  settleMs < 0 ||
  !Number.isFinite(deviceScaleFactor) ||
  deviceScaleFactor <= 0
) {
  throw new Error('Profile settle time must be nonnegative and pixel density must be positive')
}
if (
  !file ||
  !['webkit', 'chromium'].includes(engine) ||
  !['slideshow', 'editor'].includes(mode) ||
  !Number.isInteger(passes) ||
  passes < 1
) {
  throw new Error(
    'Usage: node config/scripts/profile-camera-transitions.mjs FILE [webkit|chromium] [PASSES] [OUTPUT.json] [slideshow|editor]'
  )
}
const browser = await { chromium, webkit }[engine].launch()
const report = {
  engine,
  mode,
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor,
  settleMs,
  flights: [],
  errors: []
}
try {
  const page = await browser.newPage({
    locale: 'en-US',
    viewport: report.viewport,
    deviceScaleFactor
  })
  page.on('pageerror', (error) => report.errors.push(error.message))
  await page.goto(process.env.CANVASLIDE_PROFILE_URL || 'http://127.0.0.1:1420')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open / }).click()
  await (await chooser).setFiles(resolve(file))
  await page.getByTestId('world-layer').waitFor({ state: 'attached' })
  await page.locator('[data-element-type="frame"]').nth(1).waitFor({ state: 'attached' })
  const frames = await page.evaluate(async () => {
    const moduleUrl = (name) =>
      performance
        .getEntriesByType('resource')
        .map((resource) => resource.name)
        .filter((url) => url.includes(`/src/store/${name}.ts`))
        .at(-1)
    const camera = (await import(moduleUrl('camera-store'))).useCameraStore
    const document = (await import(moduleUrl('document-store'))).useDocumentStore
    const presentation = (await import(moduleUrl('presentation-store'))).usePresentationStore
    window.transitionProfile = {
      camera,
      document,
      presentation,
      original: document.getState().document
    }
    return Object.values(document.getState().document.elements)
      .filter((element) => element.type === 'frame')
      .sort((a, b) => a.order - b.order)
      .map((frame) => frame.name)
  })
  if (frames.length < 2) {
    throw new Error('The document must contain at least two frames')
  }
  await (mode === 'slideshow'
    ? page.getByRole('button', { name: 'Slide Show', exact: true }).click()
    : page.getByTestId('frame-row').first().locator('button').first().click())
  await page.waitForFunction(() => !window.transitionProfile.camera.getState().isAnimating())
  await page.waitForTimeout(settleMs)
  for (let pass = 0; pass < passes; pass++) {
    for (let index = 1; index < frames.length; index++) {
      const row = await page.evaluate(
        async ({ index, settleMs, mode }) => {
          const { camera, document, presentation } = window.transitionProfile
          const before = camera.getState().camera
          const samples = []
          const start = performance.now()
          let previous = start,
            ended
          if (mode === 'slideshow') {
            presentation.getState().goTo(index)
          } else {
            window.document
              .querySelectorAll('[data-testid="frame-row"]')
              [index].querySelector('button')
              .click()
          }
          await new Promise((resolve) => {
            const tick = (time) => {
              const current = camera.getState().camera
              const animating = camera.getState().isAnimating()
              samples.push({
                t: time - start,
                dt: Math.max(0, time - previous),
                ...current,
                animating
              })
              previous = time
              if (!animating) {
                ended ??= time
              }
              if (ended !== undefined && time - ended > settleMs) {
                resolve()
              } else {
                requestAnimationFrame(tick)
              }
            }
            requestAnimationFrame(tick)
          })
          const stats = (values) => {
            const sorted = values.toSorted((a, b) => a - b)
            return {
              count: values.length,
              meanMs: values.reduce((sum, value) => sum + value, 0) / (values.length || 1),
              p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
              maxMs: sorted.at(-1) ?? 0
            }
          }
          const first = samples.findIndex(
            (sample) =>
              sample.x !== before.x || sample.y !== before.y || sample.zoom !== before.zoom
          )
          // Include the interval ending at the target, even if that frame ended a long stall.
          const last = Math.min(
            samples.length - 1,
            samples.findLastIndex((sample) => sample.animating) + 1
          )
          const moving = first < 0 ? [] : samples.slice(first + 1, last + 1)
          return {
            configuredMs:
              mode === 'slideshow' ? document.getState().document.settings.transitionMs : undefined,
            startupMs: first < 0 ? null : samples[first].t,
            arrivalMs: samples[last]?.t ?? 0,
            motion: stats(moving.map((sample) => sample.dt)),
            wholeRequest: stats(samples.slice(0, last + 1).map((sample) => sample.dt)),
            stalls: moving.filter((sample) => sample.dt > 40),
            samples
          }
        },
        { index, settleMs, mode }
      )
      report.flights.push({ pass: pass + 1, from: frames[index - 1], to: frames[index], ...row })
      console.log(
        JSON.stringify({
          pass: pass + 1,
          frame: index + 1,
          startupMs: row.startupMs,
          ...row.motion
        })
      )
    }
    await (mode === 'slideshow'
      ? page.evaluate(() => window.transitionProfile.presentation.getState().goTo(0))
      : page.getByTestId('frame-row').first().locator('button').first().click())
    await page.waitForFunction(() => !window.transitionProfile.camera.getState().isAnimating())
    await page.waitForTimeout(settleMs)
  }
  report.sameDocument = await page.evaluate(
    () =>
      window.transitionProfile.document.getState().document === window.transitionProfile.original
  )
  await writeFile(resolve(output), JSON.stringify(report, null, 2))
  console.log(
    `Report: ${resolve(output)}; document unchanged: ${report.sameDocument}; errors: ${report.errors.length}`
  )
} finally {
  await browser.close()
}
