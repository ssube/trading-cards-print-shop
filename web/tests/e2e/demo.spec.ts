import { expect, test, type Page } from '@playwright/test'

test('a public card link opens in another browser without the offline collection', async ({ page, browser }) => {
  await startDemo(page)
  await navigate(page, 'Card Library')
  await page.getByRole('button', { name: /Inspect Apprentice Press Cat/ }).first().click()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const share = page.getByRole('link', { name: 'Copy public link' })
  await expect(share).toHaveAttribute('href', /#\/card\/snapshot\//)
  await share.click()
  await expect(page.getByRole('status')).toContainText('Public card link copied')
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toContain('#/card/snapshot/')
  const guest = await browser.newContext()
  const publicPage = await guest.newPage()
  await publicPage.goto(link)
  await expect(publicPage.getByRole('heading', { name: 'Apprentice Press Cat', level: 1 })).toBeVisible()
  await expect(publicPage.locator('.public-card-art .trading-card')).toBeVisible()
  await expect(publicPage.getByText('This is a view-only card.')).toBeVisible()
  await expect(publicPage.locator('.inspect-actions')).toHaveCount(0)
  await guest.close()
})

test('card links can be copied when the Clipboard API is unavailable', async ({ page }) => {
  await startDemo(page)
  await navigate(page, 'Card Library')
  await page.getByRole('button', { name: /Inspect Apprentice Press Cat/ }).first().click()
  const share = page.getByRole('link', { name: 'Copy public link' })
  const href = await share.getAttribute('href')
  expect(href).toContain('#/card/snapshot/')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }))
  await share.click()
  await expect(page.getByRole('status')).toContainText('Public card link copied')
  const copied = await page.evaluate(async () => { Reflect.deleteProperty(navigator, 'clipboard'); return navigator.clipboard.readText() })
  expect(copied).toContain(href!)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    document.execCommand = () => false
  })
  await share.click()
  await expect(page.getByRole('textbox', { name: 'Public card link' })).toHaveValue(copied)
})

test('a stale card API shows a useful error instead of a JSON parse exception', async ({ page }) => {
  await page.route('**/api/public/cards/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Old server</title>' }))
  await page.goto('/#/card/copy/example')
  await expect(page.getByRole('alert')).toContainText('The card service is unavailable')
})

async function startDemo(page: Page) {
  await page.goto('/?demo=1')
  await expect(page.getByRole('button', { name: 'Choose a deck to begin' })).toBeVisible()
  await page.getByRole('button', { name: /The Pressroom Parade/ }).click()
  await page.getByRole('button', { name: 'Begin offline demo' }).click()
  await expect(page.locator('.offline-banner')).toBeVisible()
}
async function navigate(page: Page, name: string) {
  await page.locator('.sidebar nav').getByRole('link', { name }).click()
}

