import type { CardCopy, Part, State } from './types'

type ProgressGroup = { title: string; detail: string; parts: Part[] }

function group(title: string, detail: string, catalog: Part[], kind: string, slot?: string): ProgressGroup {
  return { title, detail, parts: catalog.filter(part => part.kind === kind && (!slot || part.slot === slot)) }
}

function percent(found: number, total: number) {
  return total ? Math.round(found * 100 / total) : 0
}

export function ProgressPage({ state, onOpenCard, onNavigate }: {
  state: State
  onOpenCard: (card: CardCopy) => void
  onNavigate: (destination: 'workshop' | 'library' | 'trading') => void
}) {
  const groups = [
    group('Card types', 'The foundations of a design', state.catalog, 'type'),
    group('Triggers', 'When a rule takes effect', state.catalog, 'rule', 'trigger'),
    group('Conditions', 'What a rule asks for', state.catalog, 'rule', 'condition'),
    group('Effects', 'What a card can do', state.catalog, 'rule', 'effect'),
    group('Art directions', 'Worlds for new illustrations', state.catalog, 'theme'),
    group('Finishes', 'How the surface catches light', state.catalog, 'finish'),
    group('Borders', 'Frames for the front', state.catalog, 'border'),
    group('Card backs', 'The reverse side of a print', state.catalog, 'back'),
  ]
  const allParts = groups.flatMap(section => section.parts)
  const learnedParts = allParts.filter(part => part.learned).length
  const distinct = new Map<string, { card: CardCopy; copies: number }>()
  for (const card of state.library) {
    const entry = distinct.get(card.design_id)
    if (entry) entry.copies += 1
    else distinct.set(card.design_id, { card, copies: 1 })
  }
  const cards = [...distinct.values()]
  const cardProgress = state.collection_progress.cards
  const completedCommissions = state.commissions.filter(brief => brief.claimed > 0).length
  const completedTrades = state.npcs.filter(offer => offer.claimed).length

  return <section className="page progress-page">
    <div className="page-intro progress-intro"><p className="eyebrow">THE COLLECTOR'S RECORD</p><h1>Your collection, <em>in progress.</em></h1>
      <p>Discover parts by studying cards. Each new design you keep in your box adds to your collection.</p></div>

    <div className="progress-hero" aria-label="Progress overview">
      <div><small>PARTS LEARNED</small><strong>{learnedParts}<span> / {allParts.length}</span></strong><p>Rules, styles, and card foundations</p></div>
      <div><small>UNIQUE DESIGNS IN YOUR BOX</small><strong>{cardProgress.collected}<span> / {cardProgress.total}</span></strong><p>{percent(cardProgress.collected, cardProgress.total)}% of designs in the world</p></div>
      <div><small>NEW EDITIONS TODAY</small><strong>{state.generation_count}<span> / {state.generation_limit}</span></strong><p>Your daily print allowance</p></div>
    </div>

    <div className="progress-activity" aria-label="Today's activity">
      <div><span>✦</span><div><strong>{state.allowance_claimed ? 'Collected' : 'Ready to collect'}</strong><small>Daily supplies</small></div></div>
      <div><span>▤</span><div><strong>{completedCommissions} / {state.commissions.length}</strong><small>Commissions started today</small></div></div>
      <div><span>⇄</span><div><strong>{completedTrades} / {state.npcs.length}</strong><small>Available NPC trades made today</small></div></div>
    </div>

    <div className="progress-section-heading"><div><p className="eyebrow">THE PARTS YOU KNOW</p><h2>Learned and still to find</h2></div><button className="secondary" onClick={() => onNavigate('trading')}>Explore trades ↗</button></div>
    <div className="progress-groups">{groups.map(section => {
      const found = section.parts.filter(part => part.learned).length
      return <section className="progress-group" key={section.title} aria-label={section.title}>
        <div className="progress-group-head"><div><h3>{section.title}</h3><p>{section.detail}</p></div><strong>{found} / {section.parts.length}</strong></div>
        <progress value={found} max={Math.max(1, section.parts.length)} aria-label={`${section.title} learned`} />
        <div className="progress-part-list">{section.parts.map(part => <div className={`progress-part ${part.learned ? 'learned' : 'missing'}`} key={part.id}>
          <span className="progress-part-mark" aria-hidden="true">{part.learned ? '✦' : '◇'}</span><div><strong>{part.name}</strong><small>{part.description}</small></div><span className="progress-part-state">{part.learned ? 'LEARNED' : 'TO FIND'}</span>
        </div>)}</div>
      </section>
    })}</div>

    <div className="progress-section-heading progress-cards-heading"><div><p className="eyebrow">YOUR DESIGNS</p><h2>Distinct cards in your box</h2></div><button className="secondary" onClick={() => onNavigate('library')}>Open library ↗</button></div>
    {cards.length ? <div className="progress-card-grid">{cards.map(({ card, copies }) => <button className="progress-card" key={card.design_id} onClick={() => onOpenCard(card)}>
      <img src={card.art_path} alt="" loading="lazy" /><span><strong>{card.name}</strong><small>{card.type_id} · {card.finish_id} · {copies} {copies === 1 ? 'copy' : 'copies'}</small></span>
    </button>)}</div> : <div className="progress-empty">Your first printed card will appear here. <button className="secondary" onClick={() => onNavigate('workshop')}>Visit the Press ↗</button></div>}
    <p className="progress-footnote">Card progress counts distinct designs currently in your box. Trading away the last copy of a design changes this count.</p>
  </section>
}
