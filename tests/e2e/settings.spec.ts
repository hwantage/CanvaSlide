import { expect, test, type Page } from '@playwright/test'

async function dragOnCanvas(page: Page, from: [number, number], to: [number, number]) {
  const box = await page.getByTestId('canvas-viewport').boundingBox()
  if (!box) {
    throw new Error('canvas not laid out')
  }
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 })
  await page.mouse.up()
}

test('settings dialog controls background, the default transition and the frame border', async ({
  page
}) => {
  await page.goto('/')
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 100], [400, 300])
  // Deselect: a selected frame always shows a solid highlight outline.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Default transition duration').fill('2500')
  await expect(dialog.getByTestId('transition-value')).toHaveText('2.5s')

  const background = page.getByTestId('canvas-background')
  await expect(background).toHaveAttribute('data-background', 'dots')
  await dialog.getByRole('radio', { name: 'Plain' }).click()
  await expect(background).toHaveAttribute('data-background', 'plain')
  await expect(background).toHaveCSS('background-image', 'none')
  await dialog.getByRole('radio', { name: 'Grid lines' }).click()
  await expect(background).toHaveAttribute('data-background', 'grid')

  const outline = page.getByTestId('frame-outline').first()
  await dialog.getByRole('radio', { name: 'Dashed' }).click()
  await expect(outline).toHaveCSS('border-top-style', 'dashed')
  await dialog.getByRole('radio', { name: 'Hidden' }).click()
  await expect(outline).toHaveCSS('border-top-width', '0px')

  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)
})

test('blocks canvas shortcuts while the settings dialog is open', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('r')
  await dragOnCanvas(page, [300, 300], [500, 420])
  const shapes = page.locator('[data-element-type="shape"]')
  await expect(shapes).toHaveCount(1)
  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Delete')
  await page.keyboard.press('Backspace')
  await expect(shapes).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(shapes).toHaveCount(1)
})

test('theme preference overrides the OS and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  // Why: Theme and Language both offer a System step, so the group has to be named.
  const theme = dialog.getByRole('radiogroup', { name: 'Theme preference' })
  await theme.getByRole('radio', { name: 'Light' }).click()
  await expect(theme.getByRole('radio', { name: 'Light' })).toBeChecked()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  await theme.getByRole('radio', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(24, 24, 27)')

  // A forced theme must stay put across restarts, and `system` must follow the OS again.
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(24, 24, 27)')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: /^Settings/ }).click()
  await theme.getByRole('radio', { name: 'System' }).click()
  await expect(theme.getByRole('radio', { name: 'System' })).toBeChecked()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html).toHaveAttribute('data-theme', 'dark')
})

test('dark mode darkens the canvas and grid but leaves the frame paper alone', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.keyboard.press('f')
  await dragOnCanvas(page, [100, 100], [400, 300])
  await page.keyboard.press('Escape')

  const background = page.getByTestId('canvas-background')
  const frame = page.locator('[data-element-type="frame"]')
  await expect(background).toHaveCSS('background-color', 'rgb(247, 247, 248)')
  await expect(background).toHaveCSS('background-image', /rgb\(212, 212, 216\)/)
  await expect(frame).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.6)')

  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('radio', { name: 'Dark' }).click()
  await dialog.getByRole('button', { name: 'Done' }).click()

  await expect(background).toHaveCSS('background-color', 'rgb(18, 18, 21)')
  await expect(background).toHaveCSS('background-image', /rgb\(47, 47, 53\)/)
  // Frames are document data: the sheet must keep reading as paper on the dark workspace.
  await expect(frame).toHaveCSS('background-color', 'rgb(252, 252, 252)')
})

test('language switches the whole interface and survives a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await dialog.getByRole('radio', { name: '한국어' }).click()
  // Not just the dialog: the panels behind it read the same strings.
  await expect(page.getByRole('dialog', { name: '설정' })).toBeVisible()
  const framesHeading = page.getByTestId('frames-pane').getByRole('heading', { name: '프레임' })
  await expect(framesHeading).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')

  await page.reload()
  await expect(framesHeading).toBeVisible()

  // System hands it back to the browser language, which this run pins to en-US.
  await page.getByRole('button', { name: /^설정/ }).click()
  await page
    .getByRole('dialog', { name: '설정' })
    .getByRole('radiogroup', { name: '언어 설정' })
    .getByRole('radio', { name: '시스템' })
    .click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
})

test('a default-transition drag collapses into one undo step', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Settings/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()

  // An edit before the drag: undoing past the drag has to reach this one, not the middle of it.
  await dialog.getByRole('radio', { name: 'Grid lines' }).click()
  const background = page.getByTestId('canvas-background')
  await expect(background).toHaveAttribute('data-background', 'grid')

  await expect(dialog.getByTestId('transition-value')).toHaveText('1.0s')
  const track = (await dialog.getByLabel('Default transition duration').boundingBox())!
  const y = track.y + track.height / 2
  await page.mouse.move(track.x + track.width / 2, y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(track.x + track.width / 2 + step * 4, y)
  }
  await page.mouse.up()
  await expect(dialog.getByTestId('transition-value')).not.toHaveText('1.0s')

  // Why: the dialog swallows canvas shortcuts, so the author closes it before undoing.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  const undo = async () => {
    await page.keyboard.press('Meta+z')
    await page.keyboard.press('Control+z')
  }
  await undo()
  await page.getByRole('button', { name: /^Settings/ }).click()
  await expect(dialog.getByTestId('transition-value')).toHaveText('1.0s')
  await expect(background).toHaveAttribute('data-background', 'grid')

  // The whole sweep is behind us after one step, so the next undo reaches the edit before it.
  await page.keyboard.press('Escape')
  await undo()
  await expect(background).toHaveAttribute('data-background', 'dots')
})
