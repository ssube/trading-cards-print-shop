import { uniqueId } from './id'
import { printCost } from './print-cost'
import { discoveryIds, offlineCatalog, offlineDesigns, offlineStarterDecks, showcaseStarterIds } from './offline-data'
import { curatedDecks, offlineDeckList, validateCustomDeck } from './offline-decks'
import type { SavedCustomDeck } from './offline-decks'
import { actLocalMatch, createLocalMatch, tickLocalMatch, viewLocalMatch, type LocalMatch } from './tcg-offline'
import type { CardCopy, CollectionProgress, Part, State, User } from './types'

const STORAGE_KEY = 'cards-the-printing.offline-demo.v1'
const PROFILE: User = { id: 0, username: 'Demo Collector', is_admin: 0, csrf: '', starter_deck_id: null }
const gradeNames = ['Poor', 'Fair', 'Very Good', 'Very Good+', 'Excellent', 'Excellent+', 'Near Mint', 'Near Mint-Mint', 'Mint', 'Gem Mint']
const names: Record<string, Record<string, string[]>> = {
  storybook: { land: ['The Library Between Moons', 'The Kittens’ Paper Mill'], monster: ['Sir Pounce of the Press', 'Moth of a Thousand Margins'], spell: ['An Unexpected Footnote', 'The Last Drop of Ink'] },
  celestial: { land: ['The Observatory of Small Stars', 'An Orchard of Forgotten Maps'], monster: ['The Starbound Typesetter', 'A Moth Among Moons'], spell: ['A Note to the Night', 'The Missing Constellation'] },
  absurd: { land: ['The Very Serious Garden', 'A Room for Impossible Hats'], monster: ['The Velvet Typesetter', 'The Polite Catastrophe'], spell: ['An Extremely Important Footnote', 'The Moon’s Appointment'] },
  botanical: { land: ['The Lanternroot Grove', 'A Garden of Second Chances'], monster: ['The Thistlekeeper', 'A Fox in the Ferns'], spell: ['Borrowed Spring', 'A Seed of Morning'] },
  clockwork: { land: ['The Brass Observatory', 'The Clockmaker’s Walk'], monster: ['The Winding Heron', 'The Copper Moth'], spell: ['One More Turn of the Key', 'A Minute Borrowed'] },
  maritime: { land: ['The Pearlwater Harbor', 'The Reef Beyond the Map'], monster: ['The Tideglass Keeper', 'A Lanternfish of Legend'], spell: ['A Door Made of Tide', 'The Sea’s Second Name'] },
  cyber: { land: ['The Neon Junction', 'The Glasswire Terminal'], monster: ['The Signal Courier', 'The Circuit Moth'], spell: ['A Door in the Data', 'The Last Green Signal'] },
  grimdark: { land: ['The Ashen Bell Citadel', 'The Iron Chapel'], monster: ['The Ember Warden', 'The Last Watcher'], spell: ['A Bell Beneath the Ash', 'The Oath of Cinders'] },
  literal: { land: ['The Red Umbrella on the Road'], monster: ['The Umbrella Keeper'], spell: ['The Red Umbrella'] },
  wishmaster: { land: ['The Forest Where Time Stands Still'], monster: ['The Watchful Clock Tree'], spell: ['Stop the Clocks'] },
}

type OfflineCard = CardCopy & { aged_at: string }
type Save = {
  version: 1; starter_deck_id: string; resources: Record<string, number>; learned: string[]
  library: OfflineCard[]; generation_day: string; generation_count: number; allowance_day: string | null
  jobs: Record<string, string>
  exports?: Record<string, { signature: string; cards: number; sheets: number }>
  custom_decks?: SavedCustomDeck[]; deck_claims?: string[]
  papermill?: { pulp: number; cats: number; roller: boolean; ink_vat: boolean; seconds_credit: number; last_at: string; day: string; paper_today: number; ink_today: number; last_tap_at: string | null }
  fishing_casts?: { id: string; day: string; created_at: string; target_ms: number; tolerance_ms: number; prize_kind: 'card' | 'resource'; prize_value: string; resolved_at: string | null; success: boolean | null; reward: { resources?: Record<string, number>; card?: { design_id: string; copy_id: string } } }[]
  shooter_runs?: { id: string; day: string; boss_id: string; started_at: string; kill_mask: number; boss_claimed: boolean; last_kill_at: string | null }[]
  tabletop_practice?: { step: number; copy_id: string | null }
  starter_tcg_upgrade?: boolean
  showcase_upgrade?: boolean
  tcg_matches?: LocalMatch[]
  tcg_rewards?: { code: string; day: string; copy_id: string | null }[]
}

