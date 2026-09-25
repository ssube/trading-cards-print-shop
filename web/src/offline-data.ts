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
  ['infernal', 'theme', 'Infernal', 'Furnace light, ember dust, and haunted machinery.'],
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
  if (id.startsWith('tabletop-')) {
    const color = id === 'tabletop-counter-keeper' ? '#c5a1db' : id === 'tabletop-playmaker' ? '#9ac7ba' : '#dfc38d'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560"><rect width="400" height="560" fill="#24333e"/><path d="M52 360l148-100 148 100-148 100z" fill="#815e4a" stroke="#ecd2a0" stroke-width="9"/><path d="M109 168l88-43 90 43v135l-90 42-88-42z" fill="${color}" stroke="#f5e7ce" stroke-width="7"/><circle cx="197" cy="220" r="31" fill="#324454"/><path d="M130 289l65 32 67-32" fill="none" stroke="#324454" stroke-width="7"/><path d="M83 435v55m234-55v55" stroke="#bc926b" stroke-width="16"/></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  }
  if (id.startsWith('demon-')) {
    const color = id === 'demon-ashwarden' ? '#c88a72' : id === 'demon-pressfiend' ? '#aa72a2' : '#eaa45d'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560"><rect width="400" height="560" fill="#251821"/><circle cx="200" cy="280" r="160" fill="#9a4238" opacity=".4"/><path d="M105 432Q77 240 138 173L90 90l98 65 48 0 78-65-50 99q63 78 31 243Z" fill="${color}" stroke="#f3c68b" stroke-width="8"/><path d="M146 248l42 20m68-20-42 20" stroke="#361923" stroke-width="16"/><path d="M142 355q58 40 116 0" fill="none" stroke="#361923" stroke-width="10"/><path d="M70 489h260" stroke="#e18b58" stroke-width="13"/></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  }
  if (id.startsWith('fish-')) {
    const color = id === 'fish-inkscale' ? '#687bd3' : id === 'fish-moonkoi' ? '#e6bca0' : '#b7dca3'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560"><rect width="400" height="560" fill="#123a4c"/><circle cx="200" cy="250" r="155" fill="#3a8195" opacity=".3"/><path d="M60 175q140-80 280 0M50 335q150 90 300 0" fill="none" stroke="#9cdddd" stroke-width="4" opacity=".5"/><path d="M90 280q105-130 230 0-125 130-230 0l-55-85v170z" fill="${color}" stroke="#ecedd8" stroke-width="7"/><circle cx="242" cy="258" r="12" fill="#183b43"/><circle cx="246" cy="254" r="3" fill="#fff"/><path d="M165 280h-45m55 28h-42" stroke="#ffffff" stroke-width="6" opacity=".5"/></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  }
  if (id.startsWith('mill-')) {
    const hue = id === 'mill-roller' ? '#85b7c5' : id === 'mill-master' ? '#f0b988' : '#dcc27e'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560"><rect width="400" height="560" fill="#213a36"/><circle cx="200" cy="220" r="140" fill="${hue}" opacity=".2"/><path d="M100 420V200l45-70 50 40 60-40 45 70v220Z" fill="${hue}" stroke="#f8eac5" stroke-width="7"/><circle cx="165" cy="245" r="9" fill="#25342f"/><circle cx="235" cy="245" r="9" fill="#25342f"/><path d="M185 286q15 20 30 0M65 440h270v60H65z" fill="none" stroke="#25342f" stroke-width="9"/><path d="M75 445h250v55H75z" fill="#efe5c8"/><path d="M140 470h120" stroke="#a89574" stroke-width="5"/></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  }
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
    design('mill-apprentice', 'The Pulp Apprentice', 'Her first proof has only three paw prints.', 'monster', ['arrival', 'draw'], 'storybook'),
    design('mill-roller', 'The Moonlit Roller', 'All night it turns; by morning, every page is softer.', 'land', ['dusk', 'grow'], 'clockwork', 'shimmer'),
    design('mill-master', 'Master of the Midnight Mill', 'A spotless apron is the surest sign of management.', 'monster', ['sleeved', 'echo'], 'storybook'),
    design('fish-lanternfin', 'Lanternfin', 'Its light arrives a moment before the fish does.', 'monster', ['arrival', 'glimpse'], 'maritime'),
    design('fish-inkscale', 'Inkscale', 'Every ripple writes a new sentence.', 'monster', ['on_draw', 'draw'], 'maritime', 'shimmer'),
    design('fish-moonkoi', 'Moon Koi', 'The pond insists the moon is one of its fish.', 'monster', ['dusk', 'grow'], 'maritime'),
    design('demon-cinderlord', 'Cinderlord of the Press', 'Even the furnace asks for a day off.', 'monster', ['arrival', 'grow'], 'infernal'),
    design('demon-ashwarden', "Ashwarden's Gate", "Its hinges were cast from yesterday's excuses.", 'land', ['dusk', 'mend'], 'infernal', 'shimmer'),
    design('demon-pressfiend', "The Pressfiend's Bargain", 'Read the fine print. Then read it again.', 'spell', ['arrival', 'return'], 'infernal'),
    design('tabletop-opening-hand', 'The Opening Hand', 'A table is an invitation waiting for its first card.', 'spell', ['arrival', 'draw'], 'absurd'),
    design('tabletop-counter-keeper', 'The Counter Keeper', 'Every number is official if you say it confidently.', 'monster', ['on_draw', 'grow'], 'clockwork', 'shimmer'),
    design('tabletop-playmaker', "The Playmaker's Table", 'Its oldest rule is to make room for another player.', 'land', ['dusk', 'mend'], 'storybook'),
    { ...cat, id: 'reward-press-cat-holo', finish_id: 'holo' },
    { ...map, id: 'reward-starlit-map-holo', finish_id: 'holo' },
    { ...fox, id: 'reward-foil-fox-holo', finish_id: 'holo' },
    { ...design('npc-borrowed-dawn', 'The Orchard of Borrowed Dawn', 'The fruit ripens only when someone needs another morning.', 'land', ['dawn', 'if_land', 'mend'], 'botanical'), id: 'reward-borrowed-dawn-holo', finish_id: 'holo' },
    { ...design('npc-clockwork-heron', 'The Clockwork Heron', "It remembers tomorrow's stars better than yesterday's roads.", 'monster', ['on_draw', 'if_monster', 'glimpse'], 'clockwork', 'shimmer', 'starlit', 'atlas'), id: 'reward-clockwork-heron-holo', finish_id: 'holo' },
    { ...design('mill-master', 'Master of the Midnight Mill', 'A spotless apron is the surest sign of management.', 'monster', ['sleeved', 'echo'], 'storybook'), id: 'reward-mill-master-holo', finish_id: 'holo' },
    { ...design('fish-moonkoi', 'Moon Koi', 'The pond insists the moon is one of its fish.', 'monster', ['dusk', 'grow'], 'maritime'), id: 'reward-moonkoi-holo', finish_id: 'holo' },
    { ...design('demon-pressfiend', "The Pressfiend's Bargain", 'Read the fine print. Then read it again.', 'spell', ['arrival', 'return'], 'infernal'), id: 'reward-pressfiend-holo', finish_id: 'holo' },
    { ...design('tabletop-playmaker', "The Playmaker's Table", 'Its oldest rule is to make room for another player.', 'land', ['dusk', 'mend'], 'storybook'), id: 'reward-playmaker-holo', finish_id: 'holo' },
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

export const discoveryIds = ['npc-starlit-map', 'npc-foil-fox', 'npc-sunlit-note', 'npc-borrowed-dawn', 'npc-clockwork-heron', 'npc-tideglass-portal', 'starter-press-cat-foil', 'npc-starlit-map-foil', 'npc-foil-fox-standard']
