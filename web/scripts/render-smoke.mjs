import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const output = resolve('node_modules/.cache/cards-render')
mkdirSync(output, { recursive: true })
await build({
  entryPoints: ['src/App.tsx', 'src/Card.tsx'],
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
if (!appMarkup.includes('Warming the press') || !cardMarkup.includes('Apprentice Press Cat') || !cardMarkup.includes('art-window')) {
  throw new Error('Render smoke test failed')
}
console.log('App shell and card render successfully')
