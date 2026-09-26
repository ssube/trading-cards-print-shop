import type { CSSProperties } from 'react'

export type CardEffectLayer = { id: string; className: string; style?: CSSProperties }
export type CardEffectSurface = 'front' | 'back' | 'shell'
export type CardEffectSet = Partial<Record<CardEffectSurface, CardEffectLayer[]>>

// Layer order is paint order. The surface decides whether effects flip with a face
// or follow the whole card, including its sleeve or slab.
export function CardEffects({ surface, layers }: { surface: CardEffectSurface; layers: CardEffectLayer[] }) {
  return <>{layers.map(layer => <span key={layer.id} className={`card-effect-layer card-effect-${surface} ${layer.className}`} data-effect={layer.id} style={layer.style} aria-hidden="true" />)}</>
}