function today() { return new Date().toISOString().slice(0, 10) }
export function dailySleeveBonus(roll: number) { return roll < 5 ? 3 : roll < 20 ? 2 : roll < 45 ? 1 : 0 }
function id() { return uniqueId() }
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
    for (const card of save.library) {
      card.back_finish_id ??= card.back_id === 'mischief' ? 'shimmer' : null
      card.rule_ids = card.rule_ids.map(rule => rule === 'sleeved' ? 'dusk' : card.type_id === 'spell' && ['dusk', 'dawn', 'on_draw'].includes(rule) ? 'arrival' : rule)
      card.rule_names = card.rule_ids.map(rule => offlineCatalog.find(part => part.id === rule)?.name || rule)
      card.rule_text = card.rule_ids.map(rule => offlineCatalog.find(part => part.id === rule)?.description || rule)
    }
    if (!save.starter_tcg_upgrade) {
      const extras: Record<string, string[]> = { pressroom: ['starter-press-cat', 'starter-press-land', 'starter-recut'], starlit: ['npc-starlit-map', 'starter-atlas-owl', 'starter-recut'], velvet: ['npc-foil-fox-standard', 'starter-velvet-stage', 'starter-recut'] }
      const designs = new Map(offlineDesigns().map(design => [design.id, design]))
      for (const designId of extras[save.starter_deck_id] || []) {
        const design = designs.get(designId)!
        const copy = copyOf({ ...design, design_id: design.id }, 88, 'starter_tcg_upgrade')
        save.library.push(copy)
        for (const part of [copy.type_id, copy.theme_id, copy.finish_id, copy.border_id, copy.back_id, ...copy.rule_ids]) if (!save.learned.includes(part)) save.learned.push(part)
      }
      save.starter_tcg_upgrade = true
      persist(save)
    }
    if (!save.showcase_upgrade) {
      const designs = new Map(offlineDesigns().map(design => [design.id, design]))
      for (const designId of showcaseStarterIds) {
        if (save.library.some(card => card.design_id === designId)) continue
        const design = designs.get(designId)!
        save.library.push(copyOf({ ...design, design_id: design.id }, 88, 'demo_showcase'))
      }
      save.showcase_upgrade = true
      persist(save)
    }
    return save
  } catch { return fail('The offline collection could not be loaded. Its saved data may be damaged.') }
}
function persist(save: Save) {
  try { storage().setItem(STORAGE_KEY, JSON.stringify(save)) }
  catch { return fail('The offline collection could not be saved. Check available browser storage before continuing.') }
}
function bellOffset(scale: number, limit: number) {
  const value = (Array.from({ length: 6 }, () => Math.random()).reduce((sum, roll) => sum + roll, 0) - 3) * scale
  return Math.round(Math.max(-limit, Math.min(limit, value)) * 100) / 100
}
function printDefects() {
  const centering = Math.random() < .18 ? [bellOffset(.20, .45), bellOffset(.20, .45)] : [0, 0]
  const shifts = [0, 0, 0, 0]
  if (Math.random() < .16) {
    const first = Math.floor(Math.random() * 4)
    shifts[first] = bellOffset(.12, .28)
    if (Math.random() < .20) shifts[(first + 1 + Math.floor(Math.random() * 3)) % 4] = bellOffset(.12, .28)
  }
  return {
    centering_x: centering[0], centering_y: centering[1], shift_c: shifts[0], shift_m: shifts[1], shift_y: shifts[2], shift_k: shifts[3],
    color_effect: Math.random() < .05 ? ['fade', 'desaturated', 'hue-shift'][Math.floor(Math.random() * 3)] : 'none',
    surface: Math.random() < .12 ? Math.abs(bellOffset(.14, .3)) : 0,
    edge: Math.random() < .08 ? Math.abs(bellOffset(.10, .22)) : 0,
  }
}
function copyOf(template: Pick<CardCopy, 'design_id' | 'type_id' | 'rule_ids' | 'theme_id' | 'finish_id' | 'border_id' | 'back_id' | 'name' | 'flavor' | 'art_path'> & { back_finish_id?: string | null }, score?: number, origin_id: string | null = null): OfflineCard {
  const defects = score === undefined ? printDefects() : { centering_x: 0, centering_y: 0, shift_c: 0, shift_m: 0, shift_y: 0, shift_k: 0, color_effect: 'none', surface: 0, edge: 0 }
  const complexity = Math.max(0, template.rule_ids.length - 2) * 3
  const quality = score ?? Math.max(1, Math.min(100, Math.round(100 - complexity - 5 * Math.abs(defects.centering_x) - 5 * Math.abs(defects.centering_y)
    - 3 * [defects.shift_c, defects.shift_m, defects.shift_y, defects.shift_k].reduce((total, value) => total + Math.abs(value), 0)
    - 4 * Number(defects.color_effect !== 'none') - 9 * defects.surface - 7 * defects.edge)))
  const n = Math.max(1, Math.min(10, Math.ceil(quality / 10)))
  const parts = new Map(offlineCatalog.map(part => [part.id, part]))
  return {
    id: id(), design_id: template.design_id, owner_id: 0, creator: template.design_id.startsWith('offline-') ? PROFILE.username : null, origin_id,
    type_id: template.type_id, rule_ids: [...template.rule_ids], theme_id: template.theme_id, finish_id: template.finish_id,
    border_id: template.border_id, back_id: template.back_id, back_finish_id: template.back_finish_id ?? (template.back_id === 'mischief' ? 'shimmer' : null), name: template.name, flavor: template.flavor, art_path: template.art_path,
    rule_names: template.rule_ids.map(rule => parts.get(rule)?.name || rule), rule_text: template.rule_ids.map(rule => parts.get(rule)?.description || rule),
    print_score: quality, condition: 100, ...defects,
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
    botanical: ['#213e31', '#e8c67e', '#91b98b'], clockwork: ['#263449', '#d6a567', '#90b7c0'], maritime: ['#123e52', '#9cdbdb', '#dfad8e'], infernal: ['#3d1d28', '#f2a45e', '#d46652'],
    cyber: ['#0c1d2b', '#66e8bb', '#35aeca'], grimdark: ['#24242d', '#c18a62', '#8c4b42'], literal: ['#b9d0cf', '#e5e3d2', '#d24a42'], wishmaster: ['#302a50', '#edc27d', '#8fc5ab'],
  }
  const [bg, glow, accent] = palettes[theme] || palettes.storybook
  let seed = [...designId].reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) >>> 0, 1)
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const stars = Array.from({ length: 45 }, () => `<circle cx="${Math.round(20 + random() * 360)}" cy="${Math.round(20 + random() * 480)}" r="${Math.round(1 + random() * 3)}" fill="${glow}" opacity=".7"/>`).join('')
  const scenes: Record<string, string> = {
    cyber: `<path d="M0 430V175h64v95h59V100h73v168h58V128h80v144h66v288H0z" fill="#071c29" stroke="${glow}" stroke-width="4"/><path d="M51 256h31m60-91h33m-33 29h33m120-8h27m-27 30h27M76 447h245m-189 43h138" stroke="${accent}" stroke-width="8"/><circle cx="200" cy="324" r="78" fill="#0d3744" stroke="${glow}" stroke-width="9"/><path d="M160 324h80m-40-40v80" stroke="${glow}" stroke-width="8"/>`,
    grimdark: `<circle cx="279" cy="168" r="94" fill="${accent}" opacity=".4"/><path d="M0 498l62-68V270l37-31 39 31v116l27-28V180l35-55 36 55v178l27 27V265l34-35 36 35v163l67 70v62H0z" fill="#34343b" stroke="${glow}" stroke-width="5"/><path d="M172 321q0-70 28-70t28 70v54h-56z" fill="#121720"/><path d="M181 324q0-43 19-43t19 43l8 17h-54z" fill="${glow}"/>`,
    literal: `<path d="M0 466q100-30 200 0t200 0v94H0z" fill="#91aaa5"/><path d="M76 250q34-110 124-116 92 6 124 116-31-21-62 0-32-19-62 0-32-19-62 0-31-21-62 0z" fill="${accent}" stroke="#8d3e3b" stroke-width="8"/><path d="M200 136v270q0 42 29 42 27 0 27-26" fill="none" stroke="#66514b" stroke-width="12"/><circle cx="144" cy="329" r="20" fill="#ecceb1"/><path d="M126 435l7-85h26l9 85" fill="#4e6978" stroke="#355663" stroke-width="5"/>`,
    wishmaster: `<path d="M0 471q100-46 200 0t200 0v89H0z" fill="#2a4545"/><path d="M78 560V275m245 285V265M200 560V210" stroke="#5b4143" stroke-width="26"/><circle cx="200" cy="219" r="79" fill="${glow}" stroke="#795b55" stroke-width="9"/><circle cx="78" cy="265" r="51" fill="${glow}" stroke="#795b55" stroke-width="7"/><circle cx="323" cy="260" r="59" fill="${glow}" stroke="#795b55" stroke-width="7"/><path d="M200 220l28-25m-28 25v-45M78 265l-20-19m20 19v-27m245 22l24-25m-24 25v-29" stroke="#614c46" stroke-width="7" stroke-linecap="round"/>`,
  }
  if (scenes[theme]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 400 560"><defs><radialGradient id="sky"><stop stop-color="${glow}"/><stop offset=".55" stop-color="${bg}"/><stop offset="1" stop-color="#111a25"/></radialGradient></defs><rect width="400" height="560" fill="url(#sky)"/>${stars}${scenes[theme]}<text x="200" y="536" fill="#fff2d6" text-anchor="middle" font-family="serif" font-size="16">${escapeXml(name.slice(0, 28))}</text></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 400 560"><defs><radialGradient id="sky"><stop stop-color="${glow}"/><stop offset=".45" stop-color="${bg}"/><stop offset="1" stop-color="#0c1725"/></radialGradient></defs><rect width="400" height="560" fill="url(#sky)"/>${stars}<circle cx="205" cy="221" r="97" fill="${glow}" opacity=".85"/><path d="M125 306 Q200 80 275 306 Q248 280 235 315 Q200 273 165 315 Q145 285 125 306Z" fill="${bg}" stroke="${glow}" stroke-width="3"/><path d="M151 309 Q200 354 249 309 L281 476 Q203 513 119 476Z" fill="${bg}" stroke="${glow}" stroke-width="3"/><path d="M164 370 Q200 322 236 370 M153 416 Q200 375 247 416" fill="none" stroke="${accent}" stroke-width="6"/><path d="M30 35 H370 V525 H30Z" fill="none" stroke="${glow}" stroke-width="2" opacity=".7"/><text x="200" y="537" fill="#fff2d6" text-anchor="middle" font-family="serif" font-size="16">${escapeXml(name.slice(0, 28))}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
function print(save: Save, body: unknown, requestKey: string) {
  if (!requestKey) fail('An idempotency key is required')
  if (save.jobs[requestKey]) return { id: requestKey, status: 'complete', copy_id: save.jobs[requestKey] }
  const recipe = body as { type_id: string; rule_ids: string[]; theme_id: string; finish_id: string; border_id: string; back_id: string; foil_back?: boolean; hint?: string }
  if (!recipe || !Array.isArray(recipe.rule_ids) || recipe.rule_ids.length < 2 || recipe.rule_ids.length > 3 || new Set(recipe.rule_ids).size !== recipe.rule_ids.length) fail('Choose two or three distinct rules')
  if (typeof recipe.hint !== 'undefined' && (typeof recipe.hint !== 'string' || recipe.hint.length > 254)) fail('Hint must be 254 characters or fewer')
  if (recipe.hint?.trim()) fail('Title hints are available in the online workshop')
  if (recipe.foil_back !== undefined && typeof recipe.foil_back !== 'boolean') fail('Invalid back foil choice')
  if (recipe.foil_back && (recipe.back_id === 'mischief' || recipe.finish_id === 'standard')) fail('Back foil requires a nonstandard front finish and a non-Fox back')
  const parts = new Map(offlineCatalog.map(part => [part.id, part]))
  const choices: [string, string][] = [[recipe.type_id, 'type'], [recipe.theme_id, 'theme'], [recipe.finish_id, 'finish'], [recipe.border_id, 'border'], [recipe.back_id, 'back'], ...recipe.rule_ids.map(rule => [rule, 'rule'] as [string, string])]
  for (const [partId, kind] of choices) if (parts.get(partId)?.kind !== kind || !save.learned.includes(partId)) fail(`You have not learned ${partId}`)
  const slots = recipe.rule_ids.map(rule => parts.get(rule)!.slot)
  if (slots.filter(slot => slot === 'trigger').length !== 1 || slots.filter(slot => slot === 'effect').length !== 1 || slots.filter(slot => slot === 'condition').length > 1) fail('Choose one trigger, one effect, and at most one condition')
  if (recipe.type_id === 'spell' && !recipe.rule_ids.includes('arrival')) fail('Spells use the On arrival trigger')
  if (recipe.rule_ids.reduce((power, rule) => power + parts.get(rule)!.power, 0) > 5) fail('The card exceeds its power limit')
  if (save.generation_day !== today()) { save.generation_day = today(); save.generation_count = 0 }
  if (save.generation_count >= 5) fail('Daily design limit reached')
  const cost = printCost(offlineCatalog, recipe.rule_ids.length, recipe.finish_id, recipe.border_id, recipe.back_id, !!recipe.foil_back)
  balance(save, Object.fromEntries(Object.entries(cost).map(([kind, amount]) => [kind, -amount])))
  const designId = `offline-${id()}`
  const pool = names[recipe.theme_id]?.[recipe.type_id] || names.storybook.monster
  const name = pool[Math.floor(Math.random() * pool.length)]
  const printed = copyOf({ design_id: designId, ...recipe, back_finish_id: recipe.back_id === 'mischief' ? 'shimmer' : recipe.foil_back ? recipe.finish_id : null, name, flavor: 'Printed under a moon that insists it is the sun.', art_path: generatedArt(designId, recipe.theme_id, name) })
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
    const learned = [...new Set([item.type_id, item.theme_id, item.finish_id, item.border_id, item.back_id, ...item.rule_ids])].filter(part => !save.learned.includes(part))
    if (!learned.length) fail('You have already learned everything on this card')
    save.learned.push(...learned)
    item.condition = Math.max(0, item.condition - Math.ceil(item.condition / 10))
    updateGrade(item)
    return { learned }
  }
  if (operation === 'reprint') {
    if (item.condition <= 0) fail('This copy is too worn to reprint')
    if (item.slab_grade !== null) fail('Break the slab before reprinting')
    if (![item.type_id, item.theme_id, item.finish_id, item.border_id, item.back_id, ...item.rule_ids].every(part => save.learned.includes(part))) fail('Study this design before reprinting')
    const cost = printCost(offlineCatalog, item.rule_ids.length, item.finish_id, item.border_id, item.back_id, !!item.back_finish_id && item.back_id !== 'mischief')
    balance(save, Object.fromEntries(Object.entries(cost).map(([kind, amount]) => [kind, -amount])))
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

const practiceRewards = [
  { action: 'place', design_id: 'tabletop-opening-hand' },
  { action: 'attack', design_id: 'tabletop-counter-keeper' },
  { action: 'score', design_id: 'tabletop-playmaker' },
]
function practiceStatus(save: Save) {
  const practice = save.tabletop_practice || { step: 0, copy_id: null }
  return { step: practice.step, completed: practiceRewards.slice(0, practice.step).map(item => item.action),
    next_action: practiceRewards[practice.step]?.action || null, copy_id: practice.copy_id }
}
function practiceAction(save: Save, payload: unknown) {
  const current = practiceStatus(save)
  if (current.step >= 3) fail('Practice is complete')
  const request = payload as { action?: string; copy_id?: string }
  const expected = practiceRewards[current.step]
  if (request?.action !== expected.action) fail(`Try ${expected.action} next`)
  if (current.step === 0) {
    if (!request.copy_id || !save.library.some(card => card.id === request.copy_id && !card.listed)) fail('Choose a card from your box')
    save.tabletop_practice = { step: 0, copy_id: request.copy_id }
  }
  if (!save.tabletop_practice?.copy_id) fail('Place a card first')
  save.tabletop_practice.step += 1
  const design = offlineDesigns().find(item => item.id === expected.design_id) || fail('Practice card not found')
  const copy = copyOf({ ...design, design_id: design.id }, 86, `tabletop-practice:${expected.action}`)
  save.library.unshift(copy)
  return { practice: practiceStatus(save), reward_copy_id: copy.id, reward_design_id: design.id }
}

const shooterBosses = [
  { design_id: 'demon-cinderlord', name: 'Cinderlord of the Press' },
  { design_id: 'demon-ashwarden', name: "Ashwarden's Gate" },
  { design_id: 'demon-pressfiend', name: "The Pressfiend's Bargain" },
]
function shooterStatus(save: Save) {
  const runs = (save.shooter_runs || []).filter(run => run.day === today())
  const kills = runs.reduce((sum, run) => sum + [0, 1, 2].filter(i => Boolean(run.kill_mask & (1 << i))).length, 0)
  const active = [...runs].reverse().find(run => !run.boss_claimed) || null
  return { day: today(), runs_used: runs.length, run_limit: 3, resources_earned: Math.min(kills, 6), resource_limit: 6,
    boss_card_claimed: runs.some(run => run.boss_claimed), active_run: active, bosses: shooterBosses }
}
function shooterStart(save: Save) {
  save.shooter_runs ||= []
  const count = save.shooter_runs.filter(run => run.day === today()).length
  if (count >= 3) fail('All three runs have been used today')
  const ordinal = Math.floor(Date.parse(`${today()}T00:00:00Z`) / 86400000) + 719163
  const run = { id: id(), day: today(), boss_id: shooterBosses[(ordinal + count) % 3].design_id, started_at: new Date().toISOString(), kill_mask: 0, boss_claimed: false, last_kill_at: null }
  save.shooter_runs.push(run)
  save.shooter_runs = save.shooter_runs.filter(item => item.day === today())
  return run
}
function shooterRun(save: Save, runId: string) {
  const run = save.shooter_runs?.find(item => item.id === runId) || fail('Run not found')
  if (run.day !== today()) fail('This run has expired')
  return run
}
function shooterKill(save: Save, runId: string, index: unknown) {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 2) fail('Invalid enemy')
  const run = shooterRun(save, runId)
  if (run.boss_claimed || run.kill_mask & (1 << index)) fail('Enemy reward already claimed')
  if ((Date.now() - Date.parse(run.started_at)) / 1000 < (index + 1) * 2) fail('The enemy is still in the maze')
  if (run.last_kill_at && Date.now() - Date.parse(run.last_kill_at) < 1000) fail('Give the next enemy a moment')
  run.kill_mask |= 1 << index; run.last_kill_at = new Date().toISOString()
  const earned = (save.shooter_runs || []).filter(item => item.day === today()).reduce((sum, item) => sum + [0, 1, 2].filter(i => Boolean(item.kill_mask & (1 << i))).length, 0)
  const resource = earned <= 6 ? (index + (parseInt(runId.slice(0, 2), 16) % 2)) % 2 === 0 ? 'paper' : 'ink' : null
  if (resource) balance(save, { [resource]: 1 })
  return { enemy_index: index, resource, status: shooterStatus(save) }
}
function shooterBoss(save: Save, runId: string) {
  const run = shooterRun(save, runId)
  if (run.boss_claimed) fail('Boss reward already claimed')
  if (run.kill_mask !== 7) fail('Defeat the three guards first')
  if (Date.now() - Date.parse(run.started_at) < 12000) fail('The boss is still preparing')
  const previouslyAwarded = (save.shooter_runs || []).some(item => item.day === today() && item.boss_claimed)
  let copyId: string | null = null
  if (!previouslyAwarded) {
    const design = offlineDesigns().find(item => item.id === run.boss_id) || fail('Boss card not found')
    const copy = copyOf({ ...design, design_id: design.id }, 85)
    save.library.unshift(copy); copyId = copy.id
  }
  run.boss_claimed = true
  return { boss_id: run.boss_id, copy_id: copyId, status: shooterStatus(save) }
}

function fishingState(save: Save) {
  save.fishing_casts ||= []
  const casts = save.fishing_casts.filter(item => item.day === today())
  const pending = casts.find(item => item.resolved_at === null)
  const elapsed = pending ? Date.now() - Date.parse(pending.created_at) : 0
  if (pending && elapsed >= 30000) { pending.resolved_at = new Date().toISOString(); pending.success = false; pending.reward = {} }
  return { day: today(), used: casts.length, limit: 5, catches: casts.filter(item => item.success).length,
    pending: pending && pending.resolved_at === null ? { cast_id: pending.id, target_ms: pending.target_ms, tolerance_ms: pending.tolerance_ms, elapsed_ms: elapsed } : null }
}
function fishingCast(save: Save) {
  const current = fishingState(save)
  if (current.pending) return current
  if (current.used >= 5) fail('All five casts are spent for today')
  const fish = ['fish-lanternfin', 'fish-inkscale', 'fish-moonkoi']
  const resources = ['paper', 'ink', 'paper', 'ink', 'paper', 'ink', 'foil']
  const cardPrize = Math.random() < .1
  save.fishing_casts!.push({ id: id(), day: today(), created_at: new Date().toISOString(), target_ms: 1400 + Math.floor(Math.random() * 1101), tolerance_ms: 375,
    prize_kind: cardPrize ? 'card' : 'resource', prize_value: cardPrize ? fish[Math.floor(Math.random() * fish.length)] : resources[Math.floor(Math.random() * resources.length)],
    resolved_at: null, success: null, reward: {} })
  save.fishing_casts = save.fishing_casts!.filter(item => item.day === today())
  return fishingState(save)
}
function fishingReel(save: Save, castId: unknown) {
  if (typeof castId !== 'string' || castId.length > 64) fail('Invalid cast')
  const cast = save.fishing_casts?.find(item => item.id === castId) || fail('Cast not found')
  if (cast.resolved_at !== null) return { cast_id: cast.id, success: Boolean(cast.success), reward: cast.reward }
  const elapsed = Date.now() - Date.parse(cast.created_at)
  const success = Math.abs(elapsed - cast.target_ms) <= cast.tolerance_ms && elapsed < 30000
  cast.success = success; cast.resolved_at = new Date().toISOString()
  if (success && cast.prize_kind === 'card') {
    const design = offlineDesigns().find(item => item.id === cast.prize_value) || fail('Fish card not found')
    const copy = copyOf({ ...design, design_id: design.id }, 88)
    save.library.unshift(copy)
    cast.reward = { card: { design_id: design.id, copy_id: copy.id } }
  } else if (success) {
    const amount = cast.prize_value === 'foil' ? 1 : 2
    balance(save, { [cast.prize_value]: amount })
    cast.reward = { resources: { [cast.prize_value]: amount } }
  }
  return { cast_id: cast.id, success, reward: cast.reward }
}

function millState(save: Save) {
  const now = new Date()
  const todayUtc = today()
  save.papermill ||= { pulp: 0, cats: 0, roller: false, ink_vat: false, seconds_credit: 0, last_at: now.toISOString(), day: todayUtc, paper_today: 0, ink_today: 0, last_tap_at: null }
  const mill = save.papermill
  const sameDay = mill.day === todayUtc
  const start = sameDay ? Date.parse(mill.last_at) : Math.max(Date.parse(mill.last_at), Date.parse(`${todayUtc}T00:00:00Z`))
  const elapsed = Math.max(0, Math.min(86400, Math.floor((now.getTime() - start) / 1000)))
  if (!sameDay) { mill.seconds_credit = 0; mill.paper_today = 0; mill.ink_today = 0; mill.day = todayUtc }
  mill.seconds_credit = Math.min(86400 * 6, mill.seconds_credit + elapsed * mill.cats)
  const paper = Math.max(0, Math.min(4, Math.floor(mill.seconds_credit / (mill.roller ? 600 : 900))) - mill.paper_today)
  const ink = Math.max(0, Math.min(4, Math.floor(mill.seconds_credit / (mill.ink_vat ? 1200 : 1800))) - mill.ink_today)
  if (paper || ink) balance(save, { paper, ink })
  mill.paper_today += paper; mill.ink_today += ink; mill.last_at = now.toISOString()
  return { pulp: mill.pulp, cats: mill.cats, roller: mill.roller, ink_vat: mill.ink_vat, paper_today: mill.paper_today, ink_today: mill.ink_today, paper_limit: 4, ink_limit: 4, next_cat_cost: mill.cats < 6 ? 5 * (mill.cats + 1) : null }
}
function millAction(save: Save, action: string) {
  millState(save)
  const mill = save.papermill!
  if (action === 'tap') {
    if (mill.last_tap_at && Date.now() - Date.parse(mill.last_tap_at) < 250) fail('Let the pulper finish its stroke')
    mill.pulp += 1; mill.last_tap_at = new Date().toISOString()
  } else if (action === 'hire') {
    if (mill.cats >= 6) fail('The mill is fully staffed')
    const cost = 5 * (mill.cats + 1)
    if (mill.pulp < cost) fail('Not enough pulp')
    mill.pulp -= cost; mill.cats += 1
    const cardId = ({ 1: 'mill-apprentice', 3: 'mill-roller', 6: 'mill-master' } as Record<number, string>)[mill.cats]
    if (cardId) {
      const design = offlineDesigns().find(item => item.id === cardId) || fail('Mill card not found')
      save.library.unshift(copyOf({ ...design, design_id: design.id }, 84))
      return { ...millState(save), card_id: cardId }
    }
  } else if (action === 'roller' || action === 'ink_vat') {
    const cost = action === 'roller' ? 15 : 20
    if (mill[action]) fail('Upgrade already installed')
    if (mill.pulp < cost) fail('Not enough pulp')
    mill.pulp -= cost; mill[action] = true
  } else fail('Unknown mill action')
  return { ...millState(save), card_id: null }
}

function awardTcg(save: Save, match: LocalMatch) {
  if (match.status !== 'finished' || Object.keys(match.rewards).length) return
  const day = today()
  const claims = save.tcg_rewards || []
  const used = claims.filter(item => item.day === day).length
  const reward: { resources: Record<string, number>; copy_id: string | null; design_id?: string } = { resources: {}, copy_id: null }
  if (used < 3) {
    const sparks = match.players[0].sparks
    const paper = Math.max(1, 1 + Math.min(3, Math.floor(sparks / 2)) - 1)
    const ink = Math.max(0, Math.min(3, Math.floor(sparks / 3)) + Number(match.winner === 0) - 1)
    reward.resources = { paper, ink }
    save.resources.paper = (save.resources.paper || 0) + paper
    save.resources.ink = (save.resources.ink || 0) + ink
    if (match.winner === 0 && !claims.some(item => item.day === day && item.copy_id) && Math.random() * 100 < Math.min(65, 10 + 5 * sparks)) {
      const pool = ['tabletop-opening-hand', 'tabletop-counter-keeper', 'tabletop-playmaker', 'fish-lanternfin', 'mill-roller']
      const designId = pool[Math.floor(Math.random() * pool.length)]
      const design = offlineDesigns().find(item => item.id === designId)!
      const copy = copyOf({ ...design, design_id: design.id }, 88, `tcg:${match.code}`)
      save.library.push(copy); reward.copy_id = copy.id; reward.design_id = designId
    }
  }
  save.tcg_rewards = [...claims, { code: match.code, day, copy_id: reward.copy_id }]
  match.rewards['0'] = reward
}

export async function offlineApi<T>(path: string, method = 'GET', body?: unknown, extra?: Record<string, string>): Promise<T> {
  if (path === '/starter-decks' && method === 'GET') return offlineStarterDecks() as T
  if (path === '/auth/register' && method === 'POST') {
    if (load()) fail('An offline collection already exists')
    const deckId = (body as { starter_deck_id?: string })?.starter_deck_id
    const deck = offlineStarterDecks().find(item => item.id === deckId) || fail('Choose a starter deck to begin')
    const designs = new Map(offlineDesigns().map(design => [design.id, design]))
    const starterCards = deck.cards.flatMap(item => Array.from({ length: item.copies }, () => copyOf({ ...item, design_id: item.id }, 88)))
    const library = [
      ...starterCards,
      ...showcaseStarterIds.map(designId => {
        const design = designs.get(designId)!
        return copyOf({ ...design, design_id: design.id }, 88, 'demo_showcase')
      }),
    ]
    const learned = [...new Set(starterCards.flatMap(item => [item.type_id, item.theme_id, item.finish_id, item.border_id, item.back_id, ...item.rule_ids]))]
    const save: Save = { version: 1, starter_deck_id: deck.id, resources: { paper: 8, ink: 8, sleeve: 1, foil: 0 }, learned, library, generation_day: today(), generation_count: 0, allowance_day: null, jobs: {}, starter_tcg_upgrade: true, showcase_upgrade: true }
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
  if (path === '/tcg/matches' && method === 'GET') return mutate(current => (current.tcg_matches || []).slice(-8).reverse().map(match => { tickLocalMatch(match); awardTcg(current, match); return viewLocalMatch(match) })) as T
  if (path === '/tcg/matches' && method === 'POST') return mutate(current => {
    const request = body as { copy_ids?: string[]; format?: string; bot?: boolean }
    if (!request?.bot) fail('Online rooms are unavailable in the offline demo')
    const match = createLocalMatch(current.library, request.copy_ids || [], request.format || 'starter', id().slice(0, 6).toUpperCase())
    current.tcg_matches = [...(current.tcg_matches || []), match].slice(-30)
    return viewLocalMatch(match)
  }) as T
  const tcgMatch = path.match(/^\/tcg\/matches\/([A-Z0-9]+)(?:\/(join|actions))?$/)
  if (tcgMatch && method === 'POST' && tcgMatch[2] === 'join') fail('Online rooms are unavailable in the offline demo')
  if (tcgMatch && method === 'GET') return mutate(current => {
    const match = (current.tcg_matches || []).find(item => item.code === tcgMatch[1]) || fail('Match not found')
    tickLocalMatch(match); awardTcg(current, match); return viewLocalMatch(match)
  }) as T
  if (tcgMatch && method === 'POST' && tcgMatch[2] === 'actions') return mutate(current => {
    const match = (current.tcg_matches || []).find(item => item.code === tcgMatch[1]) || fail('Match not found')
    const request = body as { expected_revision: number; action: string; copy_id?: string; slot?: number }
    actLocalMatch(match, request.expected_revision, request.action, request.copy_id, request.slot)
    awardTcg(current, match); return viewLocalMatch(match)
  }) as T
  if (path === '/tabletop/practice' && method === 'GET') return practiceStatus(save) as T
  if (path === '/tabletop/practice' && method === 'POST') return mutate(current => practiceAction(current, body)) as T
  if (path === '/games/shooter' && method === 'GET') return shooterStatus(save) as T
  if (path === '/games/shooter/runs' && method === 'POST') return mutate(current => shooterStart(current)) as T
  const shooterMatch = path.match(/^\/games\/shooter\/runs\/([^/]+)\/(kills|boss)$/)
  if (shooterMatch && method === 'POST' && shooterMatch[2] === 'kills') return mutate(current => shooterKill(current, shooterMatch[1], (body as { enemy_index?: unknown })?.enemy_index)) as T
  if (shooterMatch && method === 'POST' && shooterMatch[2] === 'boss') return mutate(current => shooterBoss(current, shooterMatch[1])) as T
  if (path === '/games/fishing' && method === 'GET') return mutate(current => fishingState(current)) as T
  if (path === '/games/fishing/cast' && method === 'POST') return mutate(current => fishingCast(current)) as T
  if (path === '/games/fishing/reel' && method === 'POST') return mutate(current => fishingReel(current, (body as { cast_id?: unknown })?.cast_id)) as T
  if (path === '/games/papermill' && method === 'GET') return mutate(current => millState(current)) as T
  if (path === '/games/papermill/tap' && method === 'POST') return mutate(current => millAction(current, 'tap')) as T
  if (path === '/games/papermill/hire' && method === 'POST') return mutate(current => millAction(current, 'hire')) as T
  const millUpgrade = path.match(/^\/games\/papermill\/upgrades\/(roller|ink_vat)$/)
  if (millUpgrade && method === 'POST') return mutate(current => millAction(current, millUpgrade[1])) as T
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
    const sleeves = dailySleeveBonus(Math.floor(Math.random() * 100))
    const reward = { paper: 10, ink: 10, ...(sleeves ? { sleeve: sleeves } : {}) }
    balance(current, reward)
    return { reward }
  }) as T
  const actionMatch = path.match(/^\/copies\/([^/]+)\/(study|reprint|sleeve|certify|crack)$/)
  if (actionMatch && method === 'POST') return mutate(current => action(current, actionMatch[1], actionMatch[2])) as T
  return fail('This action is unavailable in the offline demo')
}
