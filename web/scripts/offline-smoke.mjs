import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const output = resolve('node_modules/.cache/cards-offline')
mkdirSync(output, { recursive: true })
await build({ entryPoints: ['src/offline-game.ts'], outfile: resolve(output, 'offline-game.mjs'), bundle: true, platform: 'node', format: 'esm' })

const values = new Map()
let failWrites = false
let currentTime = '2026-09-25T12:00:00.000Z'
const NativeDate = Date
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [currentTime])) }
  static now() { return NativeDate.parse(currentTime) }
}
globalThis.document = { baseURI: 'https://example.github.io/cards-the-printing/' }
globalThis.window = {
  location: { search: '?demo=1' },
  localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (failWrites) throw new Error('Quota exceeded'); values.set(key, value) },
    removeItem: key => values.delete(key),
  },
}

const { offlineApi, isOfflineDemo, resetOfflineDemo } = await import(pathToFileURL(resolve(output, 'offline-game.mjs')).href)
const call = (path, method = 'GET', body, extra) => offlineApi(path, method, body, extra)
assert.equal(isOfflineDemo(), true)
const decks = await call('/starter-decks')
assert.equal(decks.length, 3)
for (const deck of decks) assert.equal(deck.cards.filter(card => card.finish_id !== 'standard').length, 1)
await assert.rejects(call('/auth/me'), /Start the offline demo/)
const user = await call('/auth/register', 'POST', { starter_deck_id: 'pressroom' })
assert.equal(user.username, 'Demo Collector')
let state = await call('/state')
assert.equal(state.library.length, 3)
assert.equal(state.resources.ink, 8)
const deckList = await call('/decks')
assert.equal(deckList.length, 10)
assert.equal(deckList.find(deck => deck.id === 'pressroom').filled, 3)
assert.equal(deckList.find(deck => deck.id === 'starlit').filled, 1)
await assert.rejects(call('/decks/starlit/claim', 'POST'), /Complete this deck/)
const custom = await call('/decks', 'POST', { title: '  Cat Parade  ', theme: 'storybook' })
assert.equal((await call('/decks')).find(deck => deck.id === custom.id).title, 'Cat Parade')
assert.equal((await call('/decks')).find(deck => deck.id === custom.id).filled, 2)
await call(`/decks/${custom.id}`, 'PUT', { title: 'Paper Friends', theme: 'celestial' })
assert.equal((await call('/decks')).find(deck => deck.id === custom.id).theme, 'celestial')
await assert.rejects(call('/decks', 'POST', { title: 'Bad', theme: 'unknown' }), /available theme/)
await call(`/decks/${custom.id}`, 'DELETE')
assert.equal((await call('/decks')).length, 10)
const deckReward = await call('/decks/pressroom/claim', 'POST')
assert.ok(deckReward.copy_id)
assert.equal((await call(`/copies/${deckReward.copy_id}`)).design_id, 'reward-press-cat-holo')
await assert.rejects(call('/decks/pressroom/claim', 'POST'), /already claimed/)
state = await call('/state')
assert.equal(state.resources.sleeve, 2)
assert.equal(state.library.length, 4)
const source = state.library[0]
const initialCondition = source.condition
const initialPaper = state.resources.paper
const charged = await call('/physical-prints', 'POST', { items: [{ copy_id: source.id, quantity: 2 }] }, { 'Idempotency-Key': 'physical-smoke-one' })
assert.deepEqual(charged, { cards: 2, sheets: 1 })
assert.deepEqual(await call('/physical-prints', 'POST', { items: [{ copy_id: source.id, quantity: 2 }] }, { 'Idempotency-Key': 'physical-smoke-one' }), charged)
state = await call('/state')
assert.equal(state.resources.paper, initialPaper - 1)
assert.equal(state.library.find(card => card.id === source.id).condition, initialCondition - 2)
await assert.rejects(call('/physical-prints', 'POST', { items: [{ copy_id: source.id, quantity: 1 }] }, { 'Idempotency-Key': 'physical-smoke-one' }), /different cards/)
assert.equal((await call('/market')).length, 0)
assert.equal(state.catalog.find(part => part.id === 'starlit').learned, 0)
await call('/allowance/claim', 'POST')
await assert.rejects(call('/allowance/claim', 'POST'), /already collected/)

const recipe = { type_id: 'monster', rule_ids: ['arrival', 'draw'], theme_id: 'storybook', finish_id: 'standard', border_id: 'classic', back_id: 'archive' }
await assert.rejects(call('/prints', 'POST', { ...recipe, hint: 'x'.repeat(255) }, { 'Idempotency-Key': 'hint-too-long' }), /Hint must be/)
const first = await call('/prints', 'POST', recipe, { 'Idempotency-Key': 'smoke-print-one' })
assert.equal((await call(`/jobs/${first.id}`)).copy_id, first.copy_id)
assert.match(first.discovery_name, /Map of Unfinished/)
const firstCopy = await call(`/copies/${first.copy_id}`)
assert.match(firstCopy.art_path, /^data:image\/svg\+xml,/)
state = await call('/state')
assert.equal(state.library.length, 6)
assert.equal(state.resources.foil, 1)
assert.equal((await call('/prints', 'POST', recipe, { 'Idempotency-Key': 'smoke-print-one' })).copy_id, first.copy_id)
assert.equal((await call('/state')).library.length, 6)

