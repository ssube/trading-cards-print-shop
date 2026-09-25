import { discoveryIds, offlineCatalog, offlineDesigns, offlineStarterDecks } from './offline-data'
import { curatedDecks, offlineDeckList, validateCustomDeck } from './offline-decks'
import type { SavedCustomDeck } from './offline-decks'
import type { CardCopy, CollectionProgress, Part, State, User } from './types'

const STORAGE_KEY = 'cards-the-printing.offline-demo.v1'
const PROFILE: User = { id: 0, username: 'Demo Collector', is_admin: 0, csrf: '', starter_deck_id: null }
const gradeNames = ['Poor', 'Fair', 'Very Good', 'Very Good+', 'Excellent', 'Excellent+', 'Near Mint', 'Near Mint-Mint', 'Mint', 'Gem Mint']
const foilCost: Record<string, number> = { standard: 0, shimmer: 1, holo: 3 }
const names: Record<string, Record<string, string[]>> = {
  storybook: { land: ['The Library Between Moons', 'The Kittens’ Paper Mill'], monster: ['Sir Pounce of the Press', 'Moth of a Thousand Margins'], spell: ['An Unexpected Footnote', 'The Last Drop of Ink'] },
  celestial: { land: ['The Observatory of Small Stars', 'An Orchard of Forgotten Maps'], monster: ['The Starbound Typesetter', 'A Moth Among Moons'], spell: ['A Note to the Night', 'The Missing Constellation'] },
  absurd: { land: ['The Very Serious Garden', 'A Room for Impossible Hats'], monster: ['The Velvet Typesetter', 'The Polite Catastrophe'], spell: ['An Extremely Important Footnote', 'The Moon’s Appointment'] },
  botanical: { land: ['The Lanternroot Grove', 'A Garden of Second Chances'], monster: ['The Thistlekeeper', 'A Fox in the Ferns'], spell: ['Borrowed Spring', 'A Seed of Morning'] },
  clockwork: { land: ['The Brass Observatory', 'The Clockmaker’s Walk'], monster: ['The Winding Heron', 'The Copper Moth'], spell: ['One More Turn of the Key', 'A Minute Borrowed'] },
  maritime: { land: ['The Pearlwater Harbor', 'The Reef Beyond the Map'], monster: ['The Tideglass Keeper', 'A Lanternfish of Legend'], spell: ['A Door Made of Tide', 'The Sea’s Second Name'] },
}

type OfflineCard = CardCopy & { aged_at: string }
type Save = {
  version: 1; starter_deck_id: string; resources: Record<string, number>; learned: string[]
  library: OfflineCard[]; generation_day: string; generation_count: number; allowance_day: string | null
  jobs: Record<string, string>
  exports?: Record<string, { signature: string; cards: number; sheets: number }>
  custom_decks?: SavedCustomDeck[]; deck_claims?: string[]
}

