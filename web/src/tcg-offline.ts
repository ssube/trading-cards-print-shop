import type { CardCopy } from './types'

export type LocalCard = { id: string; name: string; art_path: string; type_id: string; rule_ids: string[]; rule_text: string[]; guard: number; max_guard: number; zone: 'deck' | 'hand' | 'board' | 'discard'; slot: number | null; attacked: boolean; staged_turn: number | null }
export type LocalPlayer = { user_id: number; username: string; cards: LocalCard[]; sparks: number; timeouts: number; spell_played: boolean; effect_history: [string, string][]; triggered: string[]; peek: string | null }
export type LocalMatch = { code: string; mode: 'bot'; format: string; goal: number; turn_limit: number; status: 'active' | 'finished'; revision: number; active_seat: number; turn: number; actions_left: number; deadline: string | null; winner: number | null; players: LocalPlayer[]; log: { revision: number; text: string }[]; rewards: Record<string, { resources: Record<string, number>; copy_id: string | null; design_id?: string }> }
const formats: Record<string, { goal: number; turns: number }> = { starter: { goal: 5, turns: 16 }, intermediate: { goal: 7, turns: 22 }, challenge: { goal: 10, turns: 30 } }
const lanes = [0, 0, 1, 2, 2]
const laneNames = ['Forge', 'Spotlight', 'Archive']
const effects = ['draw', 'grow', 'mend', 'glimpse', 'return', 'echo', 'shuffle']
function fail(message: string): never { throw new Error(message) }
function shuffle<T>(items: T[]) { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]] } }
function log(s: LocalMatch, text: string) { s.log.push({ revision: ++s.revision, text }); s.log = s.log.slice(-50) }
function done(s: LocalMatch) { if (s.status === 'active') for (let i = 0; i < 2; i++) if (s.players[i].sparks >= s.goal) { s.status = 'finished'; s.winner = i; s.deadline = null; log(s, `${s.players[i].username} reached ${s.goal} sparks.`); break } }
function draw(s: LocalMatch, seat: number) {
  const p = s.players[seat]
  if (p.cards.filter(c => c.zone === 'hand').length >= 5) return
  const c = p.cards.find(c => c.zone === 'deck')
  if (c) { c.zone = 'hand'; p.peek = null; trigger(s, seat, c, 'on_draw') }
}
function effect(s: LocalMatch, seat: number, source: LocalCard, kind: string, echoed = false) {
  const p = s.players[seat], enemy = s.players[1 - seat]
  const sourceName = source.zone === 'board' ? source.name : 'A drawn card'
  if (kind === 'draw') draw(s, seat)
  if (kind === 'grow') { p.sparks++; log(s, `${sourceName} gained a spark.`) }
  if (kind === 'mend') {
    const target = p.cards.filter(c => c.zone === 'board' && c.guard < c.max_guard).sort((a, b) => a.guard - b.guard || (a.slot || 0) - (b.slot || 0))[0]
    if (target) { target.guard++; log(s, `${sourceName} mended ${target.name}.`) }
  }
  if (kind === 'glimpse') p.peek = p.cards.find(c => c.zone === 'deck')?.id || null
  if (kind === 'return') {
    const lane = source.slot === null ? null : lanes[source.slot]
    const target = enemy.cards.filter(c => c.zone === 'board' && (lane === null || lanes[c.slot!] === lane)).sort((a, b) => a.slot! - b.slot!)[0]
    if (target) { target.zone = 'hand'; target.slot = null; target.guard = target.max_guard; target.staged_turn = null; log(s, `${sourceName} returned ${target.name} to hand.`) }
  }
  if (kind === 'shuffle') {
    const mixed = p.cards.filter(c => c.zone === 'deck' || c.zone === 'discard')
    shuffle(mixed); mixed.forEach(c => { c.zone = 'deck' }); p.cards = [...p.cards.filter(c => !mixed.includes(c)), ...mixed]; p.peek = null
    log(s, `${sourceName} shuffled the discard into the deck.`)
  }
  if (kind === 'echo' && !echoed) {
    const previous = [...p.effect_history].reverse().find(([id, name]) => id !== source.id && name !== 'echo')
    if (previous) effect(s, seat, source, previous[1], true)
  }
  if (kind !== 'echo' && !echoed) p.effect_history.push([source.id, kind])
  done(s)
}
function trigger(s: LocalMatch, seat: number, card: LocalCard, kind: string) {
  if (s.status !== 'active' || !card.rule_ids.includes(kind)) return
  const p = s.players[seat], key = `${s.turn}:${card.id}:${kind}`
  if (p.triggered.includes(key)) return
  p.triggered.push(key)
  if (card.rule_ids.includes('if_land') && !p.cards.some(c => c.zone === 'board' && c.type_id === 'land')) return
  if (card.rule_ids.includes('if_monster') && !p.cards.some(c => c.zone === 'board' && c.type_id === 'monster')) return
  if (card.rule_ids.includes('if_spell') && !p.spell_played) return
  const printed = card.rule_ids.find(rule => effects.includes(rule))
  if (printed) effect(s, seat, card, printed)
}
function endTurn(s: LocalMatch, timeout = false) {
  if (s.status !== 'active') return
  const seat = s.active_seat, p = s.players[seat]
  for (const c of [...p.cards].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))) if (c.zone === 'board' && c.type_id !== 'spell') { trigger(s, seat, c, 'dusk'); if (s.status !== 'active') return }
  if (timeout) { p.timeouts++; log(s, `${p.username} ran out of time.`); if (p.timeouts >= 2) { s.status = 'finished'; s.winner = 1 - seat; s.deadline = null; log(s, 'Match ended after two missed turns.'); return } } else p.timeouts = 0
  if (s.turn >= s.turn_limit) { s.status = 'finished'; s.winner = s.players[0].sparks === s.players[1].sparks ? null : s.players[0].sparks > s.players[1].sparks ? 0 : 1; s.deadline = null; log(s, 'Turn limit reached; sparks decide the match.'); return }
  s.active_seat = 1 - seat; s.turn++; s.actions_left = 2; s.deadline = new Date(Date.now() + 40_000).toISOString()
  const active = s.players[s.active_seat]; active.effect_history = []; active.triggered = []; active.spell_played = false; active.cards.forEach(c => { c.attacked = false })
  draw(s, s.active_seat)
  for (const c of [...active.cards].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))) if (c.zone === 'board' && c.type_id !== 'spell') trigger(s, s.active_seat, c, 'dawn')
  log(s, `Turn ${s.turn} began.`)
}
function act(s: LocalMatch, seat: number, action: string, copyId?: string, slot?: number) {
  if (s.status !== 'active') fail('Match is not active')
  if (s.active_seat !== seat) fail('Wait for your turn')
  if (action === 'pass') { endTurn(s); return }
  if (!s.actions_left) fail('No actions left')
  const p = s.players[seat], enemy = s.players[1 - seat], card = p.cards.find(c => c.id === copyId)
  if (!card) fail('Choose one of your cards')
  if (action === 'place') {
    if (card.zone !== 'hand') fail('Card is not in your hand')
    if (!Number.isInteger(slot) || slot! < 0 || slot! > 4 || p.cards.some(c => c.zone === 'board' && c.slot === slot)) fail('Choose an empty board slot')
    card.zone = 'board'; card.slot = slot!; card.staged_turn = card.type_id === 'spell' ? s.turn : null
    if (card.type_id === 'spell') p.spell_played = true
    else if (card.type_id === 'land' && lanes[slot!] === 2) { card.guard++; card.max_guard++ }
    log(s, `${p.username} placed ${card.name} in ${laneNames[lanes[slot!]]}.`)
    if (card.type_id !== 'spell') trigger(s, seat, card, 'arrival')
  } else if (action === 'activate') {
    if (card.zone !== 'board' || card.type_id !== 'spell') fail('Place a Spell first')
    const lane = lanes[card.slot!]
    p.spell_played = true
    trigger(s, seat, card, 'arrival')
    if (!card.rule_ids.includes('arrival')) { const printed = card.rule_ids.find(rule => effects.includes(rule)); if (printed) effect(s, seat, card, printed) }
    card.zone = 'discard'; card.slot = null; card.staged_turn = null
    log(s, `${card.name} activated and went to discard.`)
    if (lane === 1) draw(s, seat)
  } else if (action === 'attack') {
    if (card.zone !== 'board' || card.type_id !== 'monster' || card.attacked) fail('Choose a Monster that has not attacked')
    const lane = lanes[card.slot!]
    const target = enemy.cards.filter(c => c.zone === 'board' && lanes[c.slot!] === lane).sort((a, b) => a.slot! - b.slot!)[0]
    if (target) { target.guard -= lane === 0 ? 2 : 1; log(s, `${card.name} struck ${target.name}.`); if (target.guard <= 0) { target.zone = 'discard'; target.slot = null; target.guard = target.max_guard; target.staged_turn = null; log(s, `${target.name} went to discard.`) } }
    else { const gain = lane === 1 ? 2 : 1; p.sparks += gain; log(s, `${card.name} scored ${gain} spark${gain > 1 ? 's' : ''}.`) }
    card.attacked = true; done(s)
  } else if (action === 'move') {
    if (card.zone !== 'board' || !Number.isInteger(slot) || slot! < 0 || slot! > 4 || p.cards.some(c => c.zone === 'board' && c.slot === slot)) fail('Choose an empty board slot')
    card.slot = slot!; log(s, `${card.name} moved to ${laneNames[lanes[slot!]]}.`)
  } else fail('Unknown match action')
  s.actions_left--
  if (s.status === 'active' && s.actions_left === 0) endTurn(s)
}
function bot(s: LocalMatch) {
  let count = 0
  while (s.status === 'active' && s.active_seat === 1 && count++ < 5) {
    const p = s.players[1], enemy = s.players[0]
    const attacks = p.cards.filter(c => c.zone === 'board' && c.type_id === 'monster' && !c.attacked)
    attacks.sort((a, b) => Number(enemy.cards.some(c => c.zone === 'board' && lanes[c.slot!] === lanes[a.slot!])) - Number(enemy.cards.some(c => c.zone === 'board' && lanes[c.slot!] === lanes[b.slot!])) || Number(lanes[a.slot!] !== 1) - Number(lanes[b.slot!] !== 1))
    const staged = p.cards.find(c => c.zone === 'board' && c.type_id === 'spell')
    const free = [0, 1, 2, 3, 4].filter(slot => !p.cards.some(c => c.zone === 'board' && c.slot === slot))
    const hand = p.cards.filter(c => c.zone === 'hand').sort((a, b) => ({ monster: 0, land: 1, spell: 2 }[a.type_id] || 0) - ({ monster: 0, land: 1, spell: 2 }[b.type_id] || 0))
    if (attacks.length) act(s, 1, 'attack', attacks[0].id)
    else if (staged) act(s, 1, 'activate', staged.id)
    else if (hand.length && free.length) {
      const preferred = hand[0].type_id === 'monster' ? [2, 0, 1, 3, 4] : hand[0].type_id === 'land' ? [3, 4, 0, 1, 2] : [2, 1, 0, 3, 4]
      act(s, 1, 'place', hand[0].id, preferred.find(slot => free.includes(slot)))
    } else endTurn(s)
  }
}
export function createLocalMatch(library: CardCopy[], copyIds: string[], format: string, code: string): LocalMatch {
  if (!formats[format]) fail('Unknown match format')
  if (copyIds.length < 6 || copyIds.length > 12 || new Set(copyIds).size !== copyIds.length) fail('Choose 6 to 12 different copies')
  if (copyIds.length !== { starter: 6, intermediate: 8, challenge: 12 }[format]) fail('Choose the exact number of cards for this format')
  const copies = copyIds.map(id => library.find(card => card.id === id && !card.listed) || fail('Choose available cards from your box'))
  if (!copies.some(card => card.type_id === 'monster')) fail('Bring at least one Monster')
  function cards(botSide: boolean): LocalCard[] { const result = copies.map((card, index) => ({ id: botSide ? `bot-${index}-${code}` : card.id, name: card.name, art_path: card.art_path, type_id: card.type_id, rule_ids: card.rule_ids, rule_text: card.rule_text, guard: card.type_id === 'spell' ? 1 : 2, max_guard: card.type_id === 'spell' ? 1 : 2, zone: 'deck' as LocalCard['zone'], slot: null, attacked: false, staged_turn: null })); shuffle(result); result.slice(0, 3).forEach(card => { card.zone = 'hand' }); return result }
  const player = (user_id: number, username: string, botSide: boolean): LocalPlayer => ({ user_id, username, cards: cards(botSide), sparks: 0, timeouts: 0, spell_played: false, effect_history: [], triggered: [], peek: null })
  const s: LocalMatch = { code, mode: 'bot', format, goal: formats[format].goal, turn_limit: formats[format].turns, status: 'active', revision: 0, active_seat: 0, turn: 1, actions_left: 2, deadline: new Date(Date.now() + 40_000).toISOString(), winner: null, players: [player(0, 'Demo Collector', false), player(-1, 'Pressroom Bot', true)], log: [], rewards: {} }
  log(s, `Match started. First to ${s.goal} sparks wins.`); draw(s, 0)
  return s
}
export function tickLocalMatch(s: LocalMatch) { while (s.status === 'active' && s.deadline && Date.now() >= Date.parse(s.deadline)) endTurn(s, true); if (s.status === 'active' && s.active_seat === 1) bot(s) }
export function actLocalMatch(s: LocalMatch, revision: number, action: string, copyId?: string, slot?: number) { tickLocalMatch(s); if (revision !== s.revision) fail('Match changed; refresh and try again'); act(s, 0, action, copyId, slot); bot(s) }
export function viewLocalMatch(s: LocalMatch) { return { ...s, seat: 0, lanes: laneNames, players: s.players.map((p, seat) => ({ seat, user_id: p.user_id, username: p.username, sparks: p.sparks, deck_count: p.cards.filter(c => c.zone === 'deck').length, hand_count: p.cards.filter(c => c.zone === 'hand').length, discard_count: p.cards.filter(c => c.zone === 'discard').length, cards: p.cards.filter(c => c.zone === 'board' || seat === 0 && (c.zone === 'hand' || c.zone === 'discard')), peek: seat === 0 ? (() => { const card = p.cards.find(c => c.id === p.peek); return card ? { id: card.id, name: card.name } : null })() : null })) } }
