import { useState } from 'react'
import { Card } from './Card'
import type { CardCopy, Part, ProgressCount } from './types'

export function filterLibraryCards(cards: CardCopy[], type: string) {
  return type === 'all' ? cards : cards.filter(card => card.type_id === type)
}

export function CardLibrary({ cards, catalog, cardProgress, onOpenCard, onVisitPress }: {
  cards: CardCopy[]
  catalog: Part[]
  cardProgress: ProgressCount
  onOpenCard: (card: CardCopy) => void
  onVisitPress: () => void
}) {
  const [selectedType, setSelectedType] = useState('all')
  const typeNames = new Map(catalog.filter(part => part.kind === 'type').map(part => [part.id, part.name]))
  const types = [...new Set([...typeNames.keys(), ...cards.map(card => card.type_id)])]
    .sort((a, b) => (typeNames.get(a) || a).localeCompare(typeNames.get(b) || b))
  const visibleCards = filterLibraryCards(cards, selectedType)
  const groups = types.map(type => ({ type, name: typeNames.get(type) || type, cards: visibleCards.filter(card => card.type_id === type) })).filter(group => group.cards.length > 0)
  const selectedName = typeNames.get(selectedType) || selectedType
  const complete = cardProgress.total > 0 && cardProgress.collected >= cardProgress.total

  return <section className="page library-page"><div className="page-intro row-intro"><div><p className="eyebrow">YOUR PRIVATE ARCHIVE</p><h1>{complete ? <>Your collection, <em>completed.</em></> : <>The card <em>library.</em></>}</h1><p>Every copy has a story. Open the box and take one out.</p></div><div className="collection-count"><strong>{cards.length}</strong><span>CARDS IN YOUR BOX</span></div></div>
    <div className="box-tabs" role="group" aria-label="Filter cards by type">
      <button type="button" className={selectedType === 'all' ? 'active' : ''} aria-pressed={selectedType === 'all'} onClick={() => setSelectedType('all')}>ALL CARDS <b>{cards.length}</b></button>
      {types.map(type => <button type="button" key={type} className={selectedType === type ? 'active' : ''} aria-pressed={selectedType === type} onClick={() => setSelectedType(type)}>{(typeNames.get(type) || type).toUpperCase()} <b>{cards.filter(card => card.type_id === type).length}</b></button>)}
    </div>
    {visibleCards.length ? <div className="card-box"><div className="box-lid"><div>✦ &nbsp; THE PERSONAL ARCHIVE &nbsp; ✦</div></div><div className="box-inner">{groups.map(group => <section className="box-type-group" key={group.type} aria-label={`${group.name} cards`}><div className="box-type-divider"><span aria-hidden="true">✦</span><h2>{group.name} <small>{group.cards.length}</small></h2><span aria-hidden="true">✦</span></div><div className="box-type-grid">{group.cards.map(card => <div className="boxed-card" key={card.id}><Card card={card} onClick={() => onOpenCard(card)} /><div className="box-card-label"><strong>{card.name}</strong><span>{card.slab_grade !== null ? `GRADED ${card.slab_grade}` : card.estimated_grade} · {card.finish_id}</span></div></div>)}</div></section>)}</div><div className="box-foot">HANDLE WITH CARE · PRINTED WITH WONDER</div></div>
      : <div className="empty-box"><span>▤</span>{cards.length ? <><h2>No {selectedName.toLowerCase()} cards yet.</h2><p>Choose another type or return to your full box.</p><button className="primary" onClick={() => setSelectedType('all')}>Show all cards ↗</button></> : <><h2>Your box is waiting.</h2><p>Print your first card at the press, then come back to admire it.</p><button className="primary" onClick={onVisitPress}>Visit the press ↗</button></>}</div>}
  </section>
}