function today() { return new Date().toISOString().slice(0, 10) }
function id() { return crypto.randomUUID() }
function fail(message: string): never { throw new Error(message) }
function storage() {
  try { return window.localStorage }
  catch { return fail('Browser storage is unavailable. Allow local storage to play the offline demo.') }
}
function load(): Save | null {
  let raw: string | null
  try { raw = storage().getItem(STORAGE_KEY) }
  catch { return fail('The offline collection could not be read from browser storage.') }
  if (!raw) return null
  try {
    const save = JSON.parse(raw) as Save
    if (save.version !== 1 || !Array.isArray(save.library) || !Array.isArray(save.learned) || !save.resources || !save.jobs || !offlineStarterDecks().some(deck => deck.id === save.starter_deck_id)) throw new Error('Invalid save')
    return save
  } catch { return fail('The offline collection could not be loaded. Its saved data may be damaged.') }
}
function persist(save: Save) {
  try { storage().setItem(STORAGE_KEY, JSON.stringify(save)) }
  catch { return fail('The offline collection could not be saved. Check available browser storage before continuing.') }
}
function copyOf(template: Pick<CardCopy, 'design_id' | 'type_id' | 'rule_ids' | 'theme_id' | 'finish_id' | 'border_id' | 'back_id' | 'name' | 'flavor' | 'art_path'>, score?: number, origin_id: string | null = null): OfflineCard {
  const quality = score ?? Math.max(1, Math.min(100, Math.round(100 - Math.random() * 25 - Math.max(0, template.rule_ids.length - 2) * 3)))
  const n = Math.max(1, Math.min(10, Math.ceil(quality / 10)))
  const parts = new Map(offlineCatalog.map(part => [part.id, part]))
  const shift = () => score === undefined ? Math.round((Math.random() - .5) * 100) / 100 : 0
  return {
    id: id(), design_id: template.design_id, owner_id: 0, creator: template.design_id.startsWith('offline-') ? PROFILE.username : null, origin_id,
    type_id: template.type_id, rule_ids: [...template.rule_ids], theme_id: template.theme_id, finish_id: template.finish_id,
    border_id: template.border_id, back_id: template.back_id, name: template.name, flavor: template.flavor, art_path: template.art_path,
    rule_names: template.rule_ids.map(rule => parts.get(rule)?.name || rule), rule_text: template.rule_ids.map(rule => parts.get(rule)?.description || rule),
    print_score: quality, condition: 100, centering_x: shift(), centering_y: shift(), shift_c: shift(), shift_m: shift(), shift_y: shift(), shift_k: shift(),
    color_effect: score === undefined ? ['none', 'none', 'none', 'fade', 'desaturated', 'hue-shift'][Math.floor(Math.random() * 6)] : 'none',
    surface: score === undefined ? Math.round(Math.random() * 70) / 100 : 0, edge: score === undefined ? Math.round(Math.random() * 50) / 100 : 0,
    sleeved: 0, slab_grade: null, listed: 0, grade: n, grade_name: gradeNames[n - 1],
    estimated_grade: n >= 9 ? 'Mint' : n >= 7 ? 'Near Mint' : n >= 4 ? 'Played' : 'Poor', exact_grade_visible: true, aged_at: today(),
  }
}
function updateGrade(card: OfflineCard) {
  card.grade = Math.max(1, Math.min(10, Math.ceil(Math.min(card.print_score, card.condition) / 10)))
  card.grade_name = gradeNames[card.grade - 1]
  card.estimated_grade = card.grade >= 9 ? 'Mint' : card.grade >= 7 ? 'Near Mint' : card.grade >= 4 ? 'Played' : 'Poor'
}
function age(save: Save) {
  const day = today()
  let changed = false
  for (const card of save.library) {
    const elapsed = Math.max(0, Math.floor((Date.parse(day) - Date.parse(card.aged_at || day)) / 86400000))
    if (!elapsed) continue
    if (!card.sleeved && card.slab_grade === null) card.condition = Math.max(0, card.condition - Math.min(elapsed, 30))
    card.aged_at = day
    updateGrade(card)
    changed = true
  }
  return changed
}
function balance(save: Save, changes: Record<string, number>) {
  for (const [kind, amount] of Object.entries(changes)) {
    if (!['paper', 'ink', 'foil', 'sleeve'].includes(kind) || !Number.isInteger(amount)) fail('Invalid resource')
    if ((save.resources[kind] || 0) + amount < 0) fail(`Not enough ${kind}`)
  }
  for (const [kind, amount] of Object.entries(changes)) save.resources[kind] = (save.resources[kind] || 0) + amount
}
function progress(collected: number, total: number) { return { collected, total, percent: total ? Math.round(100 * collected / total) : 0 } }
function collectionProgress(catalog: Part[], library: CardCopy[]): CollectionProgress {
  const result = {} as CollectionProgress
  for (const [label, kind] of [['rules', 'rule'], ['foils', 'finish'], ['borders', 'border'], ['backs', 'back']] as const) {
    const parts = catalog.filter(part => part.kind === kind)
    result[label] = progress(parts.filter(part => part.learned).length, parts.length)
  }
  result.cards = progress(new Set(library.map(card => card.design_id)).size, new Set([...offlineDesigns().map(design => design.id), ...library.map(card => card.design_id)]).size)
  return result
}
function state(save: Save): State {
  const catalog = offlineCatalog.map(part => ({ ...part, learned: Number(save.learned.includes(part.id)) }))
  return { resources: { ...save.resources }, library: [...save.library], catalog, commissions: [], npcs: [],
    collection_progress: collectionProgress(catalog, save.library), generation_count: save.generation_day === today() ? save.generation_count : 0,
    generation_limit: 5, allowance_claimed: save.allowance_day === today() }
}
function card(save: Save, copyId: string) { return save.library.find(copy => copy.id === copyId) || fail('Copy not found') }
function mutate<T>(work: (save: Save) => T): T {
  const original = load() || fail('Start the offline demo with a starter deck first.')
  const save = structuredClone(original)
  age(save)
  const result = work(save)
  persist(save)
  return result
}
function escapeXml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!) }
function generatedArt(designId: string, theme: string, name: string) {
  const palettes: Record<string, [string, string, string]> = {
    storybook: ['#1b3545', '#e7b979', '#8dbfb6'], celestial: ['#162139', '#bca2e8', '#f7d796'], absurd: ['#4d2740', '#f3b668', '#ed7896'],
    botanical: ['#213e31', '#e8c67e', '#91b98b'], clockwork: ['#263449', '#d6a567', '#90b7c0'], maritime: ['#123e52', '#9cdbdb', '#dfad8e'],
  }
  const [bg, glow, accent] = palettes[theme] || palettes.storybook
  let seed = [...designId].reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) >>> 0, 1)
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const stars = Array.from({ length: 45 }, () => `<circle cx="${Math.round(20 + random() * 360)}" cy="${Math.round(20 + random() * 480)}" r="${Math.round(1 + random() * 3)}" fill="${glow}" opacity=".7"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 400 560"><defs><radialGradient id="sky"><stop stop-color="${glow}"/><stop offset=".45" stop-color="${bg}"/><stop offset="1" stop-color="#0c1725"/></radialGradient></defs><rect width="400" height="560" fill="url(#sky)"/>${stars}<circle cx="205" cy="221" r="97" fill="${glow}" opacity=".85"/><path d="M125 306 Q200 80 275 306 Q248 280 235 315 Q200 273 165 315 Q145 285 125 306Z" fill="${bg}" stroke="${glow}" stroke-width="3"/><path d="M151 309 Q200 354 249 309 L281 476 Q203 513 119 476Z" fill="${bg}" stroke="${glow}" stroke-width="3"/><path d="M164 370 Q200 322 236 370 M153 416 Q200 375 247 416" fill="none" stroke="${accent}" stroke-width="6"/><path d="M30 35 H370 V525 H30Z" fill="none" stroke="${glow}" stroke-width="2" opacity=".7"/><text x="200" y="537" fill="#fff2d6" text-anchor="middle" font-family="serif" font-size="16">${escapeXml(name.slice(0, 28))}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
function print(save: Save, body: unknown, requestKey: string) {
  if (!requestKey) fail('An idempotency key is required')
  if (save.jobs[requestKey]) return { id: requestKey, status: 'complete', copy_id: save.jobs[requestKey] }
  const recipe = body as { type_id: string; rule_ids: string[]; theme_id: string; finish_id: string; border_id: string; back_id: string; hint?: string }
  if (!recipe || !Array.isArray(recipe.rule_ids) || recipe.rule_ids.length < 2 || recipe.rule_ids.length > 3 || new Set(recipe.rule_ids).size !== recipe.rule_ids.length) fail('Choose two or three distinct rules')
  if (typeof recipe.hint !== 'undefined' && (typeof recipe.hint !== 'string' || recipe.hint.length > 254)) fail('Hint must be 254 characters or fewer')
  const hint = (recipe.hint || '').trim().replace(/\s+/g, ' ')
  const parts = new Map(offlineCatalog.map(part => [part.id, part]))
  const choices: [string, string][] = [[recipe.type_id, 'type'], [recipe.theme_id, 'theme'], [recipe.finish_id, 'finish'], [recipe.border_id, 'border'], [recipe.back_id, 'back'], ...recipe.rule_ids.map(rule => [rule, 'rule'] as [string, string])]
  for (const [partId, kind] of choices) if (parts.get(partId)?.kind !== kind || !save.learned.includes(partId)) fail(`You have not learned ${partId}`)
  const slots = recipe.rule_ids.map(rule => parts.get(rule)!.slot)
  if (slots.filter(slot => slot === 'trigger').length !== 1 || slots.filter(slot => slot === 'effect').length !== 1 || slots.filter(slot => slot === 'condition').length > 1) fail('Choose one trigger, one effect, and at most one condition')
  if (recipe.rule_ids.reduce((power, rule) => power + parts.get(rule)!.power, 0) > 5) fail('The card exceeds its power limit')
  if (save.generation_day !== today()) { save.generation_day = today(); save.generation_count = 0 }
  if (save.generation_count >= 5) fail('Daily design limit reached')
  balance(save, { paper: -1, ink: -(1 + recipe.rule_ids.length), foil: -(foilCost[recipe.finish_id] || 0) })
  const designId = `offline-${id()}`
  const pool = names[recipe.theme_id]?.[recipe.type_id] || names.storybook.monster
  const name = hint ? hint.slice(0, 48) : pool[Math.floor(Math.random() * pool.length)]
  const printed = copyOf({ design_id: designId, ...recipe, name, flavor: 'Printed under a moon that insists it is the sun.', art_path: generatedArt(designId, recipe.theme_id, name) })
  save.library.unshift(printed)
  save.generation_count++
  save.jobs[requestKey] = printed.id
  const next = discoveryIds.find(designId => !save.library.some(copy => copy.design_id === designId))
  let discoveryName: string | undefined
  if (next) {
    const sample = offlineDesigns().find(design => design.id === next)!
    save.library.unshift(copyOf({ ...sample, design_id: sample.id }, 88))
    discoveryName = sample.name
  }
  balance(save, { ink: 2, foil: 1 })
  return { id: requestKey, status: 'complete', copy_id: printed.id, discovery_name: discoveryName }
}
function action(save: Save, copyId: string, operation: string) {
  const item = card(save, copyId)
  if (operation === 'study') {
    if (item.slab_grade !== null) fail('Break the slab before studying')
    if (item.condition <= 0) fail('This copy is too worn to study')
    const learned = [item.type_id, item.theme_id, item.finish_id, item.border_id, item.back_id, ...item.rule_ids].filter(part => !save.learned.includes(part))
    save.learned.push(...learned)
    if (!item.sleeved) item.condition = Math.max(0, item.condition - 2)
    updateGrade(item)
    return { learned }
  }
  if (operation === 'reprint') {
    if (item.condition <= 0) fail('This copy is too worn to reprint')
    if (item.slab_grade !== null) fail('Break the slab before reprinting')
    if (![item.type_id, item.theme_id, item.finish_id, item.border_id, item.back_id, ...item.rule_ids].every(part => save.learned.includes(part))) fail('Study this design before reprinting')
    balance(save, { paper: -1, ink: -(1 + item.rule_ids.length), foil: -(foilCost[item.finish_id] || 0) })
    const reprint = copyOf(item, undefined, item.id)
    save.library.unshift(reprint)
    if (!item.sleeved) item.condition = Math.max(0, item.condition - 1)
    updateGrade(item)
    return { copy_id: reprint.id }
  }
  if (operation === 'sleeve') {
    if (item.sleeved || item.slab_grade !== null) fail('Copy already protected')
    balance(save, { sleeve: -1 }); item.sleeved = 1
    return { ok: true }
  }
  if (operation === 'certify') {
    if (item.slab_grade !== null) fail('Already certified')
    balance(save, { ink: -1, sleeve: item.sleeved ? 0 : -1 })
    item.slab_grade = item.grade; item.sleeved = 0
    return { grade: item.slab_grade }
  }
  if (operation === 'crack') {
    if (item.slab_grade === null) fail('Copy is not slabbed')
    item.slab_grade = null
    return { ok: true }
  }
  return fail('This action is unavailable in the offline demo')
}

export function isOfflineDemo() {
  return (globalThis as typeof globalThis & { __OFFLINE_DEMO__?: boolean }).__OFFLINE_DEMO__ === true ||
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1')
}

export function resetOfflineDemo() {
  try { storage().removeItem(STORAGE_KEY) }
  catch { fail('The offline collection could not be cleared from browser storage.') }
}

export async function offlineApi<T>(path: string, method = 'GET', body?: unknown, extra?: Record<string, string>): Promise<T> {
  if (path === '/starter-decks' && method === 'GET') return offlineStarterDecks() as T
  if (path === '/auth/register' && method === 'POST') {
    if (load()) fail('An offline collection already exists')
    const deckId = (body as { starter_deck_id?: string })?.starter_deck_id
    const deck = offlineStarterDecks().find(item => item.id === deckId) || fail('Choose a starter deck to begin')
    const library = deck.cards.flatMap(item => Array.from({ length: item.copies }, () => copyOf({ ...item, design_id: item.id }, 88)))
    const learned = [...new Set(library.flatMap(item => [item.type_id, item.theme_id, item.finish_id, item.border_id, item.back_id, ...item.rule_ids]))]
    const save: Save = { version: 1, starter_deck_id: deck.id, resources: { paper: 8, ink: 8, sleeve: 1, foil: 0 }, learned, library, generation_day: today(), generation_count: 0, allowance_day: null, jobs: {} }
    persist(save)
    return { ...PROFILE, starter_deck_id: deck.id } as T
  }
  const save = load() || fail('Start the offline demo with a starter deck first.')
  if (path === '/auth/me' && method === 'GET') return { ...PROFILE, starter_deck_id: save.starter_deck_id } as T
  if (path === '/state' && method === 'GET') {
    if (age(save)) persist(save)
    return state(save) as T
  }
  if (path === '/market' && method === 'GET') return [] as T
  if (path === '/decks' && method === 'GET') return offlineDeckList(save.library, save.custom_decks || [], save.deck_claims || []) as T
  if (path === '/decks' && method === 'POST') return mutate(current => {
    const payload = body as { title?: unknown; theme?: unknown }
    const valid = validateCustomDeck(payload?.title, payload?.theme)
    current.custom_decks ||= []
    if (current.custom_decks.length >= 20) fail('You can keep at most 20 custom decks')
    const deck = { id: id(), ...valid, created_at: new Date().toISOString() }
    current.custom_decks.push(deck)
    return { id: deck.id }
  }) as T
  const deckMatch = path.match(/^\/decks\/([^/]+)(?:\/(claim))?$/)
  if (deckMatch && method === 'PUT' && !deckMatch[2]) return mutate(current => {
    const deck = current.custom_decks?.find(item => item.id === deckMatch[1]) || fail('Deck not found')
    const payload = body as { title?: unknown; theme?: unknown }
    Object.assign(deck, validateCustomDeck(payload?.title, payload?.theme))
    return { ok: true }
  }) as T
  if (deckMatch && method === 'DELETE' && !deckMatch[2]) return mutate(current => {
    const index = current.custom_decks?.findIndex(item => item.id === deckMatch[1]) ?? -1
    if (index < 0) fail('Deck not found')
    current.custom_decks!.splice(index, 1)
    return { ok: true }
  }) as T
  if (deckMatch && method === 'POST' && deckMatch[2] === 'claim') return mutate(current => {
    const definition = curatedDecks.find(item => item.id === deckMatch[1]) || fail('Curated deck not found')
    if (current.deck_claims?.includes(definition.id)) fail('Deck reward already claimed')
    const deck = offlineDeckList(current.library, current.custom_decks || [], current.deck_claims || []).find(item => item.id === definition.id)!
    if (deck.filled !== 3) fail('Complete this deck before claiming its reward')
    const reward = definition.reward
    let copyId: string | null = null
    if (reward.design_id) {
      const design = offlineDesigns().find(item => item.id === reward.design_id)!
      const minted = copyOf({ ...design, design_id: design.id }, reward.slab_grade ? 80 : 88)
      minted.slab_grade = reward.slab_grade || null
      current.library.unshift(minted)
      copyId = minted.id
    }
    balance(current, reward.resources)
    current.deck_claims ||= []
    current.deck_claims.push(definition.id)
    return { copy_id: copyId, resources: reward.resources }
  }) as T
  if (path.startsWith('/copies/') && method === 'GET') return card(save, path.split('/')[2]) as T
  if (path.startsWith('/jobs/') && method === 'GET') {
    const jobId = path.split('/')[2]
    if (!save.jobs[jobId]) fail('Job not found')
    return { id: jobId, status: 'complete', copy_id: save.jobs[jobId] } as T
  }
  if (path === '/prints' && method === 'POST') return mutate(current => print(current, body, extra?.['Idempotency-Key'] || '')) as T
  if (path === '/physical-prints' && method === 'POST') return mutate(current => {
    const key = extra?.['Idempotency-Key'] || ''
    if (key.length < 8 || key.length > 128) fail('An idempotency key is required')
    const items = (body as { items?: { copy_id: string; quantity: number }[] })?.items
    if (!Array.isArray(items) || !items.length) fail('Choose at least one card')
    const quantities = new Map<string, number>()
    for (const item of items) {
      if (typeof item?.copy_id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 90) fail('Invalid print quantity')
      quantities.set(item.copy_id, (quantities.get(item.copy_id) || 0) + item.quantity)
    }
    const count = [...quantities.values()].reduce((total, quantity) => total + quantity, 0)
    if (count > 90) fail('Choose at most 90 cards per export')
    const signature = JSON.stringify([...quantities].sort(([a], [b]) => a.localeCompare(b)))
    const previous = current.exports?.[key]
    if (previous) {
      if (previous.signature !== signature) fail('Print request key was used for different cards')
      return { cards: previous.cards, sheets: previous.sheets }
    }
    const sheets = Math.ceil(count / 9)
    for (const [copyId, quantity] of quantities) {
      const item = card(current, copyId)
      if (!item.sleeved && item.slab_grade === null && item.condition < quantity) fail('A selected copy does not have enough condition')
    }
    balance(current, { paper: -sheets })
    for (const [copyId, quantity] of quantities) {
      const item = card(current, copyId)
      if (!item.sleeved && item.slab_grade === null) item.condition -= quantity
      updateGrade(item)
    }
    current.exports ||= {}
    current.exports[key] = { signature, cards: count, sheets }
    return { cards: count, sheets }
  }) as T
  if (path === '/allowance/claim' && method === 'POST') return mutate(current => {
    if (current.allowance_day === today()) fail('Daily supplies already collected')
    current.allowance_day = today()
    balance(current, { paper: 10, ink: 10 })
    return { reward: { paper: 10, ink: 10 } }
  }) as T
  const actionMatch = path.match(/^\/copies\/([^/]+)\/(study|reprint|sleeve|certify|crack)$/)
  if (actionMatch && method === 'POST') return mutate(current => action(current, actionMatch[1], actionMatch[2])) as T
  return fail('This action is unavailable in the offline demo')
}
