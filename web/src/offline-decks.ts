import { offlineCatalog, offlineDesigns } from './offline-data'
import type { CardCopy, Deck, DeckAnalysis, DeckReward } from './types'

export type SavedCustomDeck = { id: string; title: string; theme: string; created_at: string }
type Definition = { id: string; title: string; theme: string; description: string; accent: string; designs: string[]; reward: { design_id?: string; slab_grade?: number; resources: Record<string, number> } }

export const curatedDecks: Definition[] = [
  { id: 'pressroom', title: 'The Pressroom Parade', theme: 'storybook', description: 'A first shift at the press, with ink on every paw.', accent: 'amber', designs: ['starter-press-cat', 'starter-press-cat-foil', 'starter-paper-sprite'], reward: { design_id: 'reward-press-cat-holo', resources: { sleeve: 1 } } },
  { id: 'starlit', title: 'The Starlit Atlas', theme: 'celestial', description: 'Three impressions to chart a sky that will not sit still.', accent: 'blue', designs: ['npc-starlit-map', 'npc-starlit-map-foil', 'starter-paper-sprite'], reward: { design_id: 'reward-starlit-map-holo', resources: { foil: 1 } } },
  { id: 'velvet', title: 'The Velvet Mischief', theme: 'absurd', description: 'A fox, a gleam, and one perfectly innocent alibi.', accent: 'rose', designs: ['npc-foil-fox', 'npc-foil-fox-standard', 'starter-paper-sprite'], reward: { design_id: 'reward-foil-fox-holo', slab_grade: 8, resources: { foil: 1 } } },
  { id: 'garden', title: 'The Borrowed Morning', theme: 'botanical', description: 'Gather a dawn, a spark of ink, and a helpful apprentice.', accent: 'green', designs: ['npc-borrowed-dawn', 'starter-paper-sprite', 'starter-press-cat'], reward: { design_id: 'reward-borrowed-dawn-holo', resources: { sleeve: 2 } } },
  { id: 'clockwork', title: 'The Clockwork Almanac', theme: 'clockwork', description: 'A heron keeps the hours while the heavens lose count.', accent: 'blue', designs: ['npc-clockwork-heron', 'npc-starlit-map', 'npc-sunlit-note'], reward: { design_id: 'reward-clockwork-heron-holo', slab_grade: 8, resources: {} } },
  { id: 'tideglass', title: 'The Tideglass Expedition', theme: 'maritime', description: 'Find a door, draw a map, and let the fox navigate.', accent: 'teal', designs: ['npc-tideglass-portal', 'npc-starlit-map', 'npc-foil-fox'], reward: { resources: { foil: 3, sleeve: 2 } } },
  { id: 'papermill', title: 'The Feline Papermill', theme: 'storybook', description: 'Three shifts, six cats, and absolutely no accounting questions.', accent: 'amber', designs: ['mill-apprentice', 'mill-roller', 'mill-master'], reward: { design_id: 'reward-mill-master-holo', resources: { sleeve: 1 } } },
  { id: 'fish', title: 'The Curious Catch', theme: 'maritime', description: 'Three rare fish from the pond behind the press.', accent: 'teal', designs: ['fish-lanternfin', 'fish-inkscale', 'fish-moonkoi'], reward: { design_id: 'reward-moonkoi-holo', resources: { foil: 1 } } },
  { id: 'demon', title: 'The Infernal Press', theme: 'infernal', description: 'Three bosses escaped the furnace. File them under occupational hazards.', accent: 'rose', designs: ['demon-cinderlord', 'demon-ashwarden', 'demon-pressfiend'], reward: { design_id: 'reward-pressfiend-holo', resources: { foil: 1, sleeve: 1 } } },
]

export function validateCustomDeck(title: unknown, theme: unknown) {
  if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 64 || title.length > 64) throw new Error('Deck title must be 1–64 characters')
  if (typeof theme !== 'string' || !offlineCatalog.some(part => part.kind === 'theme' && part.id === theme)) throw new Error('Choose an available theme')
  return { title: title.trim(), theme }
}

export function offlineDeckList(library: CardCopy[], custom: SavedCustomDeck[], claims: string[]): Deck[] {
  const designs = new Map(offlineDesigns().map(item => [item.id, item]))
  const power = new Map(offlineCatalog.filter(part => part.kind === 'rule').map(part => [part.id, part.power]))
  const definitions = [
    ...curatedDecks.map(item => ({ ...item, kind: 'curated' as const })),
    ...custom.map(item => ({ ...item, description: 'A collection challenge made by you.', accent: 'amber', designs: [] as string[], reward: null, kind: 'custom' as const })),
  ]
  return definitions.map(definition => {
    const used = new Set<string>()
    const slots = (['land', 'monster', 'spell'] as const).map((type, index) => {
      const design_id = definition.designs[index] || null
      const type_id = design_id ? null : type
      const candidates = library.filter(card => !used.has(card.id) && (design_id ? card.design_id === design_id : card.theme_id === definition.theme && card.type_id === type))
      candidates.sort((a, b) => b.grade - a.grade || b.print_score - a.print_score || a.id.localeCompare(b.id))
      const card = candidates[0] || null
      if (card) used.add(card.id)
      return { key: String(index), design_id, type_id, label: design_id ? designs.get(design_id)?.name || design_id : type[0].toUpperCase() + type.slice(1), card }
    })
    const cards = slots.flatMap(slot => slot.card ? [slot.card] : [])
    const analysis: DeckAnalysis = { type_counts: {}, finish_counts: {}, rule_counts: {}, total_power: 0, average_grade: cards.length ? Math.round(cards.reduce((sum, card) => sum + card.grade, 0) / cards.length * 10) / 10 : 0, protected: 0 }
    for (const card of cards) {
      analysis.type_counts[card.type_id] = (analysis.type_counts[card.type_id] || 0) + 1
      analysis.finish_counts[card.finish_id] = (analysis.finish_counts[card.finish_id] || 0) + 1
      analysis.protected += Number(Boolean(card.sleeved || card.slab_grade !== null))
      for (const rule of card.rule_ids) { analysis.rule_counts[rule] = (analysis.rule_counts[rule] || 0) + 1; analysis.total_power += power.get(rule) || 0 }
    }
    let reward: DeckReward | null = null
    if (definition.reward) {
      const info = definition.reward
      const design = info.design_id ? designs.get(info.design_id) : null
      reward = { resources: info.resources, card: design ? { design_id: design.id, name: design.name, finish_id: design.finish_id, slab_grade: info.slab_grade || null } : null }
    }
    return { id: definition.id, kind: definition.kind, title: definition.title, theme: definition.theme, description: definition.description,
      accent: definition.accent, slots, filled: cards.length, total: 3, claimed: claims.includes(definition.id), reward, analysis }
  })
}
