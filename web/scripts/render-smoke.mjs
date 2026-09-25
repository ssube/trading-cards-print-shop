import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const output = resolve('node_modules/.cache/cards-render')
mkdirSync(output, { recursive: true })
await build({
  entryPoints: ['src/App.tsx', 'src/Card.tsx', 'src/CardLibrary.tsx', 'src/FinishGallery.tsx', 'src/CollectionProgress.tsx', 'src/ProgressPage.tsx', 'src/StarterWelcome.tsx', 'src/PhysicalPrint.tsx', 'src/GamesHub.tsx'],
  outdir: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
})
const require = createRequire(import.meta.url)
const { default: App } = require(resolve(output, 'App.js'))
const { Card } = require(resolve(output, 'Card.js'))
const { CardLibrary, filterLibraryCards } = require(resolve(output, 'CardLibrary.js'))
const { FinishGallery } = require(resolve(output, 'FinishGallery.js'))
const { CollectionProgress } = require(resolve(output, 'CollectionProgress.js'))
const { ProgressPage } = require(resolve(output, 'ProgressPage.js'))
const { StarterWelcome } = require(resolve(output, 'StarterWelcome.js'))
const { PhysicalPrint, layoutSheet } = require(resolve(output, 'PhysicalPrint.js'))
const { GamesHub } = require(resolve(output, 'GamesHub.js'))
const sample = {
  id: 'test-copy-12345678', design_id: 'starter-press-cat', owner_id: 1, creator: null,
  origin_id: null, type_id: 'monster', rule_ids: ['arrival', 'draw'],
  rule_names: ['On arrival', 'Draw a card'], rule_text: ['When this enters play', 'Draw one card'], theme_id: 'storybook', finish_id: 'shimmer', border_id: 'classic', back_id: 'archive',
  name: 'Apprentice Press Cat', flavor: 'He insists every proof needs one more paw print.',
  art_path: '/assets/starter-press-cat.png', print_score: 91, condition: 97,
  centering_x: .2, centering_y: -.1, shift_c: .1, shift_m: -.2, shift_y: .1, shift_k: 0,
  color_effect: 'none', surface: .1, edge: .1, sleeved: 0, slab_grade: null, listed: 0,
  grade: 9, grade_name: 'Mint', estimated_grade: 'Mint', exact_grade_visible: true,
}
const appMarkup = renderToStaticMarkup(createElement(App))
const gamesMarkup = renderToStaticMarkup(createElement(GamesHub))
const printMarkup = renderToStaticMarkup(createElement(PhysicalPrint, { cards: [sample], paper: 8, onCharged: async () => {} }))
for (const count of [1, 5, 7, 8, 9]) {
  const placements = layoutSheet(Array.from({ length: count }, (_, index) => ({ ...sample, id: `copy-${index}` })))
  assert.equal(placements.length, count)
  assert.equal(new Set(placements.map(place => place.width)).size, 1)
  assert.equal(new Set(placements.map(place => place.height)).size, 1)
  assert.ok(placements.every(place => place.x >= 0 && place.y >= 0 && place.x + place.width <= 400 && place.y + place.height <= 600))
}
assert.deepEqual([...new Set(layoutSheet(Array.from({ length: 7 }, (_, index) => ({ ...sample, id: `copy-${index}` }))).map(place => Math.round(place.y)))].map(y => layoutSheet(Array.from({ length: 7 }, (_, index) => ({ ...sample, id: `copy-${index}` }))).filter(place => Math.round(place.y) === y).length), [2, 3, 2])
const cardMarkup = renderToStaticMarkup(createElement(Card, { card: sample }))
const mixedCards = [sample, { ...sample, id: 'spell-copy', type_id: 'spell', name: 'Paper Sprite' }]
const libraryMarkup = renderToStaticMarkup(createElement(CardLibrary, {
  cards: mixedCards,
  cardProgress: { collected: 2, total: 4, percent: 50 },
  catalog: [{ id: 'land', kind: 'type', name: 'Land' }, { id: 'monster', kind: 'type', name: 'Monster' }, { id: 'spell', kind: 'type', name: 'Spell' }],
  onOpenCard: () => {}, onVisitPress: () => {},
}))
const completedLibraryMarkup = renderToStaticMarkup(createElement(CardLibrary, {
  cards: mixedCards, catalog: [], cardProgress: { collected: 4, total: 4, percent: 100 },
  onOpenCard: () => {}, onVisitPress: () => {},
}))
const galleryMarkup = renderToStaticMarkup(createElement(FinishGallery, {
  catalog: [
    { id: 'standard', kind: 'finish', name: 'Standard', description: 'Soft matte print.', learned: 1, cost_json: '{}', slot: '', power: 0 },
    { id: 'holo', kind: 'finish', name: 'Holo', description: 'Full spectrum foil.', learned: 0, cost_json: '{"foil":3}', slot: '', power: 0 },
  ],
  library: [{ ...sample, finish_id: 'standard' }],
  onUseFinish: () => {},
}))
const progressMarkup = renderToStaticMarkup(createElement(CollectionProgress, { progress: {
  rules: { collected: 2, total: 8, percent: 25 },
  foils: { collected: 1, total: 3, percent: 33 },
  borders: { collected: 1, total: 3, percent: 33 },
  backs: { collected: 1, total: 3, percent: 33 },
  cards: { collected: 1, total: 4, percent: 25 },
} }))
const pageMarkup = renderToStaticMarkup(createElement(ProgressPage, {
  state: {
    library: [sample, { ...sample, id: 'another-copy' }],
    catalog: [
      { id: 'monster', kind: 'type', name: 'Monster', description: 'A creature.', learned: 1, slot: '', cost_json: '{}', power: 0 },
      { id: 'land', kind: 'type', name: 'Land', description: 'A place.', learned: 0, slot: '', cost_json: '{}', power: 0 },
      { id: 'arrival', kind: 'rule', name: 'On arrival', description: 'When this enters play', learned: 1, slot: 'trigger', cost_json: '{}', power: 1 },
    ],
    collection_progress: { cards: { collected: 1, total: 4, percent: 25 } },
    generation_count: 1, generation_limit: 5,
    commissions: [], npcs: [], allowance_claimed: false,
  },
  onOpenCard: () => {}, onNavigate: () => {},
}))
const completedPageMarkup = renderToStaticMarkup(createElement(ProgressPage, {
  state: { library: mixedCards, catalog: [], collection_progress: { cards: { collected: 4, total: 4, percent: 100 } }, generation_count: 0, generation_limit: 5, commissions: [], npcs: [], allowance_claimed: false },
  onOpenCard: () => {}, onNavigate: () => {},
}))
const welcomeMarkup = renderToStaticMarkup(createElement(StarterWelcome, {
  mode: 'register', setMode: () => {}, decks: [{ id: 'pressroom', name: 'The Pressroom Parade', theme: 'Storybook workshop',
    description: 'A practice deck', accent: 'amber', featured: 'starter-press-cat',
    cards: [{ id: 'starter-press-cat', name: 'Apprentice Press Cat', flavor: 'One more paw print.', type_id: 'monster',
      rule_ids: ['arrival', 'draw'], theme_id: 'storybook', finish_id: 'standard', border_id: 'classic', back_id: 'archive', art_path: '/assets/starter-press-cat.png', copies: 2 },
    { id: 'starter-paper-sprite', name: 'Paper Sprite', flavor: 'A little ink.', type_id: 'spell',
      rule_ids: ['arrival', 'draw'], theme_id: 'storybook', finish_id: 'standard', border_id: 'classic', back_id: 'archive', art_path: '/assets/starter-paper-sprite.png', copies: 1 }] }],
  selectedDeck: 'pressroom', setSelectedDeck: () => {}, username: '', setUsername: () => {}, password: '', setPassword: () => {},
  message: '', busy: false, onSubmit: () => {},
}))
if (!gamesMarkup.includes('Every gacha game needs a fishing minigame') || !gamesMarkup.includes('Wait, you can play with these cards?') || !gamesMarkup.includes('It does run Doom') || (gamesMarkup.match(/COMING SOON/g) || []).length !== 4 || !printMarkup.includes('Show simulated foil finish') || !printMarkup.includes('Show print defects and paper wear') || !appMarkup.includes('Warming the press') || !cardMarkup.includes('Apprentice Press Cat') || !cardMarkup.includes('art-window') || !cardMarkup.includes('TC') || !cardMarkup.includes('PRINT SHOP') ||
    filterLibraryCards(mixedCards, 'spell').map(card => card.id).join() !== 'spell-copy' ||
    filterLibraryCards(mixedCards, 'land').length !== 0 || filterLibraryCards(mixedCards, 'all').length !== 2 ||
    !completedLibraryMarkup.includes('Your collection, <em>completed.</em>') || !libraryMarkup.includes('Filter cards by type') || !libraryMarkup.includes('LAND <b>0</b>') || !libraryMarkup.includes('SPELL <b>1</b>') ||
    !galleryMarkup.includes('Blank print stock') || !galleryMarkup.includes('Apprentice Press Cat') || !galleryMarkup.includes('Holo') ||
    !progressMarkup.includes('Unique cards') || !progressMarkup.includes('33%') || !progressMarkup.includes('1 / 4 in your box') ||
    !completedPageMarkup.includes('Your collection, <em>completed.</em>') || !pageMarkup.includes('Learned and still to find') || !pageMarkup.includes('TO FIND') || !pageMarkup.includes('2 copies') ||
    !welcomeMarkup.includes('Trading Cards:') || !welcomeMarkup.includes('Print Shop') || !welcomeMarkup.includes('The Pressroom Parade') || !welcomeMarkup.includes('Three cards to begin with') || !welcomeMarkup.includes('COPY 3 OF 3')) {
  throw new Error('Render smoke test failed')
}
console.log('App shell, card library filters, finish gallery, progress page, and starter selection render successfully')
