import type { Part, StarterDeck } from './types'

type Design = Omit<StarterDeck['cards'][number], 'copies'>

const rules = [
  ['arrival', 'On arrival', 'When this enters play', 1, 'trigger'],
  ['dusk', 'At dusk', 'At the end of a turn', 1, 'trigger'],
  ['sleeved', 'While protected', 'While this card is protected', 1, 'trigger'],
  ['if_land', 'If you control a land', 'If you control a land', 1, 'condition'],
  ['draw', 'Draw a card', 'Draw one card', 2, 'effect'],
  ['grow', 'Gain a spark', 'Gain one spark', 2, 'effect'],
  ['echo', 'Echo a skill', 'Repeat another skill once', 3, 'effect'],
  ['dawn', 'At dawn', 'At the start of a turn', 1, 'trigger'],
  ['on_draw', 'When you draw', 'When you draw a card', 1, 'trigger'],
  ['if_monster', 'If you control a Monster', 'If you control a Monster', 1, 'condition'],
  ['if_spell', 'If you played a Spell', 'If you played a Spell this turn', 1, 'condition'],
  ['mend', 'Restore a spark', 'Restore one spark to a chosen card', 2, 'effect'],
  ['glimpse', 'Glimpse ahead', 'Look at the next card in your deck', 2, 'effect'],
  ['return', 'Return a card', "Return a card to its owner's hand", 2, 'effect'],
] as const

const others = [
  ['land', 'type', 'Land', 'A place with a stubborn opinion.'],
  ['monster', 'type', 'Monster', 'A creature ready for a future battle.'],
  ['spell', 'type', 'Spell', 'A moment of concentrated mischief.'],
  ['storybook', 'theme', 'Storybook', 'Painterly magic and gentle oddities.'],
  ['celestial', 'theme', 'Celestial', 'Stars, instruments, and impossible skies.'],
  ['absurd', 'theme', 'Absurdist', 'A very serious illustration of a silly idea.'],
  ['botanical', 'theme', 'Botanical', 'Enchanted gardens, living paper, and gentle wilds.'],
  ['clockwork', 'theme', 'Clockwork', 'Brass mechanisms and curious inventions.'],
  ['maritime', 'theme', 'Maritime', 'Tidal magic, sea glass, and impossible harbors.'],
  ['standard', 'finish', 'Standard', 'Soft matte print.'],
  ['shimmer', 'finish', 'Shimmer', 'A narrow, shifting foil gleam.'],
  ['holo', 'finish', 'Full Holo', 'An extravagant prismatic surface.'],
  ['classic', 'border', 'Classic Gilt', 'Warm paper and a gilt frame.'],
  ['starlit', 'border', 'Starlit Filigree', 'A midnight frame traced with stars.'],
  ['velvet', 'border', 'Velvet Scrollwork', 'A rose and ink ornamental frame.'],
  ['archive', 'back', 'Archive Seal', 'The original press seal.'],
  ['atlas', 'back', 'Atlas Compass', 'A compass for impossible places.'],
  ['mischief', 'back', 'Fox Masquerade', 'A playful mark from the Foil Fox.'],
] as const

export const offlineCatalog: Part[] = [
  ...others.map(([id, kind, name, description]) => ({ id, kind, name, description, power: 0, slot: '', cost_json: kind === 'finish' ? JSON.stringify({ foil: id === 'holo' ? 3 : id === 'shimmer' ? 1 : 0 }) : '{}', learned: 0 })),
  ...rules.map(([id, name, description, power, slot]) => ({ id, kind: 'rule', name, description, power, slot, cost_json: '{}', learned: 0 })),
]

function art(id: string) {
  return new URL(`demo-art/${id}.png`, document.baseURI).href
}

function design(id: string, name: string, flavor: string, type_id: string, rule_ids: string[], theme_id: string, finish_id = 'standard', border_id = 'classic', back_id = 'archive', artId = id): Design {
  return { id, name, flavor, type_id, rule_ids, theme_id, finish_id, border_id, back_id, art_path: art(artId) }
}

export function offlineDesigns(): Design[] {
  const cat = design('starter-press-cat', 'Apprentice Press Cat', 'He insists every proof needs one more paw print.', 'monster', ['arrival', 'draw'], 'storybook')
  const map = design('npc-starlit-map', 'The Map of Unfinished Constellations', "A place for every star, except the one you're looking for.", 'land', ['dusk', 'grow'], 'celestial', 'standard', 'starlit', 'atlas')
  const fox = design('npc-foil-fox', 'The Foil Fox', 'The trick was never the shine. It was where you looked.', 'monster', ['sleeved', 'echo'], 'absurd', 'shimmer', 'velvet', 'mischief')
  return [
    cat,
    { ...cat, id: 'starter-press-cat-foil', finish_id: 'shimmer' },
    design('starter-paper-sprite', "Paper Sprite's First Drop", 'Every great edition begins with a borrowed drop.', 'spell', ['arrival', 'draw'], 'storybook'),
    map,
    { ...map, id: 'npc-starlit-map-foil', finish_id: 'shimmer' },
    fox,
    { ...fox, id: 'npc-foil-fox-standard', finish_id: 'standard' },
    design('npc-sunlit-note', 'A Note from the Sun', 'Please return the moon by Thursday.', 'spell', ['arrival', 'draw'], 'celestial', 'holo', 'starlit', 'atlas'),
    design('npc-borrowed-dawn', 'The Orchard of Borrowed Dawn', 'The fruit ripens only when someone needs another morning.', 'land', ['dawn', 'if_land', 'mend'], 'botanical'),
    design('npc-clockwork-heron', 'The Clockwork Heron', "It remembers tomorrow's stars better than yesterday's roads.", 'monster', ['on_draw', 'if_monster', 'glimpse'], 'clockwork', 'shimmer', 'starlit', 'atlas'),
    design('npc-tideglass-portal', 'The Tideglass Portal', 'Every shore has a door that the tide remembers.', 'spell', ['arrival', 'if_spell', 'return'], 'maritime', 'standard', 'starlit', 'atlas'),
  ]
}

export function offlineStarterDecks(): StarterDeck[] {
  const designs = new Map(offlineDesigns().map(item => [item.id, item]))
  const cards = (...ids: string[]) => ids.map(id => ({ ...designs.get(id)!, copies: 1 }))
  return [
    { id: 'pressroom', name: 'The Pressroom Parade', theme: 'Storybook workshop', accent: 'amber', description: 'A cheerful crew of paper and ink learns the craft one impression at a time.', featured: 'starter-press-cat', cards: cards('starter-press-cat', 'starter-press-cat-foil', 'starter-paper-sprite') },
    { id: 'starlit', name: 'The Starlit Atlas', theme: 'Celestial cartography', accent: 'blue', description: 'Follow unfinished constellations and print places that should not fit on a map.', featured: 'npc-starlit-map', cards: cards('npc-starlit-map', 'npc-starlit-map-foil', 'starter-paper-sprite') },
    { id: 'velvet', name: 'The Velvet Mischief', theme: 'Absurdist foil', accent: 'rose', description: 'A sly fox proves that a little mischief looks even better under foil.', featured: 'npc-foil-fox', cards: cards('npc-foil-fox', 'npc-foil-fox-standard', 'starter-paper-sprite') },
  ]
}

export const discoveryIds = ['npc-starlit-map', 'npc-foil-fox', 'npc-sunlit-note', 'npc-borrowed-dawn', 'npc-clockwork-heron', 'npc-tideglass-portal']