const sample = state.library.find(card => card.design_id === 'npc-starlit-map')
await call(`/copies/${sample.id}/study`, 'POST')
state = await call('/state')
assert.equal(state.catalog.find(part => part.id === 'starlit').learned, 1)
assert.equal(state.catalog.find(part => part.id === 'atlas').learned, 1)
const second = await call('/prints', 'POST', { ...recipe, theme_id: 'celestial', border_id: 'starlit', back_id: 'atlas', hint: 'A fox in a moonlit bookshop' }, { 'Idempotency-Key': 'smoke-print-two' })
const styled = await call(`/copies/${second.copy_id}`)
assert.equal(styled.name, 'A fox in a moonlit bookshop')
assert.equal(styled.border_id, 'starlit')
assert.equal(styled.back_id, 'atlas')

await call(`/copies/${first.copy_id}/sleeve`, 'POST')
await call(`/copies/${first.copy_id}/certify`, 'POST')
await assert.rejects(call(`/copies/${first.copy_id}/reprint`, 'POST'), /Break the slab/)
await call(`/copies/${first.copy_id}/crack`, 'POST')
const reprint = await call(`/copies/${first.copy_id}/reprint`, 'POST')
assert.equal((await call(`/copies/${reprint.copy_id}`)).origin_id, first.copy_id)
await assert.rejects(call('/npcs/fox-copy/trade', 'POST'), /unavailable/)

for (let number = 3; number <= 5; number++) await call('/prints', 'POST', recipe, { 'Idempotency-Key': `smoke-print-${number}` })
state = await call('/state')
assert.equal(state.generation_count, 5)
await assert.rejects(call('/prints', 'POST', recipe, { 'Idempotency-Key': 'smoke-print-six' }), /Daily design limit/)
assert.ok(state.collection_progress.cards.collected >= 8)
currentTime = '2026-09-26T12:00:00.000Z'
assert.equal((await call('/state')).generation_count, 0)
assert.equal((await call('/state')).allowance_claimed, false)
await call('/allowance/claim', 'POST')
assert.equal((await call('/state')).allowance_claimed, true)

// Existing v1 saves acquire optional minigame state without a reset.
const key = 'cards-the-printing.offline-demo.v1'
const mill = await call('/games/papermill')
assert.equal(mill.cats, 0)
const savedMill = JSON.parse(values.get(key))
savedMill.papermill.pulp = 200
values.set(key, JSON.stringify(savedMill))
for (let index = 0; index < 6; index++) await call('/games/papermill/hire', 'POST')
assert.equal((await call('/decks')).find(deck => deck.id === 'papermill').filled, 3)
await call('/decks/papermill/claim', 'POST')
currentTime = '2026-09-26T14:00:00.000Z'
const produced = await call('/games/papermill')
assert.equal(produced.paper_today, 4)
assert.equal(produced.ink_today, 4)
const balanceAfterMill = (await call('/state')).resources
await call('/games/papermill')
assert.deepEqual((await call('/state')).resources, balanceAfterMill)

const firstFishCast = await call('/games/fishing/cast', 'POST')
const fishSave = JSON.parse(values.get(key))
const cast = fishSave.fishing_casts.find(item => item.id === firstFishCast.pending.cast_id)
cast.prize_kind = 'card'; cast.prize_value = 'fish-lanternfin'
values.set(key, JSON.stringify(fishSave))
currentTime = new NativeDate(NativeDate.parse(cast.created_at) + cast.target_ms).toISOString()
const fishResult = await call('/games/fishing/reel', 'POST', { cast_id: cast.id })
assert.equal(fishResult.reward.card.design_id, 'fish-lanternfin')
assert.deepEqual(await call('/games/fishing/reel', 'POST', { cast_id: cast.id }), fishResult)

const practiceCard = (await call('/state')).library[0].id
await call('/tabletop/practice', 'POST', { action: 'place', copy_id: practiceCard })
await call('/tabletop/practice', 'POST', { action: 'flip' })
await call('/tabletop/practice', 'POST', { action: 'counter' })
assert.equal((await call('/tabletop/practice')).step, 3)
assert.equal((await call('/decks')).find(deck => deck.id === 'tabletop').filled, 3)
await call('/decks/tabletop/claim', 'POST')
await assert.rejects(call('/tabletop/rooms', 'POST', { copy_ids: [] }), /unavailable/)

const run = await call('/games/shooter/runs', 'POST')
currentTime = new NativeDate(NativeDate.parse(run.started_at) + 12000).toISOString()
for (let enemy_index = 0; enemy_index < 3; enemy_index++) {
  const stored = JSON.parse(values.get(key))
  stored.shooter_runs[0].last_kill_at = null
  values.set(key, JSON.stringify(stored))
  await call(`/games/shooter/runs/${run.id}/kills`, 'POST', { enemy_index })
}
const boss = await call(`/games/shooter/runs/${run.id}/boss`, 'POST')
assert.ok(boss.copy_id)
await assert.rejects(call(`/games/shooter/runs/${run.id}/boss`, 'POST'), /already claimed/)

const beforeFailedSave = (await call('/state')).resources.paper
failWrites = true
await assert.rejects(call('/allowance/claim', 'POST'), /already collected/)
await assert.rejects(call('/prints', 'POST', recipe, { 'Idempotency-Key': 'failed-save' }), /could not be saved/)
failWrites = false
assert.equal((await call('/state')).resources.paper, beforeFailedSave)
assert.equal((await call('/auth/me')).username, 'Demo Collector')
values.set('cards-the-printing.offline-demo.v1', '{broken')
await assert.rejects(call('/auth/me'), /could not be loaded/)
resetOfflineDemo()
assert.equal(values.size, 0)
console.log('Offline starter, printing, discovery, persistence, card actions, daily limits, and storage errors passed')
