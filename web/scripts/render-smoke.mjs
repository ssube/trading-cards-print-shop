import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const output = resolve('node_modules/.cache/cards-render')
mkdirSync(output, { recursive: true })
await build({
  entryPoints: ['src/App.tsx', 'src/Card.tsx', 'src/FinishGallery.tsx', 'src/CollectionProgress.tsx', 'src/StarterWelcome.tsx'],
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
const { FinishGallery } = require(resolve(output, 'FinishGallery.js'))
const { CollectionProgress } = require(resolve(output, 'CollectionProgress.js'))
const { StarterWelcome } = require(resolve(output, 'StarterWelcome.js'))
const sample = {
  id: 'test-copy-12345678', design_id: 'starter-press-cat', owner_id: 1, creator: null,
  origin_id: null, type_id: 'monster', rule_ids: ['arrival', 'draw'],
  rule_text: ['When this enters play', 'Draw one card'], theme_id: 'storybook', finish_id: 'shimmer',
  name: 'Apprentice Press Cat', flavor: 'He insists every proof needs one more paw print.',
  art_path: '/assets/starter-press-cat.png', print_score: 91, condition: 97,
  centering_x: .2, centering_y: -.1, shift_c: .1, shift_m: -.2, shift_y: .1, shift_k: 0,
  color_effect: 'none', surface: .1, edge: .1, sleeved: 0, slab_grade: null, listed: 0,
  grade: 9, grade_name: 'Mint', estimated_grade: 'Mint', exact_grade_visible: true,
}
const appMarkup = renderToStaticMarkup(createElement(App))
const cardMarkup = renderToStaticMarkup(createElement(Card, { card: sample }))
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
  cards: { collected: 1, total: 4, percent: 25 },
} }))
const welcomeMarkup = renderToStaticMarkup(createElement(StarterWelcome, {
  mode: 'register', setMode: () => {}, decks: [{ id: 'pressroom', name: 'The Pressroom Parade', theme: 'Storybook workshop',
    description: 'A practice deck', accent: 'amber', featured: 'starter-press-cat',
    cards: [{ id: 'starter-press-cat', name: 'Apprentice Press Cat', flavor: 'One more paw print.', type_id: 'monster',
      rule_ids: ['arrival', 'draw'], theme_id: 'storybook', finish_id: 'standard', art_path: '/assets/starter-press-cat.png', copies: 2 },
    { id: 'starter-paper-sprite', name: 'Paper Sprite', flavor: 'A little ink.', type_id: 'spell',
      rule_ids: ['arrival', 'draw'], theme_id: 'storybook', finish_id: 'standard', art_path: '/assets/starter-paper-sprite.png', copies: 1 }] }],
  selectedDeck: 'pressroom', setSelectedDeck: () => {}, username: '', setUsername: () => {}, password: '', setPassword: () => {},
  message: '', busy: false, onSubmit: () => {},
}))
if (!appMarkup.includes('Warming the press') || !cardMarkup.includes('Apprentice Press Cat') || !cardMarkup.includes('art-window') ||
    !galleryMarkup.includes('Blank print stock') || !galleryMarkup.includes('Apprentice Press Cat') || !galleryMarkup.includes('Holo') ||
    !progressMarkup.includes('Unique cards') || !progressMarkup.includes('33%') || !progressMarkup.includes('1 / 4 in your box') ||
    !welcomeMarkup.includes('The Pressroom Parade') || !welcomeMarkup.includes('Three cards to begin with') || !welcomeMarkup.includes('COPY 3 OF 3')) {
  throw new Error('Render smoke test failed')
}
console.log('App shell, card, finish gallery, collection progress, and starter selection render successfully')
