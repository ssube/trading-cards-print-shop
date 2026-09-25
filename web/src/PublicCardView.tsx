import { useEffect, useState } from 'react'
import { Card } from './Card'
import { readPublicSnapshot } from './public-card'
import type { CardCopy } from './types'

export function PublicCardView({ kind, id }: { kind?: string; id?: string }) {
  const [card, setCard] = useState<CardCopy | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setCard(null); setError('')
    if (!id || kind !== 'copy' && kind !== 'snapshot') { setError('This card link is incomplete.'); return }
    const request = kind === 'snapshot' ? readPublicSnapshot(id) : fetch(`/api/public/cards/${encodeURIComponent(id)}`)
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? 'This card could not be found.' : 'This card could not be loaded.')
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The card service is unavailable. Please try again shortly.')
        return response.json() as Promise<CardCopy>
      })
    request.then(result => { if (active) setCard(result) }).catch(reason => { if (active) setError((reason as Error).message) })
    return () => { active = false }
  }, [kind, id])
  return <main className="public-card-page"><header className="public-card-header"><a href="#/workshop" className="public-card-brand"><span className="brand-seal">TC<span>:</span>PS</span><span><strong>Trading Cards:</strong><small>Print Shop</small></span></a><span>SHARED CARD</span></header>
    <section className="public-card-content">{card ? <><div className="public-card-art"><Card card={card} large interactive /></div><div className="public-card-details"><p className="eyebrow">AN EDITION FROM THE PRINT SHOP</p><h1>{card.name}</h1><p className="public-card-flavor">“{card.flavor}”</p><dl><div><dt>TYPE</dt><dd>{card.type_id}</dd></div><div><dt>FINISH</dt><dd>{card.finish_id}</dd></div><div><dt>CONDITION</dt><dd>{card.condition}%</dd></div><div><dt>GRADE</dt><dd>{card.slab_grade !== null ? `Slabbed · ${card.slab_grade}` : card.estimated_grade}</dd></div><div><dt>CREATOR</dt><dd>{card.creator || 'Archive'}</dd></div></dl><p className="public-card-rules">{card.rule_text.join(' · ')}</p><p className="public-card-note">This is a view-only card. Its owner’s collection stays private.</p><a className="primary public-card-entry" href="#/workshop">Visit the Print Shop ↗</a></div></> : <div className="public-card-loading" role={error ? 'alert' : 'status'}>{error || 'Opening this card…'}{error && <p><a href="#/workshop">Visit the Print Shop ↗</a></p>}</div>}</section>
  </main>
}