test('pages and nested views survive reload, history, and direct links', async ({ page }) => {
  await startDemo(page)
  await navigate(page, 'Card Library')
  await expect(page).toHaveURL(/#\/library$/)
  await page.getByRole('group', { name: 'Filter cards by type' }).getByRole('button', { name: /SPELL/ }).click()
  await expect(page).toHaveURL(/#\/library\/type\/spell$/)
  await page.reload()
  await expect(page.locator('.boxed-card')).toHaveCount(1)
  await page.getByRole('button', { name: /Inspect Paper Sprite/ }).click()
  const cardUrl = page.url()
  await expect(page).toHaveURL(/#\/library\/card\//)
  await page.reload()
  await expect(page.locator('.inspect-info h2')).toContainText('Paper Sprite')
  await page.getByRole('button', { name: 'Close inspection' }).click()
  await page.goBack()
  await expect(page.locator('.inspect-info h2')).toContainText('Paper Sprite')
  await page.goto(cardUrl)
  await expect(page.locator('.inspect-info h2')).toContainText('Paper Sprite')
  await page.getByRole('button', { name: 'Close inspection' }).click()
  await navigate(page, 'Decks')
  await page.locator('.deck-box summary').filter({ hasText: 'The Starlit Atlas' }).click()
  await expect(page).toHaveURL(/#\/decks\/deck\/starlit$/)
  await page.reload()
  await expect(page.locator('.deck-box').filter({ hasText: 'The Starlit Atlas' })).toHaveAttribute('open', '')
  await navigate(page, 'Finish Gallery')
  await page.locator('.finish-option').nth(1).click()
  await expect(page).toHaveURL(/#\/finishes\/finish\//)
  await navigate(page, 'Games')
  await page.getByRole('button', { name: 'Play ↗' }).first().click()
  await expect(page).toHaveURL(/#\/games\/game\/fishing$/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'All games' })).toBeVisible()
  await page.locator('.resource-pill').filter({ hasText: 'paper' }).click()
  await expect(page).toHaveURL(/#\/progress\/resource\/paper$/)
  await expect(page.locator('#resource-paper')).toHaveClass(/focused/)
  await page.locator('.progress-part').first().click()
  await expect(page).toHaveURL(/#\/progress\/part\//)
})

test('finish preview fits at maximum zoom and keeps its controls usable', async ({ page }) => {
  await startDemo(page)
  await navigate(page, 'Finish Gallery')
  await page.locator('.finish-option').filter({ hasText: 'Full Holo' }).click()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 })
    await page.locator('.finish-showcase input[type=range]').fill('1.6')
    await page.waitForTimeout(200)
    const positions = await page.locator('.finish-showcase, .finish-showcase .card-body, .finish-showcase .card-controls').evaluateAll(elements => elements.map(element => {
      const { left, right, top, bottom } = element.getBoundingClientRect()
      return { left, right, top, bottom }
    }))
    const [showcase, card, controls] = positions
    expect(card.left).toBeGreaterThanOrEqual(showcase.left)
    expect(card.right).toBeLessThanOrEqual(showcase.right)
    expect(card.top).toBeGreaterThanOrEqual(showcase.top)
    expect(card.bottom).toBeLessThanOrEqual(showcase.bottom)
    expect(controls.top).toBeGreaterThan(card.bottom)
    expect(controls.bottom).toBeLessThan(showcase.bottom)
    await page.locator('.finish-showcase').getByRole('button', { name: 'Flip card' }).click()
    await expect(page.locator('.finish-showcase').getByRole('button', { name: 'Show front' })).toBeVisible()
    await page.locator('.finish-showcase').getByRole('button', { name: 'Show front' }).click()
  }
})

test('confetti flecks shift slightly with the light', async ({ page }) => {
  await startDemo(page)
  await navigate(page, 'Finish Gallery')
  await page.locator('.finish-option').filter({ hasText: 'Confetti' }).click()
  await page.locator('.finish-showcase').scrollIntoViewIfNeeded()
  const foil = page.locator('.finish-showcase .card-perspective')
  await expect(foil).toBeVisible()
  const box = await foil.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width * .8, box!.y + box!.height * .3)
  await expect(foil).toHaveCSS('--foil-dx', '3.6px')
  await expect(foil).toHaveCSS('--foil-dy', '-2.4px')
  await expect(page.locator('.finish-showcase .foil-shine')).toHaveCSS('background-image', /foil-confetti-near/)
})

test('sleeves and slabs tilt with their cards as one layer', async ({ page }) => {
  await startDemo(page)
  await page.evaluate(() => {
    const key = 'cards-the-printing.offline-demo.v1'
    const save = JSON.parse(localStorage.getItem(key)!)
    save.library[0].slab_grade = 8
    save.library[1].sleeved = 1
    localStorage.setItem(key, JSON.stringify(save))
  })
  await page.reload()
  await navigate(page, 'Card Library')
  await expect(page.locator('.boxed-card .card-body.slabbed')).toHaveCount(1)
  await expect(page.locator('.boxed-card .card-body.sleeved')).toHaveCount(1)
  await expect(page.locator('.boxed-card .card-frame.slabbed')).toHaveCount(0)
  await page.locator('.boxed-card .card-body.slabbed .card-perspective').click()
  const body = page.locator('.inspect-modal .card-body.slabbed')
  await body.hover({ position: { x: 60, y: 60 } })
  await expect(body).toHaveAttribute('style', /rotateY\([^0]/)
  await expect(body.locator('.slab-label')).toBeVisible()
  await expect(body.locator('.slab-base-marker')).toBeVisible()
})

test('starter choice opens a persistent offline workshop with online tabs disabled', async ({ page }) => {
  await startDemo(page)
  await expect(page.getByRole('heading', { name: /Make something remarkable/ })).toBeVisible()
  await expect(page.locator('.sidebar nav').getByRole('button', { name: /Commissions/ })).toBeDisabled()
  await expect(page.locator('.sidebar nav').getByRole('button', { name: /Trading Hall/ })).toBeDisabled()
  await expect(page.locator('.offline-banner')).toContainText('saved in this browser')
  await page.reload()
  await expect(page.getByRole('heading', { name: /Make something remarkable/ })).toBeVisible()
  await expect(page.locator('.offline-banner')).toContainText('Progress is not shared')
})

test('library filters and card inspection work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await startDemo(page)
  await navigate(page, 'Card Library')
  await expect(page.locator('.boxed-card')).toHaveCount(3)
  await page.getByRole('group', { name: 'Filter cards by type' }).getByRole('button', { name: /SPELL/ }).click()
  await expect(page.locator('.boxed-card')).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Spell cards' })).toBeVisible()
  await page.getByRole('button', { name: /Inspect Paper Sprite/ }).click()
  await expect(page.getByRole('button', { name: 'Close inspection' })).toBeVisible()
  await page.getByRole('button', { name: 'Close inspection' }).click()
  await expect(page.locator('.inspect-modal')).toHaveCount(0)
  await page.getByRole('group', { name: 'Filter cards by type' }).getByRole('button', { name: /ALL CARDS/ }).click()
  await expect(page.locator('.boxed-card')).toHaveCount(3)
})

test('studying a copy costs condition and stops when its parts are known', async ({ page }) => {
  await startDemo(page)
  await page.evaluate(() => {
    const key = 'cards-the-printing.offline-demo.v1'
    const save = JSON.parse(localStorage.getItem(key)!)
    save.learned = save.learned.filter((part: string) => part !== save.library[0].type_id)
    save.library[0].condition = 73
    localStorage.setItem(key, JSON.stringify(save))
  })
  await page.reload()
  await navigate(page, 'Card Library')
  await page.getByRole('button', { name: /Inspect Apprentice Press Cat/ }).first().click()
  await page.getByRole('button', { name: 'Study parts · −8 condition' }).click()
  await expect(page.locator('.inspect-info .detail-grid')).toContainText('65%')
  await expect(page.getByRole('button', { name: 'All parts learned' })).toBeDisabled()
})

test('grading shows its material cost and accepts an existing sleeve', async ({ page }) => {
  await startDemo(page)
  await page.evaluate(() => {
    const key = 'cards-the-printing.offline-demo.v1'
    const save = JSON.parse(localStorage.getItem(key)!)
    save.resources.ink = 2
    save.resources.sleeve = 0
    save.library[0].sleeved = 0
    localStorage.setItem(key, JSON.stringify(save))
  })
  await page.reload()
  await navigate(page, 'Card Library')
  await page.getByRole('button', { name: /Inspect Apprentice Press Cat/ }).first().click()
  await expect(page.getByRole('button', { name: 'Grade & slab' })).toBeDisabled()
  await expect(page.locator('.grade-cost-note')).toContainText('Need a sleeve to grade this copy')
  await page.evaluate(() => {
    const key = 'cards-the-printing.offline-demo.v1'
    const save = JSON.parse(localStorage.getItem(key)!)
    save.library[0].sleeved = 1
    localStorage.setItem(key, JSON.stringify(save))
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Grade & slab' })).toBeEnabled()
  await expect(page.locator('.grade-cost-note')).toContainText('already has a sleeve')
  await page.getByRole('button', { name: 'Grade & slab' }).click()
  await expect(page.getByRole('button', { name: 'Break slab' })).toBeVisible()
})

test('deck reward, custom deck, print preset, and progress work', async ({ page }) => {
  await startDemo(page)
  await navigate(page, 'Decks')
  const starter = page.locator('.deck-box').filter({ hasText: 'The Pressroom Parade' }).first()
  await expect(starter.getByRole('progressbar')).toHaveAttribute('value', '3')
  await starter.getByRole('button', { name: 'Claim reward' }).click()
  await expect(starter.getByRole('button', { name: 'Reward claimed' })).toBeDisabled()
  await page.getByRole('textbox', { name: 'Deck title' }).fill('Paper Friends')
  await page.getByRole('button', { name: 'Create deck' }).click()
  await expect(page.locator('.deck-box').filter({ hasText: 'Paper Friends' })).toBeVisible()
  await starter.getByRole('button', { name: 'Print this deck' }).click()
  await expect(page.getByRole('heading', { name: /Print your cards/ })).toBeVisible()
  await expect(page.locator('.physical-placement')).toHaveCount(3)
  await page.getByRole('checkbox', { name: 'Show simulated foil finish' }).uncheck()
  await page.getByRole('checkbox', { name: 'Show print defects and paper wear' }).uncheck()
  await page.getByRole('checkbox', { name: 'Include aligned card backs' }).check()
  await expect(page.locator('.physical-sheet')).toHaveCount(2)
  await navigate(page, 'Progress')
  await expect(page.getByRole('heading', { name: /Your collection, in progress/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Borders' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Card backs' })).toBeVisible()
})

test('the press accepts a hint and saves the printed card', async ({ page, browser }) => {
  await startDemo(page)
  await page.getByRole('textbox', { name: /Title or theme hint/ }).fill('A fox in a moonlit bookshop')
  await page.getByRole('button', { name: /Pull the lever & print/ }).click()
  await expect(page.getByRole('button', { name: 'Close inspection' })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.inspect-info h2')).toHaveText('A fox in a moonlit bookshop')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('link', { name: 'Copy public link' }).click()
  await expect(page.getByRole('status')).toContainText('Public card link copied')
  const guest = await browser.newContext()
  const publicPage = await guest.newPage()
  await publicPage.goto(await page.evaluate(() => navigator.clipboard.readText()))
  await expect(publicPage.getByRole('heading', { name: 'A fox in a moonlit bookshop', level: 1 })).toBeVisible()
  await expect.poll(() => publicPage.locator('.public-card-art img.art-base').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  await guest.close()
  await page.getByRole('button', { name: 'Close inspection' }).click()
  await navigate(page, 'Card Library')
  await expect(page.locator('.boxed-card')).toHaveCount(5)
  await page.reload()
  await navigate(page, 'Card Library')
  await expect(page.locator('.boxed-card')).toHaveCount(5)
})

test('finish gallery and games hub open', async ({ page }) => {
  await startDemo(page)
  await navigate(page, 'Finish Gallery')
  await expect(page.getByRole('heading', { name: /See it in a different light/ })).toBeVisible()
  await expect(page.locator('.finish-option').first()).toBeVisible()
  await expect(page.locator('.finish-option').filter({ hasText: 'Etched Silver' })).toContainText('3 FOIL')
  await expect(page.locator('.finish-option').filter({ hasText: 'Aurora' })).toContainText('3 FOIL')
  await expect(page.locator('.finish-option').filter({ hasText: 'Crashout' })).toContainText('3 FOIL')
  await navigate(page, 'Games')
  await expect(page.locator('.game-stub')).toHaveCount(4)
  await expect(page.getByRole('heading', { name: 'Feline Papermill' })).toBeVisible()
})


test('print sheet download charges paper and card condition once', async ({ page }) => {
  await startDemo(page)
  await navigate(page, 'Print Sheets')
  const choice = page.locator('.physical-card-choice').first()
  const cardName = await choice.locator('strong').textContent()
  await choice.getByRole('button', { name: `Add ${cardName}` }).click()
  await page.getByLabel('File format').selectOption('png')
  await expect(page.locator('.physical-placement')).toHaveCount(1)
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('cards-the-printing.offline-demo.v1')!))
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Create print files' }).click()
  expect((await download).suggestedFilename()).toBe('tcps-print-sheet.png')
  await expect(page.getByRole('status').filter({ hasText: 'Ready: 1 sheet downloaded' })).toBeVisible()
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('cards-the-printing.offline-demo.v1')!))
  expect(after.resources.paper).toBe(before.resources.paper - 1)
  expect(after.library[0].condition).toBe(before.library[0].condition - 1)
  await page.getByRole('button', { name: 'Download again' }).click()
  const unchanged = await page.evaluate(() => JSON.parse(localStorage.getItem('cards-the-printing.offline-demo.v1')!))
  expect(unchanged.resources.paper).toBe(after.resources.paper)
})

test('recorded centering and ink registration match inspection and print quality toggle', async ({ page }) => {
  await startDemo(page)
  await page.evaluate(() => {
    const key = 'cards-the-printing.offline-demo.v1'
    const save = JSON.parse(localStorage.getItem(key)!)
    Object.assign(save.library[0], {
      centering_x: -0.24, centering_y: 0.6,
      shift_c: 0.35, shift_m: 0.28, shift_y: 0.06, shift_k: -0.37,
      color_effect: 'none',
    })
    localStorage.setItem(key, JSON.stringify(save))
  })
  await page.reload()
  await navigate(page, 'Card Library')
  await page.getByRole('button', { name: /Inspect Apprentice Press Cat/ }).first().click()
  await expect(page.locator('.defect-note')).toContainText('centering -0.24x / +0.6y')
  const ink = await page.locator('.inspect-modal .trading-card').evaluate(card => {
    const offset = (selector: string) => new DOMMatrix(getComputedStyle(card.querySelector(selector)!).transform)
    return {
      faceX: offset('.card-ink').m41, faceY: offset('.card-ink').m42,
      cyanX: offset('.channel-c').m41, blackX: offset('.channel-k').m41,
      cyanOpacity: Number(getComputedStyle(card.querySelector('.channel-c')!).opacity),
      baseFilter: getComputedStyle(card.querySelector('.art-base')!).filter,
    }
  })
  expect(ink.faceX).toBeLessThan(0)
  expect(ink.faceY).toBeGreaterThan(0)
  expect(ink.cyanX).toBeGreaterThan(0)
  expect(ink.blackX).toBeLessThan(0)
  expect(ink.cyanOpacity).toBeGreaterThan(0)
  expect(ink.baseFilter).toBe('none')
  await page.getByRole('button', { name: 'Close inspection' }).click()
  await navigate(page, 'Print Sheets')
  await page.locator('.physical-card-choice').first().getByRole('button', { name: /Add Apprentice Press Cat/ }).click()
  const before = await page.locator('.physical-sheet .trading-card').evaluate(card => new DOMMatrix(getComputedStyle(card.querySelector('.card-ink')!).transform).m42)
  expect(before).toBeGreaterThan(0)
  await page.getByRole('checkbox', { name: 'Show print defects and paper wear' }).uncheck()
  const clean = await page.locator('.physical-sheet .trading-card').evaluate(card => ({
    faceX: new DOMMatrix(getComputedStyle(card.querySelector('.card-ink')!).transform).m41,
    faceY: new DOMMatrix(getComputedStyle(card.querySelector('.card-ink')!).transform).m42,
    cyan: getComputedStyle(card.querySelector('.channel-c')!).opacity,
    black: getComputedStyle(card.querySelector('.channel-k')!).opacity,
  }))
  expect(clean.faceX).toBe(0)
  expect(clean.faceY).toBe(0)
  expect(clean.cyan).toBe('0')
  expect(clean.black).toBe('0')
})
